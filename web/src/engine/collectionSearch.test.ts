import { describe, expect, test } from 'vitest'

import type { CraftingRecipe, RecipeResultCollection, SearchItem } from '../domain/types'
import { matchEligibleCollectionOutputs } from './collectionSearch'

function item(id: string, name: string, lines = [name]): SearchItem {
  return {
    id,
    name,
    confidence: 'source_reproduced',
    searchLines: lines.map((text, index) => ({ source: index === 0 ? 'name' : 'attribute', text })),
  }
}

function recipe(
  id: string,
  outputItemId: string,
  resultCollectionId: string,
): CraftingRecipe {
  return {
    id,
    recipeGroup: resultCollectionId === 'collection:bed' ? 'bed' : null,
    recipeBookCategory: 'crafting_misc',
    resultCollectionId,
    outputItemId,
    outputCount: 1,
    ingredientSlots: [{ acceptedItems: ['minecraft:stick'] }],
    fits2x2: true,
    fits3x3: true,
  }
}

function collection(
  id: string,
  outputItemIds: string[],
  recipeGroup: string | null = null,
): RecipeResultCollection {
  return {
    id,
    recipeBookCategory: 'crafting_misc',
    recipeGroup,
    recipeIds: [],
    outputItemIds,
  }
}

function fixture() {
  const items = new Map([
    ['minecraft:brown_bed', item('minecraft:brown_bed', 'Brown Bed ')],
    ['minecraft:white_bed', item('minecraft:white_bed', 'Ivory Rest')],
    ['minecraft:brown_carpet', item('minecraft:brown_carpet', 'Brown Carpet ')],
    ['minecraft:white_carpet', item('minecraft:white_carpet', 'Ivory Rug')],
    ['minecraft:brown_banner', item('minecraft:brown_banner', 'Brown Banner ')],
    ['minecraft:white_banner', item('minecraft:white_banner', 'Ivory Flag')],
    ['minecraft:respawn_anchor', item('minecraft:respawn_anchor', 'Respawn Anchor ')],
    ['minecraft:white_wool', item('minecraft:white_wool', 'White Wool')],
  ])
  const collections = new Map([
    ['collection:wool', collection('collection:wool', ['minecraft:white_wool'])],
    ['collection:carpet', collection('collection:carpet', ['minecraft:brown_carpet', 'minecraft:white_carpet'], 'carpet')],
    ['collection:bed', collection('collection:bed', ['minecraft:brown_bed', 'minecraft:white_bed'], 'bed')],
    ['collection:anchor', collection('collection:anchor', ['minecraft:respawn_anchor'])],
    ['collection:banner', collection('collection:banner', ['minecraft:brown_banner', 'minecraft:white_banner'], 'banner')],
  ])
  const eligible = [
    recipe('minecraft:white_bed_recipe', 'minecraft:white_bed', 'collection:bed'),
    recipe('minecraft:white_carpet_recipe', 'minecraft:white_carpet', 'collection:carpet'),
    recipe('minecraft:white_banner_recipe', 'minecraft:white_banner', 'collection:banner'),
    recipe('minecraft:respawn_anchor_recipe', 'minecraft:respawn_anchor', 'collection:anchor'),
    recipe('minecraft:white_wool_recipe', 'minecraft:white_wool', 'collection:wool'),
  ]
  return { items, collections, eligible }
}

