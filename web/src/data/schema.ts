import type {
  CraftingRecipe,
  GeneratedData,
  IngredientSlot,
  InventoryItem,
  InventoryPreset,
  RecipeBookCategory,
  RecipeResultCollection,
  SearchItem,
  SearchLine,
} from '../domain/types'

type JsonRecord = Record<string, unknown>
const GENERATED_SCHEMA_VERSION = 3

interface IndexedRecipe {
  recipe: CraftingRecipe
  sourceIndex: number
}

interface IndexedCollection {
  collection: RecipeResultCollection
  sourceIndex: number
}

export class GeneratedDataError extends Error {
  readonly errors: readonly string[]

  constructor(errors: readonly string[]) {
    super(`Generated data validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`)
    this.name = 'GeneratedDataError'
    this.errors = errors
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRecipeBookCategory(value: unknown): value is RecipeBookCategory {
  return value === 'crafting_building_blocks'
    || value === 'crafting_equipment'
    || value === 'crafting_redstone'
    || value === 'crafting_misc'
}

function getRecord(value: unknown, path: string, errors: string[]): JsonRecord | undefined {
  if (!isRecord(value)) {
    errors.push(`${path}: expected an object`)
    return undefined
  }
  return value
}

function getNonEmptyString(value: unknown, path: string, errors: string[]): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${path}: expected a non-empty string`)
    return undefined
  }
  return value
}

function getNullableGroup(value: unknown, path: string, errors: string[]): string | null | undefined {
  if (value === null) return null
  if (typeof value !== 'string' || value === '') {
    errors.push(`${path}: expected a non-empty string`)
    return undefined
  }
  return value
}

function getRecipeBookCategory(
  value: unknown,
  path: string,
  errors: string[],
): RecipeBookCategory | undefined {
  if (!isRecipeBookCategory(value)) {
    errors.push(`${path}: expected a valid recipe book category`)
    return undefined
  }
  return value
}

function getPositiveInteger(value: unknown, path: string, errors: string[]): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    errors.push(`${path}: expected a positive integer`)
    return undefined
  }
  return value
}

function getBoolean(value: unknown, path: string, errors: string[]): boolean | undefined {
  if (typeof value !== 'boolean') {
    errors.push(`${path}: expected a boolean`)
    return undefined
  }
  return value
}

function parseUniqueStringArray(value: unknown, path: string, errors: string[]): string[] | undefined {
  if (!Array.isArray(value)) {
    errors.push(`${path}: expected an array`)
    return undefined
  }

  const strings: string[] = []
  const seen = new Set<string>()
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`
    const string = getNonEmptyString(entry, entryPath, errors)
    if (string === undefined) return
    if (seen.has(string)) {
      errors.push(`${entryPath}: duplicate value ${string}`)
      return
    }
    seen.add(string)
    strings.push(string)
  })

  return strings.length === value.length ? strings : undefined
}

