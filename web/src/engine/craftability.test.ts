import { describe, expect, test } from 'vitest'

import type { CraftingRecipe } from '../domain/types'
import { isRecipeCraftable, targetSupports2x2, visibleOutputIds } from './craftability'

function recipe(overrides: Partial<CraftingRecipe> = {}): CraftingRecipe {
  return {
    id: 'minecraft:test_recipe',
    outputItemId: 'minecraft:test_output',
    outputCount: 1,
    ingredientSlots: [{ acceptedItems: ['minecraft:stick'] }],
    fits2x2: true,
    fits3x3: true,
    ...overrides,
  }
}

describe('isRecipeCraftable', () => {
  test('allows one selected item to satisfy repeated ingredient slots', () => {
    const repeatedStickRecipe = recipe({
      ingredientSlots: [
        { acceptedItems: ['minecraft:stick'] },
        { acceptedItems: ['minecraft:stick'] },
      ],
    })

    expect(isRecipeCraftable(repeatedStickRecipe, new Set(['minecraft:stick']), 2)).toBe(true)
  })

  test('accepts a concrete item selected from an ingredient tag alternative', () => {
    const plankRecipe = recipe({
      ingredientSlots: [{
        acceptedItems: ['minecraft:oak_planks', 'minecraft:spruce_planks'],
      }],
    })

    expect(isRecipeCraftable(plankRecipe, new Set(['minecraft:spruce_planks']), 2)).toBe(true)
  })

  test('does not derive accepted ingredients from other selected items', () => {
    const plankRecipe = recipe({
      ingredientSlots: [{ acceptedItems: ['minecraft:oak_planks'] }],
    })

    expect(isRecipeCraftable(plankRecipe, new Set(['minecraft:oak_log']), 2)).toBe(false)
  })

  test('rejects a 3x3-only recipe for the 2x2 grid', () => {
    const threeByThreeRecipe = recipe({ fits2x2: false, fits3x3: true })

    expect(isRecipeCraftable(threeByThreeRecipe, new Set(['minecraft:stick']), 2)).toBe(false)
  })

  test('allows a 2x2 recipe for the 3x3 grid', () => {
    const twoByTwoRecipe = recipe({ fits2x2: true, fits3x3: true })

    expect(isRecipeCraftable(twoByTwoRecipe, new Set(['minecraft:stick']), 3)).toBe(true)
  })
})

describe('visibleOutputIds', () => {
  test('returns each craftable output ID once when multiple recipes produce it', () => {
    const recipes = [
      recipe({ id: 'minecraft:output_from_stick', outputItemId: 'minecraft:torch' }),
      recipe({ id: 'minecraft:output_from_plank', outputItemId: 'minecraft:torch', ingredientSlots: [{ acceptedItems: ['minecraft:planks'] }] }),
    ]

    expect(visibleOutputIds(recipes, new Set(['minecraft:stick', 'minecraft:planks']), 2))
      .toEqual(new Set(['minecraft:torch']))
  })
})

describe('targetSupports2x2', () => {
  test('returns true when any recipe for the target fits the 2x2 grid', () => {
    const recipes = [
      recipe({ id: 'minecraft:three_by_three', outputItemId: 'minecraft:chest', fits2x2: false, fits3x3: true }),
      recipe({ id: 'minecraft:two_by_two', outputItemId: 'minecraft:chest', fits2x2: true, fits3x3: true }),
    ]

    expect(targetSupports2x2('minecraft:chest', recipes)).toBe(true)
  })
})
