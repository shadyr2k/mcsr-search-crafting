import { describe, expect, test } from 'vitest'

import type { CraftingRecipe, RecipeResultCollection, SearchItem } from '../domain/types'
import {
  optimizeSingle,
  optimizeSinglePrepared,
  prepareOptimization,
  prepareOptimizationCooperatively,
  type OptimizeInput,
} from './singleOptimizer'

function item(id: string, text: string): SearchItem {
  return {
    id,
    name: id,
    confidence: 'source_reproduced',
    searchLines: [{ source: 'name', text }],
  }
}

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
    ingredientSlots: [{ acceptedItems: ['ingredient:shared'] }],
    fits2x2: true,
    fits3x3: true,
  }
}

function collection(
  id: string,
  recipeIds: string[],
  outputItemIds: string[],
  recipeGroup: string | null = null,
): RecipeResultCollection {
  return {
    id,
    recipeBookCategory: 'crafting_misc',
    recipeGroup,
    recipeIds,
    outputItemIds,
  }
}

function isolatedInput(targets: SearchItem[], junk: SearchItem[] = []): OptimizeInput {
  const visibleItems = [...targets, ...junk]
  const recipes = visibleItems.map((searchItem) => recipe(
    `recipe:${searchItem.id}`,
    searchItem.id,
    `collection:${searchItem.id}`,
  ))

  return {
    targetIds: new Set(targets.map(({ id }) => id)),
    eligibleRecipes: recipes,
    recipes,
    collections: new Map(recipes.map((craftingRecipe) => [
      craftingRecipe.resultCollectionId,
      collection(
        craftingRecipe.resultCollectionId,
        [craftingRecipe.id],
        [craftingRecipe.outputItemId],
      ),
    ])),
    items: new Map(visibleItems.map((searchItem) => [searchItem.id, searchItem])),
  }
}

function fixture(): OptimizeInput {
  const targets = [
    item('minecraft:iron_sword', 'Sword 4 z ab cd ef İx 1'),
    item('minecraft:diamond_sword', 'Sword 4 z ab cd ef İx 2'),
  ]
  const sharedJunk = item('minecraft:shared_junk', 'Axe 4')
  const secondJunk = item('minecraft:second_junk', 'Pick 4')

  return isolatedInput(targets, [sharedJunk, secondJunk])
}

function resultIndex(results: ReturnType<typeof optimizeSingle>, query: string): number {
  const index = results.findIndex((result) => result.query === query)
  expect(index).toBeGreaterThanOrEqual(0)
  return index
}

