export interface SearchLine {
  source: string
  text: string
}

export interface SearchItem {
  id: string
  name: string
  searchLines: SearchLine[]
  confidence: string
}

export interface InventoryItem {
  id: string
  name: string
}

export interface IngredientSlot {
  acceptedItems: string[]
}

export interface CraftingRecipe {
  id: string
  recipeGroup: string | null
  recipeBookCategory: RecipeBookCategory
  resultCollectionId: string
  outputItemId: string
  outputCount: number
  ingredientSlots: IngredientSlot[]
  fits2x2: boolean
  fits3x3: boolean
}

export type RecipeBookCategory =
  | 'crafting_building_blocks'
  | 'crafting_equipment'
  | 'crafting_redstone'
  | 'crafting_misc'

export interface RecipeResultCollection {
  id: string
  recipeBookCategory: RecipeBookCategory
  recipeGroup: string | null
  recipeIds: string[]
  outputItemIds: string[]
}

export interface GeneratedData {
  schemaVersion: 3
  items: Map<string, SearchItem>
  inventoryItems: Map<string, InventoryItem>
  recipes: CraftingRecipe[]
  collections: Map<string, RecipeResultCollection>
  presets: Map<string, InventoryPreset>
}

export interface InventoryPreset {
  id: string
  name: string
  itemIds: string[]
}

export interface CustomInventoryPreset {
  name: string
  itemIds: string[]
}

export interface TargetWorkspaceEntry {
  id: string
  targetIds: string[]
  enabled: boolean
  gridSize: 2 | 3
  order: number
}

export interface TargetWorkspace {
  entries: TargetWorkspaceEntry[]
}
