import { describe, expect, test } from 'vitest'

import type {
  CraftingRecipe,
  GeneratedData,
  RecipeResultCollection,
  SearchItem,
  TargetWorkspaceEntry,
} from '../domain/types'
import { incompleteScore } from './scoring'
import { aggregateLocaleScore, optimizeWorkspace, optimizeWorkspaceEntry } from './optimizeWorkspace'

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
    recipeGroup: null,
    recipeBookCategory: 'crafting_misc',
    resultCollectionId: `crafting_misc/recipe/${encodeURIComponent(outputItemId)}`,
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
  return { id, targetIds, inventoryItemIds: [], enabled: true, gridSize: 3, order: 0, ...overrides }
}

const alpha = item('target:alpha', 'ax')
const beta = item('target:beta', 'by')
const hidden = item('target:hidden', 'qz')
function generatedData(items: SearchItem[], recipes: CraftingRecipe[]): GeneratedData {
  return {
    schemaVersion: 3,
    items: new Map(items.map((searchItem) => [searchItem.id, searchItem])),
    inventoryItems: new Map([['ingredient:shared', { id: 'ingredient:shared', name: 'Shared ingredient' }]]),
    recipes,
    collections: new Map(recipes.map((craftingRecipe) => [craftingRecipe.resultCollectionId, {
      id: craftingRecipe.resultCollectionId,
      recipeBookCategory: craftingRecipe.recipeBookCategory,
      recipeGroup: craftingRecipe.recipeGroup,
      recipeIds: [craftingRecipe.id],
      outputItemIds: [craftingRecipe.outputItemId],
    }])),
    presets: new Map(),
  }
}

function groupedCollection(
  id: string,
  recipes: CraftingRecipe[],
  outputItemIds: string[],
  recipeGroup: string,
): RecipeResultCollection {
  return {
    id,
    recipeBookCategory: 'crafting_misc',
    recipeGroup,
    recipeIds: recipes.map(({ id: recipeId }) => recipeId),
    outputItemIds,
  }
}

function aliasFixture(): {
  data: GeneratedData
  inventory: Set<string>
  whiteBedId: string
  whiteCarpetId: string
} {
  const brownBed = item('minecraft:brown_bed', 'Brown Bed')
  const whiteBed = item('minecraft:white_bed', 'Ivory Rest')
  const brownCarpet = item('minecraft:brown_carpet', 'Brown Carpet')
  const whiteCarpet = item('minecraft:white_carpet', 'Ivory Rug')
  const bedRecipes = [
    { ...recipe(brownBed.id, true), id: 'recipe:brown_bed', resultCollectionId: 'collection:bed', ingredientSlots: [{ acceptedItems: ['ingredient:missing'] }] },
    { ...recipe(whiteBed.id, true), id: 'recipe:white_bed', resultCollectionId: 'collection:bed', ingredientSlots: [{ acceptedItems: ['ingredient:bed'] }] },
  ]
  const carpetRecipes = [
    { ...recipe(brownCarpet.id, true), id: 'recipe:brown_carpet', resultCollectionId: 'collection:carpet', ingredientSlots: [{ acceptedItems: ['ingredient:missing'] }] },
    { ...recipe(whiteCarpet.id, true), id: 'recipe:white_carpet', resultCollectionId: 'collection:carpet', ingredientSlots: [{ acceptedItems: ['ingredient:carpet'] }] },
  ]
  const recipes = [...bedRecipes, ...carpetRecipes]

  return {
    data: {
      schemaVersion: 3,
      items: new Map([brownBed, whiteBed, brownCarpet, whiteCarpet].map((searchItem) => [
        searchItem.id,
        searchItem,
      ])),
      inventoryItems: new Map([
        ['ingredient:bed', { id: 'ingredient:bed', name: 'Bed ingredient' }],
        ['ingredient:carpet', { id: 'ingredient:carpet', name: 'Carpet ingredient' }],
      ]),
      recipes,
      collections: new Map([
        ['collection:bed', groupedCollection(
          'collection:bed',
          bedRecipes,
          [brownBed.id, whiteBed.id],
          'bed',
        )],
        ['collection:carpet', groupedCollection(
          'collection:carpet',
          carpetRecipes,
          [brownCarpet.id, whiteCarpet.id],
          'carpet',
        )],
      ]),
      presets: new Map(),
    },
    inventory: new Set(['ingredient:bed', 'ingredient:carpet']),
    whiteBedId: whiteBed.id,
    whiteCarpetId: whiteCarpet.id,
  }
}

