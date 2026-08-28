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

export interface IngredientSlot {
  acceptedItems: string[]
}

export interface CraftingRecipe {
  id: string
  outputItemId: string
  outputCount: number
  ingredientSlots: IngredientSlot[]
  fits2x2: boolean
  fits3x3: boolean
}

export interface GeneratedData {
  schemaVersion: 1
  items: Map<string, SearchItem>
  recipes: CraftingRecipe[]
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
