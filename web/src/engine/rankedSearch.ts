import type { RankedSearch, RankedSearchStep } from '../domain/types'

import type { OverlapResult } from './overlapOptimizer'
import { DEFAULT_SCORING_SETTINGS, type ScoringSettings, scoreControlKeys, scoreStep, sequenceCharacterReuse } from './scoring'
import type { SingleResult } from './singleOptimizer'

/** Bump when saved craft outcomes or score-cache ranking semantics change. */
export const SEARCH_ALGORITHM_REVISION = 3

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

function totalQueryCharacters(search: RankedSearch): number {
  return search.queries.reduce((total, query) => total + query.length, 0)
}

function singleSearchResultKey(search: RankedSearch): string {
  return [
    [...search.coveredTargetIds].sort(compareText).join('\u0000'),
    search.steps.flatMap((step) => step.junkItemIds).sort(compareText).join('\u0000'),
  ].join('\u0001')
}

/**
 * A colon adds item-ID matching without replacing localized text matches.
 * Hide an item-ID regular craft only when a shorter ordinary query produces
 * the exact same visible targets and junk.
 */
export function removeRedundantItemIdSearches(searches: readonly RankedSearch[]): RankedSearch[] {
  return searches.filter((search) => {
    if (search.kind !== 'single' || !search.queries[0]?.startsWith(':')) return true
    const key = singleSearchResultKey(search)
    return !searches.some((ordinarySearch) => ordinarySearch.kind === 'single'
      && !ordinarySearch.queries[0]?.startsWith(':')
      && singleSearchResultKey(ordinarySearch) === key
      && ordinarySearch.totalTypedCharacters < search.totalTypedCharacters)
  })
}

function correctionKeyCount(search: RankedSearch): number {
  return search.steps.slice(1).reduce((total, step, index) => {
    const previousQuery = search.steps[index].query
    const usesShiftHome = step.retainedPrefix.length === 0
      && step.freeBackspaceCount >= previousQuery.length
    return total + (usesShiftHome ? 2 : step.freeBackspaceCount)
  }, 0)
}

export function rankedFromSingle(result: SingleResult, _scoringSettings: ScoringSettings = DEFAULT_SCORING_SETTINGS): RankedSearch {
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

export function rankedFromOverlap(result: OverlapResult, scoringSettings: ScoringSettings = DEFAULT_SCORING_SETTINGS): RankedSearch {
  const steps = result.steps.map((step, index): RankedSearchStep => {
    const junkScore = scoreStep(0, step.junkItemIds.length, scoringSettings)
    const typingPenalty = index === 0
      ? result.score.initialLengthPenalty
      : step.typedSuffix.length * scoringSettings.additionalCharacterPenalty
    const controls = index === 0
      ? { backspacePenalty: 0, shiftHomePenalty: 0, total: 0 }
      : scoreControlKeys(result.steps[index - 1].query, step, scoringSettings)
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
        backspacePenalty: controls.backspacePenalty,
        shiftHomePenalty: controls.shiftHomePenalty,
        total: typingPenalty + junkScore.junkPresencePenalty + junkScore.junkCountPenalty + controls.total,
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
    || correctionKeyCount(left) - correctionKeyCount(right)
    || totalQueryCharacters(left) - totalQueryCharacters(right)
    || sequenceCharacterReuse(right.queries) - sequenceCharacterReuse(left.queries)
    || compareSequences(left.queries, right.queries)
}

function hasEqualPrimaryRank(left: RankedSearch, right: RankedSearch): boolean {
  return left.totalScore === right.totalScore
    && left.totalJunkAppearances === right.totalJunkAppearances
    && left.steps.length === right.steps.length
    && left.totalTypedCharacters === right.totalTypedCharacters
    && correctionKeyCount(left) === correctionKeyCount(right)
    && totalQueryCharacters(left) === totalQueryCharacters(right)
}

function queryCharacters(search: RankedSearch): Set<string> {
  return new Set(search.queries.join(''))
}

function sharedCharacters(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  let total = 0
  for (const character of left) if (right.has(character)) total += 1
  return total
}

function orderSimilarCrafts(searches: readonly RankedSearch[]): RankedSearch[] {
  const remaining = [...searches]
  const ordered: RankedSearch[] = []
  const usedCharacters = new Set<string>()

  while (remaining.length > 0) {
    const characterSets = new Map(remaining.map((search) => [search, queryCharacters(search)]))
    const next = [...remaining].sort((left, right) => {
      const leftCharacters = characterSets.get(left)!
      const rightCharacters = characterSets.get(right)!
      const leftSimilarity = ordered.length === 0
        ? remaining.filter((search) => search !== left).reduce((total, search) => total + sharedCharacters(leftCharacters, characterSets.get(search)!), 0)
        : sharedCharacters(leftCharacters, usedCharacters)
      const rightSimilarity = ordered.length === 0
        ? remaining.filter((search) => search !== right).reduce((total, search) => total + sharedCharacters(rightCharacters, characterSets.get(search)!), 0)
        : sharedCharacters(rightCharacters, usedCharacters)
      return rightSimilarity - leftSimilarity || compareRankedSearches(left, right)
    })[0]
    ordered.push(next)
    for (const character of characterSets.get(next)!) usedCharacters.add(character)
    remaining.splice(remaining.indexOf(next), 1)
  }

  return ordered
}

export function rankSearches(
  single: readonly SingleResult[],
  overlap: readonly OverlapResult[],
  scoringSettings: ScoringSettings = DEFAULT_SCORING_SETTINGS,
): RankedSearch[] {
  const ranked = removeRedundantItemIdSearches([
    ...single.map((result) => rankedFromSingle(result, scoringSettings)),
    ...overlap.map((result) => rankedFromOverlap(result, scoringSettings)),
  ]).sort(compareRankedSearches)
  const result: RankedSearch[] = []
  for (let index = 0; index < ranked.length;) {
    let end = index + 1
    while (end < ranked.length && hasEqualPrimaryRank(ranked[index], ranked[end])) end += 1
    result.push(...orderSimilarCrafts(ranked.slice(index, end)))
    index = end
  }
  return result
}

export function searchSequenceLabel(result: RankedSearch): string {
  return result.queries.join(' → ')
}