function parseSearchLines(value: unknown, path: string, errors: string[]): SearchLine[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path}: expected a non-empty array`)
    return undefined
  }

  const lines: SearchLine[] = []
  value.forEach((line, index) => {
    const linePath = `${path}[${index}]`
    const record = getRecord(line, linePath, errors)
    if (!record) return

    const source = getNonEmptyString(record.source, `${linePath}.source`, errors)
    const text = getNonEmptyString(record.text, `${linePath}.text`, errors)
    if (source !== undefined && text !== undefined) {
      lines.push({ source, text })
    }
  })

  return lines.length === value.length ? lines : undefined
}

function parseItems(value: unknown, errors: string[]): Map<string, SearchItem> {
  const root = getRecord(value, 'items', errors)
  if (!root) return new Map()

  if (root.schema_version !== GENERATED_SCHEMA_VERSION) {
    errors.push(`items.schema_version: expected ${GENERATED_SCHEMA_VERSION}`)
  }

  const itemRecords = getRecord(root.items, 'items.items', errors)
  const items = new Map<string, SearchItem>()
  if (!itemRecords) return items

  Object.entries(itemRecords).forEach(([id, rawItem]) => {
    const itemPath = `items.items.${id}`
    const validId = getNonEmptyString(id, itemPath, errors)
    const record = getRecord(rawItem, itemPath, errors)
    if (!record || validId === undefined) return

    const name = getNonEmptyString(record.name, `${itemPath}.name`, errors)
    const confidence = getNonEmptyString(record.confidence, `${itemPath}.confidence`, errors)
    const searchLines = parseSearchLines(record.search_lines, `${itemPath}.search_lines`, errors)
    if (name !== undefined && confidence !== undefined && searchLines !== undefined) {
      items.set(validId, { id: validId, name, confidence, searchLines })
    }
  })

  return items
}

function parseInventoryItems(value: unknown, errors: string[]): Map<string, InventoryItem> {
  const root = getRecord(value, 'inventoryItems', errors)
  if (!root) return new Map()

  if (root.schema_version !== GENERATED_SCHEMA_VERSION) {
    errors.push(`inventoryItems.schema_version: expected ${GENERATED_SCHEMA_VERSION}`)
  }

  const itemRecords = getRecord(root.items, 'inventoryItems.items', errors)
  const items = new Map<string, InventoryItem>()
  if (!itemRecords) return items

  Object.entries(itemRecords).forEach(([id, rawItem]) => {
    const itemPath = `inventoryItems.items.${id}`
    const validId = getNonEmptyString(id, itemPath, errors)
    const record = getRecord(rawItem, itemPath, errors)
    if (!record || validId === undefined) return

    const name = getNonEmptyString(record.name, `${itemPath}.name`, errors)
    if (name !== undefined) items.set(validId, { id: validId, name })
  })

  return items
}

function parseInventoryPresets(
  value: unknown,
  inventoryItems: Map<string, InventoryItem>,
  errors: string[],
): Map<string, InventoryPreset> {
  const root = getRecord(value, 'inventoryPresets', errors)
  if (!root) return new Map()

  if (root.schema_version !== GENERATED_SCHEMA_VERSION) {
    errors.push(`inventoryPresets.schema_version: expected ${GENERATED_SCHEMA_VERSION}`)
  }
  if (!Array.isArray(root.presets)) {
    errors.push('inventoryPresets.presets: expected an array')
    return new Map()
  }

  const presets = new Map<string, InventoryPreset>()
  const names = new Set<string>()
  root.presets.forEach((rawPreset, index) => {
    const presetPath = `presets[${index}]`
    const record = getRecord(rawPreset, presetPath, errors)
    if (!record) return

    const id = getNonEmptyString(record.id, `${presetPath}.id`, errors)
    const name = getNonEmptyString(record.name, `${presetPath}.name`, errors)
    const itemIds = parseUniqueStringArray(record.item_ids, `${presetPath}.item_ids`, errors)
    if (itemIds !== undefined && itemIds.length === 0) {
      errors.push(`${presetPath}.item_ids: expected a non-empty array`)
    }
    if (id !== undefined && presets.has(id)) {
      errors.push(`${presetPath}.id: duplicate preset ID ${id}`)
    }
    if (name !== undefined && names.has(name)) {
      errors.push(`${presetPath}.name: duplicate preset name ${name}`)
    }
    itemIds?.forEach((itemId, itemIndex) => {
      if (!inventoryItems.has(itemId)) {
        errors.push(`${presetPath}.item_ids[${itemIndex}]: references missing inventory item ${itemId}`)
      }
    })
    if (
      id !== undefined
      && name !== undefined
      && itemIds !== undefined
      && itemIds.length > 0
      && !presets.has(id)
      && !names.has(name)
    ) {
      presets.set(id, { id, name, itemIds })
      names.add(name)
    }
  })

  return presets
}

function parseIngredientSlots(value: unknown, path: string, errors: string[]): IngredientSlot[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path}: expected a non-empty array`)
    return undefined
  }

  const slots: IngredientSlot[] = []
  value.forEach((slot, index) => {
    const slotPath = `${path}[${index}]`
    const record = getRecord(slot, slotPath, errors)
    if (!record) return

    const acceptedItems = parseUniqueStringArray(record.accepted_items, `${slotPath}.accepted_items`, errors)
    if (acceptedItems === undefined || acceptedItems.length === 0) {
      if (acceptedItems !== undefined) {
        errors.push(`${slotPath}.accepted_items: expected a non-empty array`)
      }
      return
    }
    slots.push({ acceptedItems })
  })

  return slots.length === value.length ? slots : undefined
}

