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
  /** Row-major recipe cells; null cells preserve gaps in shaped recipes. */
  ingredientLayout?: Array<IngredientSlot | null>
  /** Dimensions of the trimmed recipe pattern, used to retain its orientation. */
  width?: number
  height?: number
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

export interface LanguageMetadata {
  locale: string
  name: string
  region: string
  script: 'latin' | 'non_latin'
}

export interface LanguageInfoEntry {
  id: string
  key: string
  english: string
  requirementKey?: string
  englishRequirement?: string
}

export interface LanguageInfoSection {
  id: string
  entries: LanguageInfoEntry[]
}

export interface LocalizedLanguageInfoValue {
  name: string
  requirement?: string
}

export interface LocalizedLanguageInfo {
  sections: LanguageInfoSection[]
  locales: Map<string, Map<string, Map<string, LocalizedLanguageInfoValue>>>
}

export type LanguageScoreState =
  | { status: 'pending' }
  | { status: 'ready'; score: number }
  | { status: 'unavailable' }
  | { status: 'disabled' }

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
  inventoryItemIds: string[]
  enabled: boolean
  gridSize: 2 | 3
  /** Limit overlap paths to the targets' displayed, insertion order. */
  retainCraftOrder?: boolean
  order: number
}

export interface TargetWorkspace {
  entries: TargetWorkspaceEntry[]
}

/**
 * A user's override for one calculated item-set craft on the crafting sheet.
 * Omitting `craftKey` means that the sheet should use its calculated default.
 */
export interface CraftingSheetSelection {
  /** Identifies the item-set inputs that produced this saved choice. */
  entryFingerprint?: string
  craftKey?: string
  disabled?: boolean
  /** Legacy saved mode, retained only to restore pre-unification choices. */
  mode?: 'combined' | 'individual'
  itemCraftKeys?: Record<string, string>
  itemOrder?: string[]
}

/** Crafting-sheet overrides are independent for every selected language. */
export interface CraftingSheetPreferences {
  selectionsByLocale: Record<string, Record<string, CraftingSheetSelection>>
}

export type ItemSetDraft = Omit<TargetWorkspaceEntry, 'id' | 'order'> & {
  sourceEntryId?: string
}

export interface RankedSearchStep {
  query: string
  retainedPrefix: string
  freeBackspaceCount: number
  typedSuffix: string
  coveredTargetIds: string[]
  newTargetIds: string[]
  junkItemIds: string[]
  explanations: import('../engine/search').CollectionMatchExplanation[]
  score: {
    typingPenalty: number
    junkPresencePenalty: number
    junkCountPenalty: number
    total: number
  }
}

export interface RankedSearch {
  kind: 'single' | 'overlap'
  queries: string[]
  steps: RankedSearchStep[]
  coveredTargetIds: string[]
  totalJunkAppearances: number
  totalTypedCharacters: number
  totalScore: number
}

export type EntryOptimizationOutcome =
  | {
      kind: 'ranked'
      entryId: string
      rankedSearches: RankedSearch[]
      bestScore: number
      visibleItemIds: string[]
      /** All bounded, independent queries, reusing the item's prepared matches. */
      itemSearches?: Record<string, RankedSearch[]>
    }
  | {
      kind: 'no-viable'
      entryId: string
      rankedSearches: []
      bestScore: number
      visibleItemIds: string[]
      matchedTargetIds: string[]
      unmatchedTargetIds: string[]
    }

export type RowOptimizationState =
  | { status: 'idle' }
  | { status: 'pending'; fingerprint: string; progress?: import('../engine/optimizeWorkspace').WorkspaceOptimizationProgress }
  | { status: 'ready'; fingerprint: string; outcome: EntryOptimizationOutcome }
  | { status: 'error'; fingerprint: string; message: string }