describe('matchEligibleCollectionOutputs', () => {
  test('matches aliases but emits only the eligible exact collection outputs', () => {
    const { eligible, collections, items } = fixture()

    const outputs = matchEligibleCollectionOutputs('wn', eligible, collections, items)

    expect([...outputs.keys()]).toEqual([
      'minecraft:respawn_anchor',
      'minecraft:white_banner',
      'minecraft:white_bed',
      'minecraft:white_carpet',
    ])
    expect(outputs.has('minecraft:white_wool')).toBe(false)
    expect(outputs.get('minecraft:white_bed')).toEqual([{
      query: 'wn',
      collectionId: 'collection:bed',
      recipeGroup: 'bed',
      matchedMemberItemId: 'minecraft:brown_bed',
      matchedMemberName: 'Brown Bed ',
      visibleOutputItemId: 'minecraft:white_bed',
      visibleOutputName: 'Ivory Rest',
      source: 'name',
      line: 'Brown Bed ',
      matchedSpan: { start: 3, end: 5, text: 'wn' },
    }])
  })

  test('preserves ordinary trailing-space aliases and direct member matches', () => {
    const { eligible, collections, items } = fixture()

    expect([...matchEligibleCollectionOutputs('wn ', eligible, collections, items).keys()]).toEqual([
      'minecraft:respawn_anchor',
      'minecraft:white_banner',
      'minecraft:white_bed',
      'minecraft:white_carpet',
    ])
  })

  test('emits two eligible exact outputs from one matched collection', () => {
    const { eligible, collections, items } = fixture()
    eligible.push(recipe('minecraft:second_white_bed_recipe', 'minecraft:second_white_bed', 'collection:bed'))
    items.set('minecraft:second_white_bed', item('minecraft:second_white_bed', 'Second Ivory Rest'))
    collections.set('collection:bed', collection(
      'collection:bed',
      ['minecraft:brown_bed', 'minecraft:white_bed', 'minecraft:second_white_bed'],
      'bed',
    ))

    expect([...matchEligibleCollectionOutputs('wn', eligible, collections, items).keys()])
      .toContain('minecraft:second_white_bed')
  })

  test('deduplicates an output shared by matched collections and orders explanations', () => {
    const items = new Map([
      ['minecraft:alias_a', item('minecraft:alias_a', 'Zwn', ['Zwn', 'awn'])],
      ['minecraft:alias_b', item('minecraft:alias_b', 'Awn')],
      ['minecraft:shared', item('minecraft:shared', 'Shared')],
    ])
    const collections = new Map([
      ['collection:z', collection('collection:z', ['minecraft:alias_a', 'minecraft:shared'])],
      ['collection:a', collection('collection:a', ['minecraft:alias_b', 'minecraft:shared'])],
    ])
    const eligible = [
      recipe('minecraft:z_recipe', 'minecraft:shared', 'collection:z'),
      recipe('minecraft:a_recipe', 'minecraft:shared', 'collection:a'),
      recipe('minecraft:a_duplicate_recipe', 'minecraft:shared', 'collection:a'),
    ]

    const explanations = matchEligibleCollectionOutputs('wn', eligible, collections, items)
      .get('minecraft:shared')

    expect([...matchEligibleCollectionOutputs('wn', eligible, collections, items).keys()])
      .toEqual(['minecraft:shared'])
    expect(explanations?.map(({ collectionId, matchedMemberItemId, source }) => [collectionId, matchedMemberItemId, source]))
      .toEqual([
        ['collection:a', 'minecraft:alias_b', 'name'],
        ['collection:z', 'minecraft:alias_a', 'attribute'],
        ['collection:z', 'minecraft:alias_a', 'name'],
      ])
  })

  test('keeps Unicode-safe low-level match spans in collection explanations', () => {
    const items = new Map([
      ['minecraft:unicode_alias', item('minecraft:unicode_alias', 'İx')],
      ['minecraft:visible', item('minecraft:visible', 'Visible')],
    ])
    const collections = new Map([
      ['collection:unicode', collection('collection:unicode', ['minecraft:unicode_alias', 'minecraft:visible'])],
    ])
    const eligible = [recipe('minecraft:visible_recipe', 'minecraft:visible', 'collection:unicode')]

    expect(matchEligibleCollectionOutputs('x', eligible, collections, items).get('minecraft:visible'))
      .toMatchObject([{ matchedSpan: { start: 1, end: 2, text: 'x' } }])
  })
})