function parseRecipes(value: unknown, errors: string[]): IndexedRecipe[] {
  const root = getRecord(value, 'recipes', errors)
  if (!root) return []

  if (root.schema_version !== GENERATED_SCHEMA_VERSION) {
    errors.push(`recipes.schema_version: expected ${GENERATED_SCHEMA_VERSION}`)
  }
  if (!Array.isArray(root.recipes)) {
    errors.push('recipes.recipes: expected an array')
    return []
  }

  const recipes: IndexedRecipe[] = []
  const recipeIds = new Set<string>()
  root.recipes.forEach((rawRecipe, index) => {
    const recipePath = `recipes[${index}]`
    const record = getRecord(rawRecipe, recipePath, errors)
    if (!record) return

    const id = getNonEmptyString(record.id, `${recipePath}.id`, errors)
    if (id !== undefined) {
      if (recipeIds.has(id)) {
        errors.push(`${recipePath}.id: duplicate recipe ID ${id}`)
      }
      recipeIds.add(id)
    }

    const recipeGroup = getNullableGroup(record.recipe_group, `${recipePath}.recipe_group`, errors)
    const recipeBookCategory = getRecipeBookCategory(
      record.recipe_book_category,
      `${recipePath}.recipe_book_category`,
      errors,
    )
    const resultCollectionId = getNonEmptyString(
      record.result_collection_id,
      `${recipePath}.result_collection_id`,
      errors,
    )
    const outputItemId = getNonEmptyString(record.output_item_id, `${recipePath}.output_item_id`, errors)
    const outputCount = getPositiveInteger(record.output_count, `${recipePath}.output_count`, errors)
    const ingredientSlots = parseIngredientSlots(record.ingredient_slots, `${recipePath}.ingredient_slots`, errors)
    const fits2x2 = getBoolean(record.fits_2x2, `${recipePath}.fits_2x2`, errors)
    const fits3x3 = getBoolean(record.fits_3x3, `${recipePath}.fits_3x3`, errors)

    if (fits2x2 === false && fits3x3 === false) {
      errors.push(`${recipePath}: must fit at least one crafting grid`)
    }

    if (
      id !== undefined
      && recipeGroup !== undefined
      && recipeBookCategory !== undefined
      && resultCollectionId !== undefined
      && outputItemId !== undefined
      && outputCount !== undefined
      && ingredientSlots !== undefined
      && fits2x2 !== undefined
      && fits3x3 !== undefined
    ) {
      recipes.push({
        recipe: {
          id,
          recipeGroup,
          recipeBookCategory,
          resultCollectionId,
          outputItemId,
          outputCount,
          ingredientSlots,
          fits2x2,
          fits3x3,
        },
        sourceIndex: index,
      })
    }
  })

  return recipes
}