describe('optimizeSingle', () => {
  test('keeps only complete queries and reports distinct visible junk with match explanations', () => {
    const results = optimizeSingle(fixture())
    const dirty = results.find((result) => result.query === '4')

    expect(dirty).toMatchObject({
      query: '4',
      coveredTargetIds: ['minecraft:diamond_sword', 'minecraft:iron_sword'],
      junkItemIds: ['minecraft:second_junk', 'minecraft:shared_junk'],
      score: {
        lengthPenalty: 0,
        junkPresencePenalty: 2,
        junkCountPenalty: 1,
        total: 3,
      },
    })
    expect(dirty?.explanations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        matchedMemberItemId: 'minecraft:iron_sword',
        visibleOutputItemId: 'minecraft:iron_sword',
        source: 'name',
        line: 'Sword 4 z ab cd ef İx 1',
        matchedSpan: { start: 6, end: 7, text: '4' },
      }),
      expect.objectContaining({ visibleOutputItemId: 'minecraft:shared_junk' }),
      expect.objectContaining({ visibleOutputItemId: 'minecraft:second_junk' }),
    ]))
    expect(results.map((result) => result.query)).not.toContain('1')
    expect(dirty?.junkItemIds).not.toContain('minecraft:iron_sword')
  })

  test('discards single crafts with more junk than the remaining 40-result capacity', () => {
    const candidate = (junkCount: number) => ({
      query: 'target',
      targetMask: 1n,
      coveredTargetIds: ['target:0'],
      junkItemIds: Array.from({ length: junkCount }, (_, index) => `junk:${index}`),
      explanations: [],
    })

    expect(optimizeSinglePrepared({ targetIds: ['target:0'], candidates: [candidate(39)] })).toHaveLength(1)
    expect(optimizeSinglePrepared({ targetIds: ['target:0'], candidates: [candidate(40)] })).toEqual([])
  })

  test('ranks by score, junk appearances, fixed step count, typed characters, then query text', () => {
    const results = optimizeSingle(fixture())

    // A clean three-character query outranks the dirty one-character query on score.
    expect(resultIndex(results, 'swo')).toBeLessThan(resultIndex(results, '4'))
    // Equal scores: clean five-character "sword" beats dirty one-character "4".
    expect(resultIndex(results, 'sword')).toBeLessThan(resultIndex(results, '4'))
    // Single-query results all take one step; fewer newly typed characters breaks this tie.
    expect(resultIndex(results, 'z')).toBeLessThan(resultIndex(results, 'ab'))
    // Equal score, junk, step count, and typing cost fall back to alphabetical query text.
    expect(resultIndex(results, 'cd')).toBeLessThan(resultIndex(results, 'ef'))
  })

  test('forwards original Unicode-safe match spans in explanations', () => {
    const result = optimizeSingle(fixture()).find((candidate) => candidate.query === 'x')

    expect(result?.explanations).toContainEqual(expect.objectContaining({
      matchedMemberItemId: 'minecraft:iron_sword',
      visibleOutputItemId: 'minecraft:iron_sword',
      matchedSpan: { start: 20, end: 21, text: 'x' },
    }))
  })

  test('covers an exact target through an uncraftable alias and charges only eligible exact junk', () => {
    const brownBed = item('minecraft:brown_bed', 'Brown Bed')
    const whiteBed = item('minecraft:white_bed', 'Ivory Rest')
    const brownCarpet = item('minecraft:brown_carpet', 'Brown Carpet')
    const whiteCarpet = item('minecraft:white_carpet', 'Ivory Rug')
    const bedCollectionId = 'collection:bed'
    const carpetCollectionId = 'collection:carpet'
    const brownBedRecipe = recipe('recipe:brown_bed', brownBed.id, bedCollectionId)
    const whiteBedRecipe = recipe('recipe:white_bed', whiteBed.id, bedCollectionId)
    const brownCarpetRecipe = recipe('recipe:brown_carpet', brownCarpet.id, carpetCollectionId)
    const whiteCarpetRecipe = recipe('recipe:white_carpet', whiteCarpet.id, carpetCollectionId)
    const input: OptimizeInput = {
      targetIds: new Set([whiteBed.id]),
      eligibleRecipes: [whiteBedRecipe, whiteCarpetRecipe],
      recipes: [brownBedRecipe, whiteBedRecipe, brownCarpetRecipe, whiteCarpetRecipe],
      collections: new Map([
        [bedCollectionId, collection(
          bedCollectionId,
          [brownBedRecipe.id, whiteBedRecipe.id],
          [brownBed.id, whiteBed.id],
          'bed',
        )],
        [carpetCollectionId, collection(
          carpetCollectionId,
          [brownCarpetRecipe.id, whiteCarpetRecipe.id],
          [brownCarpet.id, whiteCarpet.id],
          'carpet',
        )],
      ]),
      items: new Map([brownBed, whiteBed, brownCarpet, whiteCarpet].map((searchItem) => [
        searchItem.id,
        searchItem,
      ])),
    }

    const result = optimizeSingle(input).find(({ query }) => query === 'wn')

    expect(result).toMatchObject({
      coveredTargetIds: [whiteBed.id],
      junkItemIds: [whiteCarpet.id],
    })
    expect(result?.junkItemIds).not.toContain(brownBed.id)
    expect(result?.junkItemIds).not.toContain(brownCarpet.id)
    expect(result?.explanations).toContainEqual(expect.objectContaining({
      query: 'wn',
      collectionId: bedCollectionId,
      matchedMemberItemId: brownBed.id,
      visibleOutputItemId: whiteBed.id,
    }))
  })

  test('prepares deeply equal synchronous and cooperative candidates per eligible collection', async () => {
    const visible = item('target:visible', 'x')
    const alias = item('alias:member', 'a')
    const collectionId = 'collection:alias'
    const visibleRecipe = recipe('recipe:visible', visible.id, collectionId)
    const aliasRecipe = recipe('recipe:alias', alias.id, collectionId)
    const input: OptimizeInput = {
      targetIds: new Set([visible.id]),
      eligibleRecipes: [visibleRecipe],
      recipes: [aliasRecipe, visibleRecipe],
      collections: new Map([[collectionId, collection(
        collectionId,
        [aliasRecipe.id, visibleRecipe.id],
        [alias.id, visible.id],
      )]]),
      items: new Map([alias, visible].map((searchItem) => [searchItem.id, searchItem])),
    }
    const progress: Array<[number, number]> = []
    let yieldCount = 0

    const cooperative = await prepareOptimizationCooperatively(input, {
      workChunkSize: 1,
      yieldControl: async () => { yieldCount += 1 },
      onProgress: (completed, total) => progress.push([completed, total]),
    })

    expect(cooperative).toEqual(prepareOptimization(input))
    expect(progress.at(-1)).toEqual([2, 2])
    expect(yieldCount).toBe(4)
  })
})
