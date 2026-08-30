import { describe, expect, test } from 'vitest'

import type { CraftingRecipe, RecipeResultCollection, SearchItem } from '../domain/types'
import { optimizeOverlap, type OverlapResult } from './overlapOptimizer'
import type { OptimizeInput } from './singleOptimizer'

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
  return { id, recipeBookCategory: 'crafting_misc', recipeGroup, recipeIds, outputItemIds }
}

function fixture(targets: SearchItem[], junk: SearchItem[] = []): OptimizeInput {
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

function sequence(result: OverlapResult): string[] {
  return result.steps.map(({ query }) => query)
}

function findSequence(results: OverlapResult[], queries: string[]): OverlapResult {
  const result = results.find((candidate) => sequence(candidate).join('\0') === queries.join('\0'))
  expect(result, `missing sequence ${queries.join(' -> ')}`).toBeDefined()
  return result!
}

describe('optimizeOverlap', () => {
  test('reports retained prefixes, free backspaces, typed suffixes, and match explanations', () => {
    const targets = [item('target:bed', 'bed'), item('target:bow', 'bow')]
    const shortBedJunk = item('junk:bed-parts', 'b be e ed d')
    const shortBowJunk = item('junk:bow-parts', 'b bo o ow w')

    const result = findSequence(
      optimizeOverlap(fixture(targets, [shortBedJunk, shortBowJunk])),
      ['bed', 'bow'],
    )

    expect(result.steps[0]).toMatchObject({
      query: 'bed',
      newTargetIds: ['target:bed'],
      retainedPrefix: '',
      freeBackspaceCount: 0,
      typedSuffix: 'bed',
      junkItemIds: [],
    })
    expect(result.steps[1]).toMatchObject({
      query: 'bow',
      newTargetIds: ['target:bow'],
      retainedPrefix: 'b',
      freeBackspaceCount: 2,
      typedSuffix: 'ow',
      junkItemIds: [],
    })
    expect(result.steps[1].explanations).toContainEqual(expect.objectContaining({
      matchedMemberItemId: 'target:bow',
      visibleOutputItemId: 'target:bow',
      line: 'bow',
      matchedSpan: { start: 0, end: 3, text: 'bow' },
    }))
    expect(result.score).toEqual({
      initialLengthPenalty: 1,
      transitionTypingPenalty: 2,
      junkPresencePenalty: 0,
      junkCountPenalty: 0,
      total: 3,
    })
  })

  test('ranks directional edit order using only the newly typed suffix after the first step', () => {
    const targets = [item('target:a', 'a'), item('target:bow', 'bow')]
    const shortBowJunk = item('junk:bow-parts', 'b bo o ow w')
    const results = optimizeOverlap(fixture(targets, [shortBowJunk]))
    const bowThenA = findSequence(results, ['bow', 'a'])
    const aThenBow = findSequence(results, ['a', 'bow'])

    expect(bowThenA.steps[1]).toMatchObject({
      retainedPrefix: '',
      freeBackspaceCount: 3,
      typedSuffix: 'a',
    })
    expect(bowThenA.score.total).toBe(2)
    expect(aThenBow.score.total).toBe(3)
    expect(results.indexOf(bowThenA)).toBeLessThan(results.indexOf(aThenBow))
  })

  test('charges repeated junk independently at every step but combines it once for context', () => {
    const targets = [item('target:ax', 'ax'), item('target:by', 'by')]
    const sharedJunk = item('junk:shared', 'ax by')
    const result = optimizeOverlap(fixture(targets, [sharedJunk]))[0]

    expect(result.steps).toHaveLength(2)
    expect(result.steps.map(({ junkItemIds }) => junkItemIds)).toEqual([
      ['junk:shared'],
      ['junk:shared'],
    ])
    expect(result.junkItemIds).toEqual(['junk:shared'])
    expect(result.totalJunkAppearances).toBe(2)
    expect(result.score.junkPresencePenalty).toBe(4)
    expect(result.score.junkCountPenalty).toBe(1)
    expect(result.steps.flatMap(({ junkItemIds }) => junkItemIds)).not.toContain('target:ax')
    expect(result.steps.flatMap(({ junkItemIds }) => junkItemIds)).not.toContain('target:by')
  })

  test('allows one step to add multiple targets and never keeps a step that adds no target', () => {
    const targets = [item('target:red-bed', 'red bed'), item('target:blue-bed', 'blue bed')]
    const results = optimizeOverlap(fixture(targets))
    const shared = findSequence(results, ['bed'])

    expect(shared.steps[0].coveredTargetIds).toEqual(['target:blue-bed', 'target:red-bed'])
    expect(shared.steps[0].newTargetIds).toEqual(['target:blue-bed', 'target:red-bed'])
    expect(shared.steps[0].junkItemIds).toEqual([])
    expect(results.every((result) => result.steps.length <= targets.length)).toBe(true)
    expect(results.every((result) => result.steps.every(({ newTargetIds }) => newTargetIds.length > 0))).toBe(true)
  })

  test('uses deterministic tie metrics when replacing states and ranking complete results', () => {
    const results = optimizeOverlap(fixture([item('target:ab', 'ab'), item('target:cd', 'cd')]))

    expect(results.slice(0, 4).map(sequence)).toEqual([
      ['a', 'c'],
      ['a', 'd'],
      ['c', 'a'],
      ['c', 'b'],
    ])
    expect(results.find((result) => result.steps.at(-1)?.query === 'a')?.steps[0].query).toBe('c')
  })

  test('carries alias-aware explanations through every overlap step', () => {
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
      targetIds: new Set([whiteBed.id, whiteCarpet.id]),
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

    const hasBedAlias = (step: OverlapResult['steps'][number]) => step.explanations.some(
      (explanation) => explanation.matchedMemberItemId === brownBed.id
        && explanation.visibleOutputItemId === whiteBed.id,
    )
    const hasCarpetAlias = (step: OverlapResult['steps'][number]) => step.explanations.some(
      (explanation) => explanation.matchedMemberItemId === brownCarpet.id
        && explanation.visibleOutputItemId === whiteCarpet.id,
    )
    const result = optimizeOverlap(input).find(({ steps }) =>
      steps.length === 2
      && steps.every((step) => hasBedAlias(step) || hasCarpetAlias(step))
      && steps.some(hasBedAlias)
      && steps.some(hasCarpetAlias),
    )

    expect(result).toBeDefined()

    expect(result!.steps.flatMap(({ explanations }) => explanations)).toContainEqual(expect.objectContaining({
      matchedMemberItemId: brownBed.id,
      visibleOutputItemId: whiteBed.id,
    }))
    expect(result!.steps.flatMap(({ explanations }) => explanations)).toContainEqual(expect.objectContaining({
      matchedMemberItemId: brownCarpet.id,
      visibleOutputItemId: whiteCarpet.id,
    }))
  })
})