function parseCollections(value: unknown, errors: string[]): IndexedCollection[] {
  const root = getRecord(value, 'collections', errors)
  if (!root) return []

  if (root.schema_version !== GENERATED_SCHEMA_VERSION) {
    errors.push(`collections.schema_version: expected ${GENERATED_SCHEMA_VERSION}`)
  }
  if (!Array.isArray(root.collections)) {
    errors.push('collections.collections: expected an array')
    return []
  }

  const collections: IndexedCollection[] = []
  const collectionIds = new Set<string>()
  root.collections.forEach((rawCollection, index) => {
    const collectionPath = `collections[${index}]`
    const record = getRecord(rawCollection, collectionPath, errors)
    if (!record) return

    const id = getNonEmptyString(record.id, `${collectionPath}.id`, errors)
    if (id !== undefined) {
      if (collectionIds.has(id)) {
        errors.push(`${collectionPath}.id: duplicate collection ID ${id}`)
      }
      collectionIds.add(id)
    }

    const recipeBookCategory = getRecipeBookCategory(
      record.recipe_book_category,
      `${collectionPath}.recipe_book_category`,
      errors,
    )
    const recipeGroup = getNullableGroup(record.recipe_group, `${collectionPath}.recipe_group`, errors)
    const recipeIds = parseUniqueStringArray(record.recipe_ids, `${collectionPath}.recipe_ids`, errors)
    const outputItemIds = parseUniqueStringArray(record.output_item_ids, `${collectionPath}.output_item_ids`, errors)

    if (
      id !== undefined
      && recipeBookCategory !== undefined
      && recipeGroup !== undefined
      && recipeIds !== undefined
      && outputItemIds !== undefined
    ) {
      collections.push({
        collection: { id, recipeBookCategory, recipeGroup, recipeIds, outputItemIds },
        sourceIndex: index,
      })
    }
  })

  return collections
}

function validateRecipeReferences(
  recipes: IndexedRecipe[],
  items: Map<string, SearchItem>,
  inventoryItems: Map<string, InventoryItem>,
  errors: string[],
) {
  recipes.forEach(({ recipe, sourceIndex }) => {
    const recipePath = `recipes[${sourceIndex}]`
    // Search-item records are generated for recipe outputs. Ingredient IDs can be
    // valid Minecraft items without an independently searchable output record.
    if (!items.has(recipe.outputItemId)) {
      errors.push(`${recipePath}.output_item_id: references missing item ${recipe.outputItemId}`)
    }
    recipe.ingredientSlots.forEach((slot, slotIndex) => {
      slot.acceptedItems.forEach((itemId, itemIndex) => {
        if (!inventoryItems.has(itemId)) {
          errors.push(
            `${recipePath}.ingredient_slots[${slotIndex}].accepted_items[${itemIndex}]: `
            + `references missing inventory item ${itemId}`,
          )
        }
      })
    })
  })
}

function validateCollectionGraph(
  recipes: IndexedRecipe[],
  collections: IndexedCollection[],
  items: Map<string, SearchItem>,
  errors: string[],
) {
  const recipesById = new Map(recipes.map((recipe) => [recipe.recipe.id, recipe]))
  const collectionsById = new Map(collections.map((collection) => [collection.collection.id, collection]))
  const membershipCounts = new Map(recipes.map(({ recipe }) => [recipe.id, 0]))
  const groupedCollectionPaths = new Map<string, string>()

  collections.forEach(({ collection, sourceIndex }) => {
    const collectionPath = `collections[${sourceIndex}]`
    const memberOutputItemIds = new Set<string>()
    if (collection.recipeIds.length === 0) {
      errors.push(`${collectionPath}.recipe_ids: expected a non-empty array`)
    }
    if (collection.outputItemIds.length === 0) {
      errors.push(`${collectionPath}.output_item_ids: expected a non-empty array`)
    }
    if (collection.recipeGroup === null) {
      if (collection.recipeIds.length !== 1) {
        errors.push(`${collectionPath}.recipe_ids: null-group collections must contain exactly one recipe`)
      }
    } else {
      const groupKey = `${collection.recipeBookCategory}\u0000${collection.recipeGroup}`
      const priorCollectionPath = groupedCollectionPaths.get(groupKey)
      if (priorCollectionPath) {
        errors.push(`${collectionPath}.recipe_group: duplicates category/group collection at ${priorCollectionPath}`)
      } else {
        groupedCollectionPaths.set(groupKey, collectionPath)
      }
    }
    collection.recipeIds.forEach((recipeId, recipeIndex) => {
      const recipe = recipesById.get(recipeId)
      const recipeIdPath = `${collectionPath}.recipe_ids[${recipeIndex}]`
      if (!recipe) {
        errors.push(`${recipeIdPath}: references missing recipe ${recipeId}`)
        return
      }

      membershipCounts.set(recipeId, (membershipCounts.get(recipeId) ?? 0) + 1)
      memberOutputItemIds.add(recipe.recipe.outputItemId)
      if (recipe.recipe.resultCollectionId !== collection.id) {
        errors.push(`${recipeIdPath}: recipe references collection ${recipe.recipe.resultCollectionId}`)
      }
      if (recipe.recipe.recipeBookCategory !== collection.recipeBookCategory) {
        errors.push(`recipes[${recipe.sourceIndex}].recipe_book_category: disagrees with collection ${collection.id}`)
      }
      if (recipe.recipe.recipeGroup !== collection.recipeGroup) {
        errors.push(`recipes[${recipe.sourceIndex}].recipe_group: disagrees with collection ${collection.id}`)
      }
    })

    collection.outputItemIds.forEach((outputItemId, outputIndex) => {
      if (!items.has(outputItemId)) {
        errors.push(`${collectionPath}.output_item_ids[${outputIndex}]: references missing item ${outputItemId}`)
      }
    })
    if (
      collection.outputItemIds.length !== memberOutputItemIds.size
      || collection.outputItemIds.some((outputItemId) => !memberOutputItemIds.has(outputItemId))
    ) {
      errors.push(`${collectionPath}.output_item_ids: does not match member recipe outputs`)
    }
  })

  recipes.forEach(({ recipe, sourceIndex }) => {
    const recipePath = `recipes[${sourceIndex}]`
    if (!collectionsById.has(recipe.resultCollectionId)) {
      errors.push(`${recipePath}.result_collection_id: references missing collection ${recipe.resultCollectionId}`)
    }
    const membershipCount = membershipCounts.get(recipe.id) ?? 0
    if (membershipCount === 0) {
      errors.push(`${recipePath}.id: is not referenced by a collection`)
    } else if (membershipCount > 1) {
      errors.push(`${recipePath}.id: is referenced by multiple collections`)
    }
  })
}

