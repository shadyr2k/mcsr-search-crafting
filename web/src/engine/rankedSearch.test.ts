import { describe, expect, test } from 'vitest'

import type { OverlapResult } from './overlapOptimizer'
import type { SingleResult } from './singleOptimizer'
import { compareRankedSearches, rankedFromOverlap, rankedFromSingle, rankSearches } from './rankedSearch'

function single(query: string, total: number, junk: string[] = []): SingleResult {
  return {
    query,
    coveredTargetIds: ['minecraft:stick'],
    junkItemIds: junk,
    explanations: [],
    score: { lengthPenalty: Math.max(0, query.length - 2), junkPresencePenalty: junk.length ? 2 : 0, junkCountPenalty: junk.length * 0.5, total },
  }
}

function overlap(queries: string[], total: number): OverlapResult {
  const steps = queries.map((query, index) => ({
    query,
    coveredTargetIds: ['minecraft:stick'],
    newTargetIds: ['minecraft:stick'],
    junkItemIds: index === 0 ? ['minecraft:dirt'] : [],
    explanations: [],
    retainedPrefix: index === 0 ? '' : queries[index - 1],
    freeBackspaceCount: index === 0 ? 0 : 2,
    typedSuffix: index === 0 ? query : query.slice(queries[index - 1].length),
  }))
  return {
    steps,
    coveredTargetIds: ['minecraft:stick'],
    junkItemIds: ['minecraft:dirt'],
    totalJunkAppearances: 1,
    newCharacterCount: queries.reduce((count, query, index) => count + (index === 0 ? query.length : query.length - queries[index - 1].length), 0),
    characterReuseCount: 0,
    score: { initialLengthPenalty: 0, transitionTypingPenalty: 0, junkPresencePenalty: 2, junkCountPenalty: 0.5, total },
  }
}

function junklessOverlap(queries: string[], total: number, typedCharacters: number): OverlapResult {
  return {
    steps: queries.map((query, index) => ({
      query,
      coveredTargetIds: ['minecraft:stick'],
      newTargetIds: ['minecraft:stick'],
      junkItemIds: [],
      explanations: [],
      retainedPrefix: '',
      freeBackspaceCount: index === 0 ? 0 : queries[index - 1].length,
      typedSuffix: query,
    })),
    coveredTargetIds: ['minecraft:stick'],
    junkItemIds: [],
    totalJunkAppearances: 0,
    newCharacterCount: typedCharacters,
    characterReuseCount: 0,
    score: { initialLengthPenalty: 0, transitionTypingPenalty: 0, junkPresencePenalty: 0, junkCountPenalty: 0, total },
  }
}

