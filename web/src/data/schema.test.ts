import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  GeneratedDataError,
  loadGeneratedData,
  loadLocalizedGeneratedData,
  loadLocalizedLanguageInfo,
  parseGeneratedData,
  parseLanguageMetadata,
  parseLocalizedGeneratedData,
  parseLocalizedLanguageInfo,
} from './schema'
import { matchItem } from '../engine/search'

const collectionId = 'crafting_misc/recipe/minecraft%3Atorch'

const items = {
  schema_version: 3,
  items: {
    'minecraft:stick': {
      name: 'Stick',
      confidence: 'source_reproduced',
      search_lines: [{ source: 'name', text: 'Stick' }],
    },
  },
}

const inventoryItems = {
  schema_version: 3,
  items: {
    'minecraft:oak_log': { name: 'Oak Log' },
    'minecraft:stick': { name: 'Stick' },
  },
}

const recipe = {
  id: 'minecraft:torch',
  recipe_group: null,
  recipe_book_category: 'crafting_misc',
  result_collection_id: collectionId,
  output_item_id: 'minecraft:stick',
  output_count: 4,
  ingredient_slots: [{ accepted_items: ['minecraft:stick'] }],
  fits_2x2: true,
  fits_3x3: true,
}

const collections = {
  schema_version: 3,
  collections: [{
    id: collectionId,
    recipe_book_category: 'crafting_misc',
    recipe_group: null,
    recipe_ids: ['minecraft:torch'],
    output_item_ids: ['minecraft:stick'],
  }],
}

function presetPayload(itemIds: string[]) {
  return {
    schema_version: 3,
    presets: [{
      id: 'overworld',
      name: 'Overworld',
      item_ids: itemIds,
    }],
  }
}

