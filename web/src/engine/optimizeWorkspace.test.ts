import { describe, expect, test } from 'vitest'

import type { CraftingRecipe, GeneratedData, SearchItem, TargetWorkspaceEntry } from '../domain/types'
import { incompleteScore } from './scoring'
import { optimizeWorkspace } from './optimizeWorkspace'

function item(id: string, text: string): SearchItem {
  return {
    id,
    name: text,
    confidence: 'source_reproduced',
    searchLines: [{ source: 'name', text }],
  }
}

function recipe(outputItemId: string, fits2x2: boolean): CraftingRecipe {
  return {
    id: `recipe:${outputItemId}`,
    outputItemId,
    outputCount: 1,
    ingredientSlots: [{ acceptedItems: ['ingredient:shared'] }],
    fits2x2,
    fits3x3: true,
  }
}

function entry(
  id: string,
  targetIds: string[],
  overrides: Partial<TargetWorkspaceEntry> = {},
): TargetWorkspaceEntry {
  return { id, targetIds, enabled: true, gridSize: 3, order: 0, ...overrides }
}

const alpha = item('target:alpha', 'ax')
const beta = item('target:beta', 'by')
const hidden = item('target:hidden', 'qz')
const data: GeneratedData = {
  schemaVersion: 1,
  items: new Map([alpha, beta, hidden].map((searchItem) => [searchItem.id, searchItem])),
  recipes: [recipe(alpha.id, true), recipe(beta.id, false)],
}
const inventory = new Set(['ingredient:shared'])

describe('optimizeWorkspace', () => {
  test('excludes disabled entries and computes each enabled grid independently', async () => {
    const result = await optimizeWorkspace(data, inventory, [
      entry('two-by-two', [beta.id], { gridSize: 2, order: 0 }),
      entry('three-by-three', [beta.id], { gridSize: 3, order: 1 }),
      entry('disabled', [alpha.id], { enabled: false, order: 2 }),
    ])

    expect(result.entries.map(({ entryId }) => entryId)).toEqual(['two-by-two', 'three-by-three'])
    expect(result.entries.map(({ displayIndex }) => displayIndex)).toEqual([0, 1])
    expect(result.entries[0].visibleItemIds).toEqual([alpha.id])
    expect(result.entries[0].incomplete?.unmatchedTargetIds).toEqual([beta.id])
    expect(result.entries[1].visibleItemIds).toEqual([alpha.id, beta.id])
    expect(result.entries[1].single).not.toHaveLength(0)
  })

  test('derives display labels from full workspace positions even when stored orders have gaps', async () => {
    const afterDeletion = await optimizeWorkspace(data, inventory, [
      entry('remaining', [alpha.id], { order: 4 }),
    ])
    const withDisabledPredecessor = await optimizeWorkspace(data, inventory, [
      entry('disabled-first', [alpha.id], { enabled: false, order: 0 }),
      entry('enabled-second', [alpha.id], { order: 1 }),
    ])

    expect(afterDeletion.entries[0].displayIndex).toBe(0)
    expect(withDisabledPredecessor.entries[0].displayIndex).toBe(1)
  })

  test('keeps complete categories separate and promotes overlap when no single query completes', async () => {
    const result = await optimizeWorkspace(data, inventory, [entry('overlap-only', [alpha.id, beta.id])])
    const optimized = result.entries[0]

    expect(optimized.single).toEqual([])
    expect(optimized.overlap).not.toHaveLength(0)
    expect(optimized.availableCompleteMethod).toBe('overlap')
    expect(optimized.incomplete).toBeNull()
    expect(optimized.bestScore).toBe(optimized.overlap[0].score.total)
  })

  test('uses the deterministic maximum failure score when neither complete category succeeds', async () => {
    const result = await optimizeWorkspace(data, inventory, [entry('incomplete', [alpha.id, hidden.id])])
    const optimized = result.entries[0]

    expect(optimized.single).toEqual([])
    expect(optimized.overlap).toEqual([])
    expect(optimized.incomplete).toEqual({
      matchedTargetIds: [alpha.id],
      unmatchedTargetIds: [hidden.id],
      score: incompleteScore(2, 2),
    })
    expect(optimized.bestScore).toBe(incompleteScore(2, 2))
  })

  test('aggregates each enabled entry lowest complete category score or full failure score', async () => {
    const result = await optimizeWorkspace(data, inventory, [
      entry('single', [alpha.id], { order: 0 }),
      entry('overlap', [alpha.id, beta.id], { order: 1 }),
      entry('failure', [hidden.id], { order: 2 }),
      entry('ignored', [hidden.id], { enabled: false, order: 3 }),
    ])
    const contributions = result.entries.map(({ bestScore }) => bestScore)

    expect(result.aggregateScore).toBe(contributions[0] + contributions[1] + incompleteScore(1, 2))
    expect(result.aggregateScore).toBe(contributions.reduce((sum, score) => sum + score, 0))
  })

  test('uses the lower overlap score when both complete categories exist at different scores', async () => {
    const first = item('target:first', 'ax')
    const second = item('target:second', 'ay')
    const junk = item('junk:common-a', 'a')
    const competingData: GeneratedData = {
      schemaVersion: 1,
      items: new Map([first, second, junk].map((searchItem) => [searchItem.id, searchItem])),
      recipes: [recipe(first.id, true), recipe(second.id, true), recipe(junk.id, true)],
    }

    const result = await optimizeWorkspace(competingData, inventory, [
      entry('competing', [first.id, second.id]),
    ])
    const optimized = result.entries[0]

    expect(optimized.single[0].score.total).toBe(2.5)
    expect(optimized.overlap[0].score.total).toBe(1)
    expect(optimized.availableCompleteMethod).toBe('overlap')
    expect(optimized.bestScore).toBe(1)
    expect(result.aggregateScore).toBe(1)
  })

  test('honors an aborted optimization request before publishing results', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(optimizeWorkspace(data, inventory, [entry('cancelled', [alpha.id])], {
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' })
  })

  test('aborts a superseded request while it is yielding between entries', async () => {
    const controller = new AbortController()
    let releaseYield!: () => void
    let markYieldStarted!: () => void
    const yieldStarted = new Promise<void>((resolve) => { markYieldStarted = resolve })
    const yieldGate = new Promise<void>((resolve) => { releaseYield = resolve })
    const pending = optimizeWorkspace(data, inventory, [
      entry('first', [alpha.id], { order: 0 }),
      entry('second', [beta.id], { order: 1 }),
    ], {
      signal: controller.signal,
      yieldControl: () => {
        markYieldStarted()
        return yieldGate
      },
    })

    await yieldStarted
    controller.abort()
    releaseYield()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  test('is deterministic across repeated and differently ordered equivalent inputs', async () => {
    const entries = [
      entry('second', [beta.id, alpha.id], { order: 1 }),
      entry('first', [alpha.id], { order: 0 }),
    ]
    const reorderedData: GeneratedData = {
      ...data,
      items: new Map([...data.items].reverse()),
      recipes: [...data.recipes].reverse(),
    }

    const first = await optimizeWorkspace(data, new Set([...inventory]), entries)
    const repeated = await optimizeWorkspace(data, new Set([...inventory]), entries)
    const reordered = await optimizeWorkspace(
      reorderedData,
      new Set([...inventory].reverse()),
      [...entries].reverse().map((workspaceEntry) => ({
        ...workspaceEntry,
        targetIds: [...workspaceEntry.targetIds].reverse(),
      })),
    )

    expect(repeated).toEqual(first)
    expect(reordered).toEqual(first)
  })
})
