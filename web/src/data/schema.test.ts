import { afterEach, describe, expect, test, vi } from 'vitest'

import { GeneratedDataError, loadGeneratedData, parseGeneratedData } from './schema'

const items = {
  schema_version: 2,
  items: {
    'minecraft:stick': {
      name: 'Stick',
      confidence: 'source_reproduced',
      search_lines: [{ source: 'name', text: 'Stick' }],
    },
  },
}

const inventoryItems = {
  schema_version: 2,
  items: {
    'minecraft:oak_log': { name: 'Oak Log' },
    'minecraft:stick': { name: 'Stick' },
  },
}

const recipe = {
  id: 'minecraft:torch',
  output_item_id: 'minecraft:stick',
  output_count: 4,
  ingredient_slots: [{ accepted_items: ['minecraft:stick'] }],
  fits_2x2: true,
  fits_3x3: true,
}

function expectValidationError(
  itemsData: unknown,
  inventoryItemsData: unknown,
  recipesData: unknown,
  path: string,
) {
  expect(() => parseGeneratedData(itemsData, inventoryItemsData, recipesData)).toThrow(GeneratedDataError)
  expect(() => parseGeneratedData(itemsData, inventoryItemsData, recipesData)).toThrow(path)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseGeneratedData', () => {
  test('converts valid generated records into the shared map-based domain data', () => {
    const generated = parseGeneratedData(items, inventoryItems, { schema_version: 2, recipes: [recipe] })

    expect(generated.schemaVersion).toBe(2)
    expect(generated.items).toBeInstanceOf(Map)
    expect(generated.items.get('minecraft:stick')).toEqual({
      id: 'minecraft:stick',
      name: 'Stick',
      confidence: 'source_reproduced',
      searchLines: [{ source: 'name', text: 'Stick' }],
    })
    expect(generated.inventoryItems.get('minecraft:oak_log')).toEqual({
      id: 'minecraft:oak_log',
      name: 'Oak Log',
    })
    expect(generated.recipes).toEqual([{
      id: 'minecraft:torch',
      outputItemId: 'minecraft:stick',
      outputCount: 4,
      ingredientSlots: [{ acceptedItems: ['minecraft:stick'] }],
      fits2x2: true,
      fits3x3: true,
    }])
  })

  test('rejects an unsupported schema version', () => {
    expectValidationError(
      { ...items, schema_version: 1 },
      inventoryItems,
      { schema_version: 2, recipes: [recipe] },
      'items.schema_version',
    )
  })

  test('rejects an item reference absent from the item records', () => {
    expectValidationError(items, {
      ...inventoryItems,
    }, {
      schema_version: 2,
      recipes: [{ ...recipe, output_item_id: 'minecraft:coal' }],
    }, 'recipes[0].output_item_id')
  })

  test('rejects an ingredient reference absent from the inventory item catalog', () => {
    expectValidationError(items, {
      schema_version: 2,
      items: { 'minecraft:oak_log': { name: 'Oak Log' } },
    }, {
      schema_version: 2,
      recipes: [recipe],
    }, 'recipes[0].ingredient_slots[0].accepted_items[0]')
  })

  test('preserves source recipe indexes in missing-output diagnostics after malformed entries', () => {
    expectValidationError(items, {
      ...inventoryItems,
    }, {
      schema_version: 2,
      recipes: [
        { ...recipe, output_count: 0 },
        { ...recipe, id: 'minecraft:missing-output', output_item_id: 'minecraft:coal' },
      ],
    }, 'recipes[1].output_item_id')
  })

  test('rejects duplicate recipe IDs', () => {
    expectValidationError(items, inventoryItems, { schema_version: 2, recipes: [recipe, recipe] }, 'recipes[1].id')
  })

  test('rejects empty search-line text', () => {
    expectValidationError({
      schema_version: 2,
      items: {
        'minecraft:stick': { ...items.items['minecraft:stick'], search_lines: [{ source: 'name', text: '' }] },
      },
    }, inventoryItems, { schema_version: 2, recipes: [recipe] }, 'items.items.minecraft:stick.search_lines[0].text')
  })

  test('rejects recipes that fit no crafting grid', () => {
    expectValidationError(items, {
      ...inventoryItems,
    }, {
      schema_version: 2,
      recipes: [{ ...recipe, fits_2x2: false, fits_3x3: false }],
    }, 'recipes[0]')
  })
})

describe('loadGeneratedData', () => {
  test('fetches all generated JSON files relative to the configured Vite base URL', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => items })
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => inventoryItems })
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ schema_version: 2, recipes: [recipe] }) })
    vi.stubGlobal('fetch', fetchMock)

    await loadGeneratedData()

    const base = import.meta.env.BASE_URL.endsWith('/')
      ? import.meta.env.BASE_URL
      : `${import.meta.env.BASE_URL}/`
    expect(fetchMock).toHaveBeenNthCalledWith(1, `${base}data/search-items.json`)
    expect(fetchMock).toHaveBeenNthCalledWith(2, `${base}data/inventory-items.json`)
    expect(fetchMock).toHaveBeenNthCalledWith(3, `${base}data/crafting-recipes.json`)
  })
})