function expectValidationError(
  itemsData: unknown,
  inventoryItemsData: unknown,
  recipesData: unknown,
  collectionsData: unknown,
  path: string,
) {
  try {
    parseGeneratedData(itemsData, inventoryItemsData, recipesData, collectionsData, presetPayload(['minecraft:oak_log']))
    throw new Error('Expected generated data validation to fail')
  } catch (error) {
    expect(error).toBeInstanceOf(GeneratedDataError)
    expect((error as GeneratedDataError).errors).toEqual(expect.arrayContaining([
      expect.stringContaining(path),
    ]))
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseGeneratedData', () => {
  test('converts a complete valid graph into shared map-based domain data', () => {
    const generated = parseGeneratedData(items, inventoryItems, { schema_version: 3, recipes: [recipe] }, collections, presetPayload(['minecraft:oak_log']))

    expect(generated.schemaVersion).toBe(3)
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
      recipeGroup: null,
      recipeBookCategory: 'crafting_misc',
      resultCollectionId: collectionId,
      outputItemId: 'minecraft:stick',
      outputCount: 4,
      ingredientSlots: [{ acceptedItems: ['minecraft:stick'] }],
      fits2x2: true,
      fits3x3: true,
    }])
    expect(generated.collections).toEqual(new Map([[collectionId, {
      id: collectionId,
      recipeBookCategory: 'crafting_misc',
      recipeGroup: null,
      recipeIds: ['minecraft:torch'],
      outputItemIds: ['minecraft:stick'],
    }]]))
  })

  test('loads generated presets and rejects unknown inventory references', () => {
    const generated = parseGeneratedData(
      items,
      inventoryItems,
      { schema_version: 3, recipes: [recipe] },
      collections,
      presetPayload(['minecraft:oak_log']),
    )

    expect(generated.presets.get('overworld')?.itemIds).toContain('minecraft:oak_log')
    expect(() => parseGeneratedData(
      items,
      inventoryItems,
      { schema_version: 3, recipes: [recipe] },
      collections,
      presetPayload(['minecraft:missing']),
    )).toThrow('references missing inventory item')
  })

  test('preserves a whitespace-only recipe group shared by its collection', () => {
    const generated = parseGeneratedData(items, inventoryItems, {
      schema_version: 3,
      recipes: [{ ...recipe, recipe_group: ' '}],
    }, {
      schema_version: 3,
      collections: [{ ...collections.collections[0], recipe_group: ' '}],
    }, presetPayload(['minecraft:oak_log']))

    expect(generated.recipes[0].recipeGroup).toBe(' ')
    expect(generated.collections.get(collectionId)?.recipeGroup).toBe(' ')
  })

  test('rejects a schema version 2 payload mixed into a schema version 3 graph', () => {
    expectValidationError(items, inventoryItems, { schema_version: 3, recipes: [recipe] }, {
      ...collections,
      schema_version: 2,
    }, 'collections.schema_version')
  })

  test('rejects an invalid recipe book category', () => {
    expectValidationError(items, inventoryItems, {
      schema_version: 3,
      recipes: [{ ...recipe, recipe_book_category: 'crafting_unknown' }],
    }, collections, 'recipes[0].recipe_book_category')
  })

  test('rejects duplicate collection IDs', () => {
    expectValidationError(items, inventoryItems, { schema_version: 3, recipes: [recipe] }, {
      schema_version: 3,
      collections: [...collections.collections, collections.collections[0]],
    }, 'collections[1].id')
  })

  test('rejects duplicate recipe IDs within a collection', () => {
    expectValidationError(items, inventoryItems, { schema_version: 3, recipes: [recipe] }, {
      schema_version: 3,
      collections: [{ ...collections.collections[0], recipe_ids: ['minecraft:torch', 'minecraft:torch'] }],
    }, 'collections[0].recipe_ids[1]')
  })

  test('rejects a collection recipe reference that is absent from recipes', () => {
    expectValidationError(items, inventoryItems, { schema_version: 3, recipes: [recipe] }, {
      schema_version: 3,
      collections: [{ ...collections.collections[0], recipe_ids: ['minecraft:missing'] }],
    }, 'collections[0].recipe_ids[0]')
  })

  test('rejects a collection output reference that is absent from searchable items', () => {
    expectValidationError(items, inventoryItems, { schema_version: 3, recipes: [recipe] }, {
      schema_version: 3,
      collections: [{ ...collections.collections[0], output_item_ids: ['minecraft:missing'] }],
    }, 'collections[0].output_item_ids[0]')
  })

  test('rejects a recipe result collection reference that is absent from collections', () => {
    expectValidationError(items, inventoryItems, {
      schema_version: 3,
      recipes: [{ ...recipe, result_collection_id: 'crafting_misc/recipe/minecraft%3Amissing' }],
    }, collections, 'recipes[0].result_collection_id')
  })

  test('rejects a recipe category that disagrees with its collection', () => {
    expectValidationError(items, inventoryItems, {
      schema_version: 3,
      recipes: [{ ...recipe, recipe_book_category: 'crafting_equipment' }],
    }, collections, 'recipes[0].recipe_book_category')
  })

  test('rejects a recipe group that disagrees with its collection', () => {
    expectValidationError(items, inventoryItems, {
      schema_version: 3,
      recipes: [{ ...recipe, recipe_group: 'tools' }],
    }, collections, 'recipes[0].recipe_group')
  })

  test('rejects a recipe with no collection membership', () => {
    expectValidationError(items, inventoryItems, { schema_version: 3, recipes: [recipe] }, {
      schema_version: 3,
      collections: [{ ...collections.collections[0], recipe_ids: [] }],
    }, 'recipes[0].id')
  })

  test('rejects a recipe with two collection memberships', () => {
    expectValidationError(items, inventoryItems, { schema_version: 3, recipes: [recipe] }, {
      schema_version: 3,
      collections: [
        collections.collections[0],
        { ...collections.collections[0], id: 'crafting_misc/recipe/minecraft%3Atorch-copy' },
      ],
    }, 'recipes[0].id')
  })

  test('rejects an empty orphan collection', () => {
    try {
      parseGeneratedData(items, inventoryItems, { schema_version: 3, recipes: [] }, {
        schema_version: 3,
        collections: [{
          ...collections.collections[0],
          recipe_ids: [],
          output_item_ids: [],
        }],
      }, presetPayload(['minecraft:oak_log']))
      throw new Error('Expected generated data validation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(GeneratedDataError)
      expect((error as GeneratedDataError).errors).toEqual(expect.arrayContaining([
        expect.stringContaining('collections[0].recipe_ids'),
        expect.stringContaining('collections[0].output_item_ids'),
      ]))
    }
  })

  test('rejects an internally consistent merged null-group collection', () => {
    const alternateRecipe = {
      ...recipe,
      id: 'minecraft:torch_alt',
    }
    expectValidationError(items, inventoryItems, {
      schema_version: 3,
      recipes: [recipe, alternateRecipe],
    }, {
      schema_version: 3,
      collections: [{
        ...collections.collections[0],
        recipe_ids: [recipe.id, alternateRecipe.id],
      }],
    }, 'collections[0].recipe_ids')
  })

  test('rejects internally consistent split collections sharing a grouped semantic key', () => {
    const firstCollectionId = 'crafting_misc/group/tools-one'
    const secondCollectionId = 'crafting_misc/group/tools-two'
    const firstRecipe = {
      ...recipe,
      id: 'minecraft:torch_one',
      recipe_group: 'tools',
      result_collection_id: firstCollectionId,
    }
    const secondRecipe = {
      ...recipe,
      id: 'minecraft:torch_two',
      recipe_group: 'tools',
      result_collection_id: secondCollectionId,
    }
    expectValidationError(items, inventoryItems, {
      schema_version: 3,
      recipes: [firstRecipe, secondRecipe],
    }, {
      schema_version: 3,
      collections: [
        {
          ...collections.collections[0],
          id: firstCollectionId,
          recipe_group: 'tools',
          recipe_ids: [firstRecipe.id],
        },
        {
          ...collections.collections[0],
          id: secondCollectionId,
          recipe_group: 'tools',
          recipe_ids: [secondRecipe.id],
        },
      ],
    }, 'collections[1].recipe_group')
  })

  test('treats distinct untrimmed recipe groups as distinct semantic keys', () => {
    const firstCollectionId = 'crafting_misc/group/leading-space'
    const secondCollectionId = 'crafting_misc/group/plain'
    const firstRecipe = {
      ...recipe,
      id: 'minecraft:torch_leading_space',
      recipe_group: ' tools',
      result_collection_id: firstCollectionId,
    }
    const secondRecipe = {
      ...recipe,
      id: 'minecraft:torch_plain',
      recipe_group: 'tools',
      result_collection_id: secondCollectionId,
    }
    const generated = parseGeneratedData(items, inventoryItems, {
      schema_version: 3,
      recipes: [firstRecipe, secondRecipe],
    }, {
      schema_version: 3,
      collections: [
        {
          ...collections.collections[0],
          id: firstCollectionId,
          recipe_group: firstRecipe.recipe_group,
          recipe_ids: [firstRecipe.id],
        },
        {
          ...collections.collections[0],
          id: secondCollectionId,
          recipe_group: secondRecipe.recipe_group,
          recipe_ids: [secondRecipe.id],
        },
      ],
    }, presetPayload(['minecraft:oak_log']))

    expect(generated.collections.size).toBe(2)
  })

  test('rejects collection outputs that omit their member recipe output', () => {
    expectValidationError(items, inventoryItems, { schema_version: 3, recipes: [recipe] }, {
      schema_version: 3,
      collections: [{ ...collections.collections[0], output_item_ids: [] }],
    }, 'collections[0].output_item_ids')
  })

  test('rejects an item reference absent from the item records', () => {
    expectValidationError(items, inventoryItems, {
      schema_version: 3,
      recipes: [{ ...recipe, output_item_id: 'minecraft:coal' }],
    }, collections, 'recipes[0].output_item_id')
  })

  test('rejects an ingredient reference absent from the inventory item catalog', () => {
    expectValidationError(items, {
      schema_version: 3,
      items: { 'minecraft:oak_log': { name: 'Oak Log' } },
    }, {
      schema_version: 3,
      recipes: [recipe],
    }, collections, 'recipes[0].ingredient_slots[0].accepted_items[0]')
  })

  test('preserves source recipe indexes in missing-output diagnostics after malformed entries', () => {
    expectValidationError(items, inventoryItems, {
      schema_version: 3,
      recipes: [
        { ...recipe, output_count: 0 },
        { ...recipe, id: 'minecraft:missing-output', output_item_id: 'minecraft:coal' },
      ],
    }, collections, 'recipes[1].output_item_id')
  })

  test('rejects duplicate recipe IDs', () => {
    expectValidationError(items, inventoryItems, { schema_version: 3, recipes: [recipe, recipe] }, collections, 'recipes[1].id')
  })

  test('rejects empty search-line text', () => {
    expectValidationError({
      schema_version: 3,
      items: {
        'minecraft:stick': { ...items.items['minecraft:stick'], search_lines: [{ source: 'name', text: '' }] },
      },
    }, inventoryItems, { schema_version: 3, recipes: [recipe] }, collections, 'items.items.minecraft:stick.search_lines[0].text')
  })

  test('rejects recipes that fit no crafting grid', () => {
    expectValidationError(items, inventoryItems, {
      schema_version: 3,
      recipes: [{ ...recipe, fits_2x2: false, fits_3x3: false }],
    }, collections, 'recipes[0]')
  })
})

