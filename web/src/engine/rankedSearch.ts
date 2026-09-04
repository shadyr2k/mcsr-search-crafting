import type { RankedSearch, RankedSearchStep } from '../domain/types'

import type { OverlapResult } from './overlapOptimizer'
import type { SingleResult } from './singleOptimizer'
import { scoreStep } from './scoring'

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareSequences(left: readonly string[], right: readonly string[]): number {
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const comparison = compareText(left[index], right[index])
    if (comparison !== 0) return comparison
  }
  return left.length - right.length
}

export function rankedFromSingle(result: SingleResult): RankedSearch {
  const step: RankedSearchStep = {
    query: result.query,
    retainedPrefix: '',
    freeBackspaceCount: 0,
    typedSuffix: result.query,
    coveredTargetIds: [...result.coveredTargetIds],
    newTargetIds: [...result.coveredTargetIds],
    junkItemIds: [...result.junkItemIds],
    explanations: [...result.explanations],
    score: {
      typingPenalty: result.score.lengthPenalty,
      junkPresencePenalty: result.score.junkPresencePenalty,
      junkCountPenalty: result.score.junkCountPenalty,
      total: result.score.total,
    },
  }
  return {
    kind: 'single',
    queries: [result.query],
    steps: [step],
    coveredTargetIds: [...result.coveredTargetIds],
    totalJunkAppearances: result.junkItemIds.length,
    totalTypedCharacters: result.query.length,
    totalScore: result.score.total,
  }
}

export function rankedFromOverlap(result: OverlapResult): RankedSearch {
  const steps = result.steps.map((step, index): RankedSearchStep => {
    const junkScore = scoreStep(0, step.junkItemIds.length)
    const typingPenalty = index === 0
      ? result.score.initialLengthPenalty
      : step.typedSuffix.length
    return {
      ...step,
      coveredTargetIds: [...step.coveredTargetIds],
      newTargetIds: [...step.newTargetIds],
      junkItemIds: [...step.junkItemIds],
      explanations: [...step.explanations],
      score: {
        typingPenalty,
        junkPresencePenalty: junkScore.junkPresencePenalty,
        junkCountPenalty: junkScore.junkCountPenalty,
        total: typingPenalty + junkScore.junkPresencePenalty + junkScore.junkCountPenalty,
      },
    }
  })
  return {
    kind: 'overlap',
    queries: result.steps.map(({ query }) => query),
    steps,
    coveredTargetIds: [...result.coveredTargetIds],
    totalJunkAppearances: result.totalJunkAppearances,
    totalTypedCharacters: result.newCharacterCount,
    totalScore: result.score.total,
  }
}

export function compareRankedSearches(left: RankedSearch, right: RankedSearch): number {
  return left.totalScore - right.totalScore
    || left.totalJunkAppearances - right.totalJunkAppearances
    || left.steps.length - right.steps.length
    || left.totalTypedCharacters - right.totalTypedCharacters
    || compareSequences(left.queries, right.queries)
}

export function rankSearches(
  single: readonly SingleResult[],
  overlap: readonly OverlapResult[],
): RankedSearch[] {
  return [
    ...single.map(rankedFromSingle),
    ...overlap.map(rankedFromOverlap),
  ].sort(compareRankedSearches)
}

export function searchSequenceLabel(result: RankedSearch): string {
  return result.queries.join(' → ')
}
