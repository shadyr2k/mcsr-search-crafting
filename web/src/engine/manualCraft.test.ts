import { describe, expect, test } from 'vitest'

import type { GeneratedData, TargetWorkspaceEntry } from '../domain/types'
import { DEFAULT_SCORING_SETTINGS } from './scoring'
import { normalizeManualCraftQuery, validateManualItemCraft } from './manualCraft'

const targetId = 'minecraft:oak_planks'
const junkId = 'minecraft:stone'
const entry: TargetWorkspaceEntry = {
  id: 'building', targetIds: [targetId], inventoryItemIds: [], enabled: true, gridSize: 3, order: 0,
}
const data: GeneratedData = {
  schemaVersion: 3,
  items: new Map([
    [targetId, { id: targetId, name: 'Oak Planks', confidence: 'exact', searchLines: [{ source: 'name', text: 'Oak Planks' }] }],
    [junkId, { id: junkId, name: 'Stone', confidence: 'exact', searchLines: [{ source: 'name', text: 'Stone' }] }],
  ]),
  inventoryItems: new Map(),
  recipes: [
    { id: 'oak_planks', recipeGroup: null, recipeBookCategory: 'crafting_building_blocks', resultCollectionId: 'collection:building', outputItemId: targetId, outputCount: 1, ingredientSlots: [], fits2x2: true, fits3x3: true },
    { id: 'stone', recipeGroup: null, recipeBookCategory: 'crafting_building_blocks', resultCollectionId: 'collection:building', outputItemId: junkId, outputCount: 1, ingredientSlots: [], fits2x2: true, fits3x3: true },
  ],
  collections: new Map([['collection:building', {
    id: 'collection:building', recipeBookCategory: 'crafting_building_blocks', recipeGroup: null, recipeIds: ['oak_planks', 'stone'], outputItemIds: [targetId, junkId],
  }]]),
  presets: new Map(),
}

describe('validateManualItemCraft', () => {
  test('checks one typed query without enumerating alternatives and returns its actual junk', () => {
    const search = validateManualItemCraft(data, entry, targetId, 'oak_p', DEFAULT_SCORING_SETTINGS, false)

    expect(search).toMatchObject({
      queries: ['oak p'],
      coveredTargetIds: [targetId],
      totalJunkAppearances: 1,
    })
    expect(search?.steps[0].junkItemIds).toEqual([junkId])
    expect(validateManualItemCraft(data, entry, targetId, 'zzz', DEFAULT_SCORING_SETTINGS, false)).toBeUndefined()
  })

  test('does not rewrite underscores inside an item-ID query', () => {
    expect(normalizeManualCraftQuery(':oak_pl')).toBe(':oak_pl')
  })
})
