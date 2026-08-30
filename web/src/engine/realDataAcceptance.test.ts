import { describe, expect, test } from 'vitest'

import craftingRecipesPayload from '../../public/data/crafting-recipes.json'
import inventoryItemsPayload from '../../public/data/inventory-items.json'
import recipeResultCollectionsPayload from '../../public/data/recipe-result-collections.json'
import searchItemsPayload from '../../public/data/search-items.json'
import { parseGeneratedData } from '../data/schema'
import { candidateQueriesForTargets } from './candidates'
import { eligibleRecipes } from './craftability'
import { matchEligibleCollectionOutputs } from './collectionSearch'

const data = parseGeneratedData(
  searchItemsPayload,
  inventoryItemsPayload,
  craftingRecipesPayload,
  recipeResultCollectionsPayload,
)

const groupedInventory = [
  'minecraft:white_wool',
  'minecraft:oak_planks',
  'minecraft:stick',
  'minecraft:crying_obsidian',
  'minecraft:glowstone',
  'minecraft:string',
]
const expectedGrouped = new Set([
  'minecraft:white_bed',
  'minecraft:respawn_anchor',
  'minecraft:white_carpet',
  'minecraft:white_banner',
])

function outputsFor(
  query: string,
  inventoryIds: string[],
  gridSize: 2 | 3 = 3,
): Set<string> {
  const eligible = eligibleRecipes(data.recipes, new Set(inventoryIds), gridSize)
  return new Set(matchEligibleCollectionOutputs(query, eligible, data.collections, data.items).keys())
}

describe('generated Minecraft 1.16.1 collection search data', () => {
  test('matches wn aliases across grouped members but emits only eligible exact outputs', () => {
    expect(outputsFor('wn', groupedInventory)).toEqual(expectedGrouped)
    expect(outputsFor('wn ', groupedInventory)).toEqual(expectedGrouped)
    expect(outputsFor('wn', ['minecraft:string']).has('minecraft:white_wool')).toBe(false)
  })

  test('includes every confirmed grouped output for re without excluding legitimate direct matches', () => {
    const reOutputs = outputsFor('re', groupedInventory)

    for (const itemId of expectedGrouped) expect(reOutputs.has(itemId)).toBe(true)
  })

  test('keeps direct-name ingot and iron-tool searches working', () => {
    const ingotOutputs = outputsFor('ngo', [
      'minecraft:iron_nugget',
      'minecraft:iron_block',
      'minecraft:gold_nugget',
      'minecraft:gold_block',
    ])

    expect(ingotOutputs.has('minecraft:iron_ingot')).toBe(true)
    expect(ingotOutputs.has('minecraft:gold_ingot')).toBe(true)
    expect(outputsFor('ro', ['minecraft:iron_ingot', 'minecraft:stick']).has('minecraft:iron_axe')).toBe(true)
    expect(outputsFor('oe', ['minecraft:iron_ingot', 'minecraft:stick']).has('minecraft:iron_hoe')).toBe(true)
  })

  test('derives White Bed candidates from every searchable member of its collection', () => {
    const candidates = candidateQueriesForTargets(
      new Set(['minecraft:white_bed']),
      data.recipes,
      data.collections,
      data.items,
    )

    expect(candidates).toContain('wn')
    expect(candidates).toContain('wn ')
  })
})
