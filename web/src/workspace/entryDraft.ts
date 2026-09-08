import type {
  CraftingRecipe,
  InventoryPreset,
  ItemSetDraft,
  TargetWorkspaceEntry,
} from '../domain/types'

function sortedUnique(itemIds: readonly string[]): string[] {
  return [...new Set(itemIds)].sort()
}

export function newItemSetDraft(): ItemSetDraft {
  return { targetIds: [], inventoryItemIds: [], enabled: true, gridSize: 3, retainCraftOrder: false }
}

export function draftFromEntry(entry: TargetWorkspaceEntry): ItemSetDraft {
  return {
    sourceEntryId: entry.id,
    targetIds: [...entry.targetIds],
    inventoryItemIds: [...entry.inventoryItemIds],
    enabled: entry.enabled,
    gridSize: entry.gridSize,
    retainCraftOrder: entry.retainCraftOrder === true,
  }
}

export function applyInventoryPreset(
  draft: ItemSetDraft,
  preset: Pick<InventoryPreset, 'itemIds'>,
): ItemSetDraft {
  return { ...draft, inventoryItemIds: sortedUnique(preset.itemIds) }
}

export function canDraftUse2x2(draft: ItemSetDraft, recipes: readonly CraftingRecipe[]): boolean {
  return draft.targetIds.every((targetId) => recipes.some((recipe) => (
    recipe.outputItemId === targetId && recipe.fits2x2
  )))
}

export function normalizeDraftGrid(
  draft: ItemSetDraft,
  recipes: readonly CraftingRecipe[],
): ItemSetDraft {
  return draft.gridSize === 2 && !canDraftUse2x2(draft, recipes)
    ? { ...draft, gridSize: 3 }
    : draft
}

export function validateItemSetDraft(
  draft: ItemSetDraft,
  items?: ReadonlyMap<string, { id: string }>,
  inventoryItems?: ReadonlyMap<string, { id: string }>,
): boolean {
  return typeof draft.enabled === 'boolean'
    && (draft.gridSize === 2 || draft.gridSize === 3)
    && (draft.retainCraftOrder === undefined || typeof draft.retainCraftOrder === 'boolean')
    && draft.targetIds.length > 0
    && draft.targetIds.every((itemId) => typeof itemId === 'string' && itemId.length > 0)
    && draft.inventoryItemIds.every((itemId) => typeof itemId === 'string' && itemId.length > 0)
    && (draft.sourceEntryId === undefined || typeof draft.sourceEntryId === 'string')
    && (items === undefined || draft.targetIds.every((itemId) => items.has(itemId)))
    && (inventoryItems === undefined || draft.inventoryItemIds.every((itemId) => inventoryItems.has(itemId)))
}
