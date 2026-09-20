import { describe, expect, test } from 'vitest'

import type { CraftingRecipe, RecipeResultCollection, SearchItem } from '../domain/types'
import { candidateQueries, candidateQueriesForTargets } from './candidates'

function target(id: string, lines: string[]): SearchItem {
  return {
    id,
    name: id,
    confidence: 'source_reproduced',
    searchLines: lines.map((text) => ({ source: 'name', text })),
  }
}

describe('candidateQueries', () => {
  test('returns unique normalized substrings from each target line in deterministic order', () => {
    expect(candidateQueries([
      target('minecraft:first', ['Ab+8']),
      target('minecraft:second', ['b c']),
    ], 2)).toEqual([
      ' ', ' c', '+', '+8', '8', 'a', 'ab', 'b', 'b ', 'b+', 'c',
    ])
  })

  test('does not derive candidates by joining target search lines', () => {
    expect(candidateQueries([
      target('minecraft:split', ['Iron', 'Sword']),
    ], 5)).not.toContain('ns')
  })

  test('limits candidates to the supported one-through-five character query length', () => {
    expect(candidateQueries([target('minecraft:long', ['abcdef'])], 10)).not.toContain('abcdef')
    expect(candidateQueries([target('minecraft:long', ['abcdef'])], 0)).toEqual([])
  })

  test('does not begin candidates inside an expanded lowercase character', () => {
    const candidates = candidateQueries([target('minecraft:expanded', ['İx'])])

    expect(candidates).toEqual(['i', 'i̇', 'i̇x', 'x'])
    expect(candidates).not.toContain('̇')
    expect(candidates).not.toContain('̇x')
  })

  test('adds colon-prefixed item ID candidates only when enabled', () => {
    const ironSword = target('minecraft:iron_sword', ['Iron Sword', 'When in Main Hand'])

    expect(candidateQueries([ironSword], 5)).not.toContain(':on_sw')
    const candidates = candidateQueries([ironSword], 5, { itemIdSearch: true })
    expect(candidates).toContain(':on_sw')
    expect(candidates).toContain(':main')
  })
})

function recipe(
  id: string,
  outputItemId: string,
  resultCollectionId: string,
): CraftingRecipe {
  return {
    id,
    recipeGroup: null,
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
): RecipeResultCollection {
  return {
    id,
    recipeBookCategory: 'crafting_misc',
    recipeGroup: null,
    recipeIds: [],
    outputItemIds,
  }
}

describe('candidateQueriesForTargets', () => {
  test('derives unique sorted candidates from every member of target collections', () => {
    const items = new Map([
      ['minecraft:white_bed', target('minecraft:white_bed', ['Ivory Rest'])],
      ['minecraft:brown_bed', target('minecraft:brown_bed', ['Brown Bed wn ', 'split'])],
      ['minecraft:other', target('minecraft:other', ['not used'])],
    ])
    const recipes = [
      recipe('minecraft:white_bed_recipe', 'minecraft:white_bed', 'collection:bed'),
      recipe('minecraft:other_recipe', 'minecraft:other', 'collection:other'),
    ]
    const collections = new Map([
      ['collection:bed', collection('collection:bed', ['minecraft:white_bed', 'minecraft:brown_bed'])],
      ['collection:other', collection('collection:other', ['minecraft:other'])],
    ])

    const candidates = candidateQueriesForTargets(
      new Set(['minecraft:white_bed']), recipes, collections, items,
    )

    expect(candidates).toContain('wn')
    expect(candidates).toContain('wn ')
    expect(candidates).not.toContain('ts')
    expect(candidates).not.toContain('not')
    expect(candidates).toEqual([...new Set(candidates)].sort())
    expect(candidates.every((candidate) => candidate.length >= 1 && candidate.length <= 5)).toBe(true)
  })

  test('does not expand targets through collections that cannot output them', () => {
    const items = new Map([
      ['minecraft:white_bed', target('minecraft:white_bed', ['Ivory Rest'])],
      ['minecraft:brown_bed', target('minecraft:brown_bed', ['Brown wn'])],
      ['minecraft:other', target('minecraft:other', ['Exclusive alias'])],
    ])
    const recipes = [recipe('minecraft:white_bed_recipe', 'minecraft:white_bed', 'collection:bed')]
    const collections = new Map([
      ['collection:bed', collection('collection:bed', ['minecraft:white_bed', 'minecraft:brown_bed'])],
      ['collection:other', collection('collection:other', ['minecraft:other'])],
    ])

    expect(candidateQueriesForTargets(new Set(['minecraft:white_bed']), recipes, collections, items))
      .not.toContain('exclu')
  })

  test('rejects target collection members missing from the validated item graph', () => {
    const recipes = [recipe('minecraft:white_bed_recipe', 'minecraft:white_bed', 'collection:bed')]
    const collections = new Map([
      ['collection:bed', collection('collection:bed', ['minecraft:white_bed', 'minecraft:missing'])],
    ])
    const items = new Map([['minecraft:white_bed', target('minecraft:white_bed', ['White Bed'])]])

    expect(() => candidateQueriesForTargets(new Set(['minecraft:white_bed']), recipes, collections, items))
      .toThrow('collection:bed: references missing item minecraft:missing')
  })
})
