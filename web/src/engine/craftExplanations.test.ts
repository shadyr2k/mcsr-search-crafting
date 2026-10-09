import { describe, expect, test, vi } from 'vitest'
import type { CraftingRecipe, RankedSearch, RecipeResultCollection, SearchItem, TargetWorkspaceEntry } from '../domain/types'
import { createCraftExplanationResolver } from './craftExplanations'

function fixture() {
  const items = new Map<string, SearchItem>([
    ['minecraft:white_bed', { id: 'minecraft:white_bed', name: 'Weißes Bett', confidence: 'exact', searchLines: [{ source: 'name', text: 'Weißes Bett' }] }],
    ['minecraft:brown_bed', { id: 'minecraft:brown_bed', name: 'Braunes Bett', confidence: 'exact', searchLines: [{ source: 'name', text: 'Braunes Bett' }] }],
  ])
  const recipes: CraftingRecipe[] = [{
    id: 'white-bed', recipeGroup: 'bed', recipeBookCategory: 'crafting_misc',
    resultCollectionId: 'beds', outputItemId: 'minecraft:white_bed', outputCount: 1,
    ingredientSlots: [{ acceptedItems: ['minecraft:white_wool'] }], fits2x2: false, fits3x3: true,
  }]
  const collections = new Map<string, RecipeResultCollection>([['beds', {
    id: 'beds', recipeGroup: 'bed', recipeBookCategory: 'crafting_misc',
    recipeIds: ['white-bed'], outputItemIds: [...items.keys()],
  }]])
  const entry: TargetWorkspaceEntry = {
    id: 'test', targetIds: ['minecraft:white_bed'], inventoryItemIds: ['minecraft:white_wool'],
    enabled: true, gridSize: 3, order: 0,
  }
  const step: RankedSearch['steps'][number] = {
    query: 'raun', retainedPrefix: 'ra', typedSuffix: 'un', freeBackspaceCount: 1,
    coveredTargetIds: ['minecraft:white_bed'], newTargetIds: ['minecraft:white_bed'], junkItemIds: [], explanations: [],
    score: { typingPenalty: 2, junkPresencePenalty: 0, junkCountPenalty: 0, total: 2 },
  }
  return { items, recipes, collections, entry, step }
}

describe('cached craft explanations', () => {
  test('lazily rebuilds full overlap queries and collection aliases without mutating the cache', () => {
    const { items, recipes, collections, entry, step } = fixture()
    const reads = vi.spyOn(items, 'get')
    const resolve = createCraftExplanationResolver(items, recipes, collections, entry, false)
    expect(reads).not.toHaveBeenCalled()
    const explanations = resolve(step)
    expect(explanations).toEqual([expect.objectContaining({
      query: 'raun', matchedMemberItemId: 'minecraft:brown_bed', visibleOutputItemId: 'minecraft:white_bed',
      line: 'Braunes Bett', matchedSpan: { start: 1, end: 5, text: 'raun' },
    })])
    reads.mockClear()
    expect(resolve(step)).toEqual(explanations)
    expect(reads).not.toHaveBeenCalled()
    expect(resolve({ ...step, coveredTargetIds: [] })).toEqual([])
    expect(step.explanations).toEqual([])
    expect(resolve({ ...step, explanations })).toBe(explanations)
  })

  test('respects inventory and grid eligibility', () => {
    const { items, recipes, collections, entry, step } = fixture()
    for (const unavailable of [{ ...entry, inventoryItemIds: [] }, { ...entry, gridSize: 2 as const }]) {
      expect(createCraftExplanationResolver(items, recipes, collections, unavailable, false)(step)).toEqual([])
    }
  })

  test('uses the same item ID search setting as the cached calculation', () => {
    const { items, recipes, collections, entry, step } = fixture()
    const idStep = { ...step, query: ':brown' }
    expect(createCraftExplanationResolver(items, recipes, collections, entry, false)(idStep)).toEqual([])
    expect(createCraftExplanationResolver(items, recipes, collections, entry, true)(idStep)).toEqual([
      expect.objectContaining({ line: 'brown_bed', matchedSpan: { start: 0, end: 5, text: 'brown' } }),
    ])
  })
})