export function parseGeneratedData(
  itemsPayload: unknown,
  inventoryItemsPayload: unknown,
  recipesPayload: unknown,
  collectionsPayload: unknown,
  inventoryPresetsPayload: unknown,
): GeneratedData {
  const errors: string[] = []
  const items = parseItems(itemsPayload, errors)
  const inventoryItems = parseInventoryItems(inventoryItemsPayload, errors)
  const presets = parseInventoryPresets(inventoryPresetsPayload, inventoryItems, errors)
  const indexedRecipes = parseRecipes(recipesPayload, errors)
  const indexedCollections = parseCollections(collectionsPayload, errors)
  validateRecipeReferences(indexedRecipes, items, inventoryItems, errors)
  validateCollectionGraph(indexedRecipes, indexedCollections, items, errors)

  if (errors.length > 0) {
    throw new GeneratedDataError(errors)
  }

  return {
    schemaVersion: GENERATED_SCHEMA_VERSION,
    items,
    inventoryItems,
    recipes: indexedRecipes.map(({ recipe }) => recipe),
    collections: new Map(indexedCollections.map(({ collection }) => [collection.id, collection])),
    presets,
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new GeneratedDataError([`${url}: fetch failed with ${response.status} ${response.statusText}`])
  }

  try {
    return await response.json()
  } catch {
    throw new GeneratedDataError([`${url}: response is not valid JSON`])
  }
}

export async function loadGeneratedData(baseUrl = import.meta.env.BASE_URL): Promise<GeneratedData> {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const [itemsPayload, inventoryItemsPayload, recipesPayload, collectionsPayload, inventoryPresetsPayload] = await Promise.all([
    fetchJson(`${base}data/search-items.json`),
    fetchJson(`${base}data/inventory-items.json`),
    fetchJson(`${base}data/crafting-recipes.json`),
    fetchJson(`${base}data/recipe-result-collections.json`),
    fetchJson(`${base}data/inventory-presets.json`),
  ])
  return parseGeneratedData(
    itemsPayload,
    inventoryItemsPayload,
    recipesPayload,
    collectionsPayload,
    inventoryPresetsPayload,
  )
}