const data = generatedData([alpha, beta, hidden], [recipe(alpha.id, true), recipe(beta.id, false)])
const inventory = new Set(['ingredient:shared'])

describe('optimizeWorkspace', () => {
  test('exposes bounded individual alternatives beyond ten without treating other targets as junk', async () => {
    const bed = item('minecraft:bed', 'abcdef bed')
    const anchor = item('minecraft:anchor', 'abcdef anchor')
    const fixture = generatedData([bed, anchor], [recipe(bed.id, true), recipe(anchor.id, true)])
    const result = await optimizeWorkspaceEntry(fixture, entry('bed-anchor', [bed.id, anchor.id], {
      inventoryItemIds: ['ingredient:shared'],
    }))
    expect(result.kind).toBe('ranked')
    if (result.kind !== 'ranked') throw new Error('Expected complete craft choices')
    expect(result.itemSearches?.[bed.id].length).toBeGreaterThan(10)
    expect(result.itemSearches?.[bed.id].some((search) => search.queries[0] === 'bed')).toBe(true)
    expect(result.itemSearches?.[bed.id].every((search) => search.queries[0].length <= 5)).toBe(true)
    expect(result.itemSearches?.[bed.id].find((search) => search.queries[0] === 'abcde')).toMatchObject({
      coveredTargetIds: [bed.id], totalJunkAppearances: 0,
    })
  })

  test('adds colon-prefixed item-ID alternatives only when the setting is enabled', async () => {
    const ironSword = item('minecraft:iron_sword', 'Iron Sword')
    const fixture = generatedData([ironSword], [recipe(ironSword.id, true)])
    const result = await optimizeWorkspaceEntry(fixture, entry('sword', [ironSword.id], {
      inventoryItemIds: ['ingredient:shared'],
    }), { itemIdSearch: true })

    expect(result.kind).toBe('ranked')
    if (result.kind !== 'ranked') throw new Error('Expected complete craft choices')
    expect(result.itemSearches?.[ironSword.id].some((search) => search.queries[0] === ':on_sw')).toBe(true)
  })

  test('optimizes each entry from only its own exact inventory', async () => {
    const craftable = await optimizeWorkspaceEntry(data, entry('craftable', [alpha.id], {
      inventoryItemIds: ['ingredient:shared'],
    }))
    const empty = await optimizeWorkspaceEntry(data, entry('empty', [alpha.id], {
      inventoryItemIds: [],
    }))

    expect(craftable.kind).toBe('ranked')
    expect(empty).toMatchObject({
      kind: 'no-viable',
      bestScore: incompleteScore(1, 0),
    })
  })

  test('does not convert an unexpected optimizer rejection into no-viable', async () => {
    const corruptData = { ...data, collections: new Map() }

    await expect(optimizeWorkspaceEntry(corruptData, entry('corrupt', [alpha.id], {
      inventoryItemIds: ['ingredient:shared'],
    }))).rejects.toThrow()
  })

  test('preserves enabled empty sets as non-scoring editor state', async () => {
    const result = await optimizeWorkspace(data, inventory, [
      entry('empty', [], { order: 0 }),
      entry('scored', [alpha.id], { order: 1 }),
    ])

    expect(result.entries.map(({ entryId }) => entryId)).toEqual(['scored'])
    expect(result.entries[0].displayIndex).toBe(1)
    expect(result.skippedEmptyEntryCount).toBe(1)
    expect(result.aggregateScore).toBe(result.entries[0].bestScore)
  })

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

  test('calculates a locale score from each enabled entry using its own inventory', async () => {
    const entries = [
      entry('craftable', [alpha.id], { inventoryItemIds: ['ingredient:shared'] }),
      entry('unavailable', [alpha.id], { inventoryItemIds: [] }),
      entry('disabled', [hidden.id], { enabled: false }),
    ]

    const score = await aggregateLocaleScore(data, entries, { yieldControl: async () => {} })

    expect(score).toBe(incompleteScore(1, 0))
  })

  test('uses the lower overlap score when both complete categories exist at different scores', async () => {
    const first = item('target:first', 'ax')
    const second = item('target:second', 'ay')
    const junk = item('junk:common-a', 'a')
    const competingData = generatedData(
      [first, second, junk],
      [recipe(first.id, true), recipe(second.id, true), recipe(junk.id, true)],
    )

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

  test('optimizes collection aliases while keeping visible output and junk IDs exact', async () => {
    const alias = aliasFixture()

    const result = await optimizeWorkspace(
      alias.data,
      alias.inventory,
      [entry('bed', [alias.whiteBedId])],
    )
    const aliasResult = result.entries[0].single.find(({ query }) => query === 'wn')

    expect(aliasResult).toMatchObject({
      coveredTargetIds: [alias.whiteBedId],
      junkItemIds: [alias.whiteCarpetId],
    })
    expect(aliasResult?.explanations).toContainEqual(expect.objectContaining({
      matchedMemberItemId: 'minecraft:brown_bed',
      visibleOutputItemId: alias.whiteBedId,
    }))
    expect(result.entries[0].visibleItemIds).toEqual([alias.whiteBedId, alias.whiteCarpetId])
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

  test('aborts cooperatively during one large entry and reports within-entry progress', async () => {
    const controller = new AbortController()
    const phases: string[] = []
    let yieldCount = 0

    const pending = optimizeWorkspace(data, inventory, [entry('large', [alpha.id, beta.id])], {
      signal: controller.signal,
      workChunkSize: 1,
      onProgress: (progress) => phases.push(progress.phase),
      yieldControl: async () => {
        yieldCount += 1
        controller.abort()
      },
    })

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(yieldCount).toBeGreaterThan(0)
    expect(phases).toContain('matching')
  })

  test('cancels during member matching before the eligible collection reports completion', async () => {
    const targetItem = item('target:visible', 'Ivory Rest')
    const aliases = Array.from(
      { length: 100 },
      (_, index) => item(`alias:${index.toString().padStart(3, '0')}`, `Alias ${index} target`),
    )
    const targetRecipe = {
      ...recipe(targetItem.id, true),
      id: 'recipe:visible',
      resultCollectionId: 'collection:large',
    }
    const aliasRecipes = aliases.map((alias, index) => ({
      ...recipe(alias.id, true),
      id: `recipe:alias:${index.toString().padStart(3, '0')}`,
      resultCollectionId: 'collection:large',
      ingredientSlots: [{ acceptedItems: ['ingredient:missing'] }],
    }))
    const largeData: GeneratedData = {
      schemaVersion: 3,
      items: new Map([targetItem, ...aliases].map((searchItem) => [searchItem.id, searchItem])),
      inventoryItems: data.inventoryItems,
      recipes: [targetRecipe, ...aliasRecipes],
      collections: new Map([['collection:large', groupedCollection(
        'collection:large',
        [targetRecipe, ...aliasRecipes],
        [targetItem.id, ...aliases.map(({ id }) => id)],
        'large',
      )]]),
      presets: new Map(),
    }
    const controller = new AbortController()
    const matchingProgress: Array<[number, number | undefined]> = []

    const pending = optimizeWorkspace(
      largeData,
      inventory,
      [entry('large-collection', [targetItem.id])],
      {
        signal: controller.signal,
        workChunkSize: 1,
        onProgress: ({ phase, completed, total }) => {
          if (phase === 'matching') matchingProgress.push([completed, total])
        },
        yieldControl: async () => { controller.abort() },
      },
    )

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(matchingProgress.length).toBeGreaterThan(1)
    expect(matchingProgress[0][1]).toBeGreaterThan(1)
    expect(new Set(matchingProgress.map(([completed]) => completed))).toEqual(new Set([0]))
  })

  test('is deterministic across repeated and differently ordered equivalent inputs', async () => {
    const alias = aliasFixture()
    const entries = [entry('aliases', [alias.whiteBedId, alias.whiteCarpetId])]
    const expected = await optimizeWorkspace(alias.data, alias.inventory, entries)
    const reversedCollections = new Map([...alias.data.collections].reverse())
    const reversedMembers = new Map([...alias.data.collections].map(([collectionId, value]) => [
      collectionId,
      { ...value, recipeIds: [...value.recipeIds].reverse(), outputItemIds: [...value.outputItemIds].reverse() },
    ]))
    const variants: Array<{
      data: GeneratedData
      inventory: Set<string>
      entries: TargetWorkspaceEntry[]
    }> = [
      { data: { ...alias.data, recipes: [...alias.data.recipes].reverse() }, inventory: alias.inventory, entries },
      { data: { ...alias.data, collections: reversedCollections }, inventory: alias.inventory, entries },
      { data: { ...alias.data, collections: reversedMembers }, inventory: alias.inventory, entries },
      { data: alias.data, inventory: alias.inventory, entries: [entry('aliases', [...entries[0].targetIds].reverse())] },
      { data: alias.data, inventory: new Set([...alias.inventory].reverse()), entries },
    ]

    expect(await optimizeWorkspace(alias.data, alias.inventory, entries)).toEqual(expected)
    for (const variant of variants) {
      expect(await optimizeWorkspace(variant.data, variant.inventory, variant.entries)).toEqual(expected)
    }
  })

})
