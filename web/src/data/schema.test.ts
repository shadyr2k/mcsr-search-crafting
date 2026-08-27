import { describe, expect, test } from 'vitest'

import { GeneratedDataError, parseGeneratedData } from './schema'

const items = {
  schema_version: 1,
  items: {
    'minecraft:stick': {
      name: 'Stick',
      confidence: 'source_reproduced',
      search_lines: [{ source: 'name', text: 'Stick' }],
    },
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

function expectValidationError(itemsData: unknown, recipesData: unknown, path: string) {
  expect(() => parseGeneratedData(itemsData, recipesData)).toThrow(GeneratedDataError)
  expect(() => parseGeneratedData(itemsData, recipesData)).toThrow(path)
}

describe('parseGeneratedData', () => {
  test('rejects an unsupported schema version', () => {
    expectValidationError({ ...items, schema_version: 2 }, { schema_version: 1, recipes: [recipe] }, 'items.schema_version')
  })

  test('rejects an item reference absent from the item records', () => {
    expectValidationError(items, {
      schema_version: 1,
      recipes: [{ ...recipe, output_item_id: 'minecraft:coal' }],
    }, 'recipes[0].output_item_id')
  })

  test('rejects duplicate recipe IDs', () => {
    expectValidationError(items, { schema_version: 1, recipes: [recipe, recipe] }, 'recipes[1].id')
  })

  test('rejects empty search-line text', () => {
    expectValidationError({
      schema_version: 1,
      items: {
        'minecraft:stick': { ...items.items['minecraft:stick'], search_lines: [{ source: 'name', text: '' }] },
      },
    }, { schema_version: 1, recipes: [recipe] }, 'items.items.minecraft:stick.search_lines[0].text')
  })

  test('rejects recipes that fit no crafting grid', () => {
    expectValidationError(items, {
      schema_version: 1,
      recipes: [{ ...recipe, fits_2x2: false, fits_3x3: false }],
    }, 'recipes[0]')
  })
})