describe('localized generated data', () => {
  const localized = {
    schema_version: 1,
    minecraft_version: '1.16.1',
    locales: {
      de_de: {
        search_items: {
          'minecraft:stick': {
            name: 'Stock', confidence: 'source_reproduced', search_lines: [{ source: 'name', text: 'Stock' }],
          },
        },
        inventory_items: {
          'minecraft:oak_log': { name: 'Eichenstamm' },
          'minecraft:stick': { name: 'Stick' },
        },
      },
    },
  }

  test('replaces only localized maps while preserving the shared generated data shape', () => {
    const base = parseGeneratedData(items, inventoryItems, { schema_version: 3, recipes: [recipe] }, collections, presetPayload(['minecraft:oak_log']))
    const localizedData = parseLocalizedGeneratedData(localized, 'de_de', base)

    expect(localizedData.items.get('minecraft:stick')?.name).toBe('Stock')
    expect(localizedData.inventoryItems.get('minecraft:oak_log')?.name).toBe('Eichenstamm')
    expect(localizedData.recipes).toBe(base.recipes)
    expect(localizedData.collections).toBe(base.collections)
    expect(localizedData.presets).toBe(base.presets)
  })

  test('uses the selected locale search lines for query matching', () => {
    const base = parseGeneratedData(items, inventoryItems, { schema_version: 3, recipes: [recipe] }, collections, presetPayload(['minecraft:oak_log']))
    const localizedData = parseLocalizedGeneratedData(localized, 'de_de', base)

    expect(matchItem(localizedData.items.get('minecraft:stick')!, 'stoc')).toHaveLength(1)
    expect(matchItem(localizedData.items.get('minecraft:stick')!, 'tick')).toHaveLength(0)
  })

  test('keeps en_us as the exact in-memory baseline without loading the large locale payload', async () => {
    const base = parseGeneratedData(items, inventoryItems, { schema_version: 3, recipes: [recipe] }, collections, presetPayload(['minecraft:oak_log']))

    await expect(loadLocalizedGeneratedData('en_us', base)).resolves.toBe(base)
  })

  test('shares one transient localized-payload fetch between concurrent locale loads', async () => {
    const base = parseGeneratedData(items, inventoryItems, { schema_version: 3, recipes: [recipe] }, collections, presetPayload(['minecraft:oak_log']))
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => localized }))
    vi.stubGlobal('fetch', fetchMock)

    await Promise.all([
      loadLocalizedGeneratedData('de_de', base),
      loadLocalizedGeneratedData('de_de', base),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('rejects a missing locale entry safely', () => {
    const base = parseGeneratedData(items, inventoryItems, { schema_version: 3, recipes: [recipe] }, collections, presetPayload(['minecraft:oak_log']))

    expect(() => parseLocalizedGeneratedData(localized, 'missing', base)).toThrow(GeneratedDataError)
  })

  test('parses data-derived human-readable locale metadata', () => {
    expect(parseLanguageMetadata({
      schema_version: 1,
      minecraft_version: '1.16.1',
      locales: {
        en_us: { name: 'English', region: 'United States', script: 'latin' },
        ja_jp: { name: '日本語', region: '日本', script: 'non_latin' },
      },
    })).toEqual([
      { locale: 'en_us', name: 'English', region: 'United States', script: 'latin' },
      { locale: 'ja_jp', name: '日本語', region: '日本', script: 'non_latin' },
    ])
  })

  test('parses standalone localized language information with advancement requirements', () => {
    const info = parseLocalizedLanguageInfo({
      schema_version: 1,
      minecraft_version: '1.16.1',
      sections: {
        difficulties: [{ id: 'easy', key: 'options.difficulty.easy', english: 'Easy' }],
        advancements: [{
          id: 'acquire_hardware',
          key: 'advancements.story.smelt_iron.title',
          english: 'Acquire Hardware',
          requirement_key: 'advancements.story.smelt_iron.description',
          english_requirement: 'Smelt an iron ingot',
        }],
      },
      locales: {
        en_us: {
          difficulties: { easy: { name: 'Easy' } },
          advancements: { acquire_hardware: { name: 'Acquire Hardware', requirement: 'Smelt an iron ingot' } },
        },
        de_de: {
          difficulties: { easy: { name: 'Leicht' } },
          advancements: { acquire_hardware: { name: 'Beschaffe dir Hardware', requirement: 'Verhütte einen Eisenbarren' } },
        },
      },
    })

    expect(info.sections.map((section) => section.id)).toEqual(['difficulties', 'advancements'])
    expect(info.locales.get('de_de')?.get('difficulties')?.get('easy')).toEqual({ name: 'Leicht', requirement: undefined })
    expect(info.locales.get('de_de')?.get('advancements')?.get('acquire_hardware')).toEqual({
      name: 'Beschaffe dir Hardware',
      requirement: 'Verhütte einen Eisenbarren',
    })
  })

  test('loads the standalone language-info artifact without sharing the search payload', async () => {
    const payload = {
      schema_version: 1,
      minecraft_version: '1.16.1',
      sections: { difficulties: [{ id: 'easy', key: 'options.difficulty.easy', english: 'Easy' }] },
      locales: { en_us: { difficulties: { easy: { name: 'Easy' } } } },
    }
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => payload }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadLocalizedLanguageInfo()).resolves.toMatchObject({ sections: [{ id: 'difficulties' }] })
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/localized-language-info\.json$/))
  })
})

describe('loadGeneratedData', () => {
  test('fetches all generated JSON files relative to the configured Vite base URL', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => items })
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => inventoryItems })
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ schema_version: 3, recipes: [recipe] }) })
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => collections })
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => presetPayload(['minecraft:oak_log']) })
    vi.stubGlobal('fetch', fetchMock)

    await loadGeneratedData()

    const base = import.meta.env.BASE_URL.endsWith('/')
      ? import.meta.env.BASE_URL
      : `${import.meta.env.BASE_URL}/`
    expect(fetchMock).toHaveBeenNthCalledWith(1, `${base}data/search-items.json`)
    expect(fetchMock).toHaveBeenNthCalledWith(2, `${base}data/inventory-items.json`)
    expect(fetchMock).toHaveBeenNthCalledWith(3, `${base}data/crafting-recipes.json`)
    expect(fetchMock).toHaveBeenNthCalledWith(4, `${base}data/recipe-result-collections.json`)
    expect(fetchMock).toHaveBeenNthCalledWith(5, `${base}data/inventory-presets.json`)
  })
})
