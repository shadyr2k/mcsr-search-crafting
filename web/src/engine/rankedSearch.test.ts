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
    score: { initialLengthPenalty: 0, transitionTypingPenalty: 0, junkPresencePenalty: 2, junkCountPenalty: 0.5, total },
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
      score: { initialLengthPenalty: 0, transitionTypingPenalty: 0, junkPresencePenalty: 4, junkCountPenalty: 1, total: 5 },
    }
    const ranked = rankedFromOverlap(raw)

    expect(ranked.totalScore).toBe(5)
    expect(ranked.totalTypedCharacters).toBe(2)
    expect(ranked.steps.reduce((sum, step) => sum + step.score.total, 0)).toBe(5)
    expect(rankedFromSingle(single('abcd', 2)).steps).toHaveLength(1)
  })
})
