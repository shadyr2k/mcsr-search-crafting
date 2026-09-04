import { describe, expect, test } from 'vitest'

import type { CraftingRecipe, TargetWorkspaceEntry } from '../domain/types'
import {
  applyInventoryPreset,
  canDraftUse2x2,
  draftFromEntry,
  newItemSetDraft,
  normalizeDraftGrid,
  validateItemSetDraft,
} from './entryDraft'

const recipes: CraftingRecipe[] = [{
  id: 'minecraft:iron_sword',
  recipeGroup: null,
  recipeBookCategory: 'crafting_equipment',
  resultCollectionId: 'crafting_equipment/recipe/sword',
  outputItemId: 'minecraft:iron_sword',
  outputCount: 1,
  ingredientSlots: [{ acceptedItems: ['minecraft:iron_ingot'] }],
  fits2x2: false,
  fits3x3: true,
}]

const savedEntry: TargetWorkspaceEntry = {
  id: 'saved',
  targetIds: ['minecraft:iron_sword'],
  inventoryItemIds: ['minecraft:iron_ingot'],
  enabled: true,
  gridSize: 2,
  order: 3,
}

describe('item set drafts', () => {
  test('defaults new drafts to an enabled empty 3x3 item set', () => {
    expect(newItemSetDraft()).toEqual({
      targetIds: [], inventoryItemIds: [], enabled: true, gridSize: 3,
    })
  })

  test('forces incompatible 2x2 drafts to 3x3 without a message', () => {
    const normalized = normalizeDraftGrid({ ...newItemSetDraft(), gridSize: 2, targetIds: ['minecraft:iron_sword'] }, recipes)

    expect(normalized.gridSize).toBe(3)
    expect(canDraftUse2x2(normalized, recipes)).toBe(false)
  })

  test('copies arrays when opening and applying a preset', () => {
    const preset = { id: 'tools', name: 'Tools', itemIds: ['minecraft:oak_log'] }
    const draft = draftFromEntry(savedEntry)
    const changed = applyInventoryPreset(draft, preset)
    changed.inventoryItemIds.push('minecraft:stick')

    expect(savedEntry.inventoryItemIds).not.toContain('minecraft:stick')
    expect(preset.itemIds).not.toContain('minecraft:stick')
  })

  test('requires at least one target and a valid draft shape before saving', () => {
    expect(validateItemSetDraft(newItemSetDraft())).toBe(false)
    expect(validateItemSetDraft({ ...newItemSetDraft(), targetIds: ['minecraft:stick'] })).toBe(true)
    expect(validateItemSetDraft({ ...newItemSetDraft(), targetIds: ['minecraft:stick'], gridSize: 4 as 2 })).toBe(false)
  })
})