describe('ranked search adapters', () => {
  test('mixes single and overlap results by the approved total ordering', () => {
    const ranked = rankSearches(
      [single('abc', 4, ['minecraft:dirt']), single('z', 2)],
      [overlap(['b', 'bo'], 1), overlap(['a', 'ax'], 2)],
    )

    expect(ranked.map((result) => result.queries.join('→'))).toEqual(['b→bo', 'z', 'a→ax', 'abc'])
  })

  test('breaks equal scores by junk, steps, typed characters, then lexical sequence', () => {
    const results = [
      rankedFromSingle(single('zz', 2, ['minecraft:dirt'])),
      rankedFromSingle(single('b', 2)),
      rankedFromSingle(single('a', 2)),
    ].sort(compareRankedSearches)

    expect(results.map((result) => result.queries.join('→'))).toEqual(['a', 'b', 'zz'])
  })

  test('prefers equal-cost overlap crafts that reuse more query characters', () => {
    const results = [
      rankedFromOverlap(overlap(['+5 at', 'd sw', 'e sw'], 11)),
      rankedFromOverlap(overlap(['on sw', 'd sw', 'e sw'], 11)),
    ].sort(compareRankedSearches)

    expect(results.map((result) => result.queries.join('→'))).toEqual([
      'on sw→d sw→e sw',
      '+5 at→d sw→e sw',
    ])
  })

  test('prefers a shorter displayed sequence before character-reuse similarity', () => {
    const results = [
      rankedFromOverlap(junklessOverlap(['all', 'qu'], 2, 4)),
      rankedFromOverlap(junklessOverlap(['aq', 'll'], 2, 4)),
    ].sort(compareRankedSearches)

    expect(results.map((result) => result.queries.join('→'))).toEqual(['aq→ll', 'all→qu'])
  })

  test('prefers fewer correction keys before lexical query ordering', () => {
    const common = {
      coveredTargetIds: ['minecraft:stick'],
      junkItemIds: [],
      totalJunkAppearances: 0,
      newCharacterCount: 4,
      characterReuseCount: 1,
      score: { initialLengthPenalty: 0, transitionTypingPenalty: 2, junkPresencePenalty: 0, junkCountPenalty: 0, total: 2 },
    }
    const fewerCorrections = rankedFromOverlap({
      ...common,
      steps: [
        { query: 'aq', coveredTargetIds: ['minecraft:stick'], newTargetIds: ['minecraft:stick'], junkItemIds: [], explanations: [], retainedPrefix: '', freeBackspaceCount: 0, typedSuffix: 'aq' },
        { query: 'all', coveredTargetIds: ['minecraft:stick'], newTargetIds: ['minecraft:stick'], junkItemIds: [], explanations: [], retainedPrefix: 'a', freeBackspaceCount: 1, typedSuffix: 'll' },
      ],
    })
    const moreCorrections = rankedFromOverlap({
      ...common,
      steps: [
        { query: 'all', coveredTargetIds: ['minecraft:stick'], newTargetIds: ['minecraft:stick'], junkItemIds: [], explanations: [], retainedPrefix: '', freeBackspaceCount: 0, typedSuffix: 'all' },
        { query: 'aq', coveredTargetIds: ['minecraft:stick'], newTargetIds: ['minecraft:stick'], junkItemIds: [], explanations: [], retainedPrefix: 'a', freeBackspaceCount: 2, typedSuffix: 'q' },
      ],
    })

    expect([moreCorrections, fewerCorrections].sort(compareRankedSearches)).toEqual([
      fewerCorrections,
      moreCorrections,
    ])
  })

  test('keeps equally ranked crafts with shared characters together before unique alternatives', () => {
    const ranked = rankSearches(
      [single('aaa', 3), single('rst', 3), single('rsu', 3)],
      [],
    )

    expect(ranked.map((result) => result.queries.join('→'))).toEqual(['rst', 'rsu', 'aaa'])
  })

  test('preserves raw score totals and excludes free backspaces from typed characters', () => {
    const raw: OverlapResult = {
      steps: [
        { query: 'ab', coveredTargetIds: ['minecraft:stick'], newTargetIds: ['minecraft:stick'], junkItemIds: ['minecraft:dirt'], explanations: [], retainedPrefix: '', freeBackspaceCount: 0, typedSuffix: 'ab' },
        { query: 'a', coveredTargetIds: ['minecraft:stick'], newTargetIds: [], junkItemIds: ['minecraft:stone'], explanations: [], retainedPrefix: 'a', freeBackspaceCount: 1, typedSuffix: '' },
      ],
      coveredTargetIds: ['minecraft:stick'],
      junkItemIds: ['minecraft:dirt', 'minecraft:stone'],
      totalJunkAppearances: 2,
      newCharacterCount: 2,
      characterReuseCount: 0,
      score: { initialLengthPenalty: 0, transitionTypingPenalty: 0, junkPresencePenalty: 4, junkCountPenalty: 1, total: 5 },
    }
    const ranked = rankedFromOverlap(raw)

    expect(ranked.totalScore).toBe(5)
    expect(ranked.totalTypedCharacters).toBe(2)
    expect(ranked.steps.reduce((sum, step) => sum + step.score.total, 0)).toBe(5)
    expect(rankedFromSingle(single('abcd', 2)).steps).toHaveLength(1)
  })
})
