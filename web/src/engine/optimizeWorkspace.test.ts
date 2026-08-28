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
    expect(result.entries[0].visibleItemIds).toEqual([alpha.id])
    expect(result.entries[0].incomplete?.unmatchedTargetIds).toEqual([beta.id])
    expect(result.entries[1].visibleItemIds).toEqual([alpha.id, beta.id])
    expect(result.entries[1].single).not.toHaveLength(0)
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

  test('honors an aborted optimization request before publishing results', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(optimizeWorkspace(data, inventory, [entry('cancelled', [alpha.id])], {
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' })
  })
})
