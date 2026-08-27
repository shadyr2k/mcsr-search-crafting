import type {
  CraftingRecipe,
  GeneratedData,
  IngredientSlot,
  SearchItem,
  SearchLine,
} from '../domain/types'

type JsonRecord = Record<string, unknown>

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

  if (root.schema_version !== 1) {
    errors.push('items.schema_version: expected 1')
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

    if (!Array.isArray(record.accepted_items) || record.accepted_items.length === 0) {
      errors.push(`${slotPath}.accepted_items: expected a non-empty array`)
      return
    }

    const acceptedItems: string[] = []
    record.accepted_items.forEach((item, itemIndex) => {
      const itemId = getNonEmptyString(item, `${slotPath}.accepted_items[${itemIndex}]`, errors)
      if (itemId !== undefined) acceptedItems.push(itemId)
    })
    if (acceptedItems.length === record.accepted_items.length) {
      slots.push({ acceptedItems })
    }
  })

  return slots.length === value.length ? slots : undefined
}

function parseRecipes(value: unknown, errors: string[]): CraftingRecipe[] {
  const root = getRecord(value, 'recipes', errors)
  if (!root) return []

  if (root.schema_version !== 1) {
    errors.push('recipes.schema_version: expected 1')
  }
  if (!Array.isArray(root.recipes)) {
    errors.push('recipes.recipes: expected an array')
    return []
  }

  const recipes: CraftingRecipe[] = []
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

    const outputItemId = getNonEmptyString(record.output_item_id, `${recipePath}.output_item_id`, errors)
    const outputCount = getPositiveInteger(record.output_count, `${recipePath}.output_count`, errors)
    const ingredientSlots = parseIngredientSlots(record.ingredient_slots, `${recipePath}.ingredient_slots`, errors)
    const fits2x2 = getBoolean(record.fits_2x2, `${recipePath}.fits_2x2`, errors)
    const fits3x3 = getBoolean(record.fits_3x3, `${recipePath}.fits_3x3`, errors)

    if (fits2x2 === false && fits3x3 === false) {
      errors.push(`${recipePath}: must fit at least one crafting grid`)
    }

    if (
      id !== undefined &&
      outputItemId !== undefined &&
      outputCount !== undefined &&
      ingredientSlots !== undefined &&
      fits2x2 !== undefined &&
      fits3x3 !== undefined
    ) {
      recipes.push({ id, outputItemId, outputCount, ingredientSlots, fits2x2, fits3x3 })
    }
  })

  return recipes
}

function validateRecipeReferences(recipes: CraftingRecipe[], items: Map<string, SearchItem>, errors: string[]) {
  recipes.forEach((recipe, recipeIndex) => {
    const recipePath = `recipes[${recipeIndex}]`
    // Search-item records are generated for recipe outputs. Ingredient IDs can be
    // valid Minecraft items without an independently searchable output record.
    if (!items.has(recipe.outputItemId)) {
      errors.push(`${recipePath}.output_item_id: references missing item ${recipe.outputItemId}`)
    }
  })
}

export function parseGeneratedData(itemsPayload: unknown, recipesPayload: unknown): GeneratedData {
  const errors: string[] = []
  const items = parseItems(itemsPayload, errors)
  const recipes = parseRecipes(recipesPayload, errors)
  validateRecipeReferences(recipes, items, errors)

  if (errors.length > 0) {
    throw new GeneratedDataError(errors)
  }

  return { schemaVersion: 1, items, recipes }
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
  const [itemsPayload, recipesPayload] = await Promise.all([
    fetchJson(`${base}data/search-items.json`),
    fetchJson(`${base}data/crafting-recipes.json`),
  ])
  return parseGeneratedData(itemsPayload, recipesPayload)
}
