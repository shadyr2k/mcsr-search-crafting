import { candidateQueries } from './candidates'
import { type MatchExplanation, matchItem } from './search'
import { scoreStep, transitionTypingCost } from './scoring'
import type { OptimizeInput } from './singleOptimizer'

export interface OverlapStep {
  query: string
  coveredTargetIds: string[]
  newTargetIds: string[]
  junkItemIds: string[]
  explanations: MatchExplanation[]
  retainedPrefix: string
  freeBackspaceCount: number
  typedSuffix: string
}

export interface OverlapScoreBreakdown {
  initialLengthPenalty: number
  transitionTypingPenalty: number
  junkPresencePenalty: number
  junkCountPenalty: number
  total: number
}

export interface OverlapResult {
  steps: OverlapStep[]
  coveredTargetIds: string[]
  junkItemIds: string[]
  totalJunkAppearances: number
  newCharacterCount: number
  score: OverlapScoreBreakdown
}

interface Candidate {
  query: string
  targetMask: bigint
  coveredTargetIds: string[]
  junkItemIds: string[]
  explanations: MatchExplanation[]
}

interface SearchState {
  coveredMask: bigint
  lastQuery: string
  steps: OverlapStep[]
  totalJunkAppearances: number
  newCharacterCount: number
  score: OverlapScoreBreakdown
}

interface RankedPath {
  steps: OverlapStep[]
  totalJunkAppearances: number
  newCharacterCount: number
  score: OverlapScoreBreakdown
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareSequences(left: readonly OverlapStep[], right: readonly OverlapStep[]): number {
  const comparableLength = Math.min(left.length, right.length)

  for (let index = 0; index < comparableLength; index += 1) {
    const comparison = compareText(left[index].query, right[index].query)
    if (comparison !== 0) return comparison
  }

  return left.length - right.length
}

function compareRankedPaths(left: RankedPath, right: RankedPath): number {
  return left.score.total - right.score.total
    || left.totalJunkAppearances - right.totalJunkAppearances
    || left.steps.length - right.steps.length
    || left.newCharacterCount - right.newCharacterCount
    || compareSequences(left.steps, right.steps)
}

function countBits(mask: bigint): number {
  let remaining = mask
  let count = 0

  while (remaining !== 0n) {
    remaining &= remaining - 1n
    count += 1
  }

  return count
}

function targetIdsForMask(targetIds: readonly string[], mask: bigint): string[] {
  return targetIds.filter((_, index) => (mask & (1n << BigInt(index))) !== 0n)
}

function precomputeCandidates(input: OptimizeInput, targetIds: readonly string[]): Candidate[] {
  const targetIdSet = new Set(targetIds)
  const targetIndexes = new Map(targetIds.map((targetId, index) => [targetId, index]))
  const targetItems = targetIds
    .map((targetId) => input.items.get(targetId))
    .filter((target): target is NonNullable<typeof target> => target !== undefined)
  const visibleItemIds = [...input.visibleItemIds].sort(compareText)
  const candidates: Candidate[] = []

  for (const query of candidateQueries(targetItems)) {
    const matchedItemIds = new Set<string>()
    const explanations: MatchExplanation[] = []

    for (const itemId of visibleItemIds) {
      const item = input.items.get(itemId)
      if (item === undefined) continue

      const itemExplanations = matchItem(item, query)
      if (itemExplanations.length === 0) continue

      matchedItemIds.add(itemId)
      explanations.push(...itemExplanations)
    }

    const coveredTargetIds = targetIds.filter((targetId) => matchedItemIds.has(targetId))
    if (coveredTargetIds.length === 0) continue

    let targetMask = 0n
    for (const targetId of coveredTargetIds) {
      targetMask |= 1n << BigInt(targetIndexes.get(targetId)!)
    }

    candidates.push({
      query,
      targetMask,
      coveredTargetIds,
      junkItemIds: [...matchedItemIds]
        .filter((itemId) => !targetIdSet.has(itemId))
        .sort(compareText),
      explanations,
    })
  }

  return candidates
}

function candidateJunkScore(candidate: Candidate) {
  return scoreStep(0, candidate.junkItemIds.length)
}

function initialState(candidate: Candidate): SearchState {
  const stepScore = scoreStep(candidate.query.length, candidate.junkItemIds.length)

  return {
    coveredMask: candidate.targetMask,
    lastQuery: candidate.query,
    steps: [{
      query: candidate.query,
      coveredTargetIds: candidate.coveredTargetIds,
      newTargetIds: candidate.coveredTargetIds,
      junkItemIds: candidate.junkItemIds,
      explanations: candidate.explanations,
      retainedPrefix: '',
      freeBackspaceCount: 0,
      typedSuffix: candidate.query,
    }],
    totalJunkAppearances: candidate.junkItemIds.length,
    newCharacterCount: candidate.query.length,
    score: {
      initialLengthPenalty: stepScore.lengthPenalty,
      transitionTypingPenalty: 0,
      junkPresencePenalty: stepScore.junkPresencePenalty,
      junkCountPenalty: stepScore.junkCountPenalty,
      total: stepScore.total,
    },
  }
}

function transitionState(
  state: SearchState,
  candidate: Candidate,
  targetIds: readonly string[],
): SearchState {
  const newMask = candidate.targetMask & ~state.coveredMask
  const typedCharacterCount = transitionTypingCost(state.lastQuery, candidate.query)
  const retainedLength = candidate.query.length - typedCharacterCount
  const junkScore = candidateJunkScore(candidate)

  return {
    coveredMask: state.coveredMask | candidate.targetMask,
    lastQuery: candidate.query,
    steps: [...state.steps, {
      query: candidate.query,
      coveredTargetIds: candidate.coveredTargetIds,
      newTargetIds: targetIdsForMask(targetIds, newMask),
      junkItemIds: candidate.junkItemIds,
      explanations: candidate.explanations,
      retainedPrefix: candidate.query.slice(0, retainedLength),
      freeBackspaceCount: state.lastQuery.length - retainedLength,
      typedSuffix: candidate.query.slice(retainedLength),
    }],
    totalJunkAppearances: state.totalJunkAppearances + candidate.junkItemIds.length,
    newCharacterCount: state.newCharacterCount + typedCharacterCount,
    score: {
      initialLengthPenalty: state.score.initialLengthPenalty,
      transitionTypingPenalty: state.score.transitionTypingPenalty + typedCharacterCount,
      junkPresencePenalty: state.score.junkPresencePenalty + junkScore.junkPresencePenalty,
      junkCountPenalty: state.score.junkCountPenalty + junkScore.junkCountPenalty,
      total: state.score.total + typedCharacterCount + junkScore.total,
    },
  }
}

function stateKey(state: Pick<SearchState, 'coveredMask' | 'lastQuery'>): string {
  return `${state.coveredMask.toString()}:${state.lastQuery}`
}

function retainBetterState(states: Map<string, SearchState>, candidate: SearchState): void {
  const key = stateKey(candidate)
  const existing = states.get(key)

  if (existing === undefined || compareRankedPaths(candidate, existing) < 0) {
    states.set(key, candidate)
  }
}

function toResult(state: SearchState, targetIds: string[]): OverlapResult {
  const combinedJunk = new Set<string>()
  for (const step of state.steps) {
    for (const itemId of step.junkItemIds) combinedJunk.add(itemId)
  }

  return {
    steps: state.steps,
    coveredTargetIds: targetIds,
    junkItemIds: [...combinedJunk].sort(compareText),
    totalJunkAppearances: state.totalJunkAppearances,
    newCharacterCount: state.newCharacterCount,
    score: state.score,
  }
}

export function optimizeOverlap(input: OptimizeInput): OverlapResult[] {
  const targetIds = [...input.targetIds].sort(compareText)
  if (targetIds.length === 0) return []

  const candidates = precomputeCandidates(input, targetIds)
  const statesByCoverage = Array.from(
    { length: targetIds.length + 1 },
    () => new Map<string, SearchState>(),
  )

  for (const candidate of candidates) {
    const state = initialState(candidate)
    retainBetterState(statesByCoverage[countBits(state.coveredMask)], state)
  }

  for (let coveredCount = 1; coveredCount < targetIds.length; coveredCount += 1) {
    for (const state of statesByCoverage[coveredCount].values()) {
      for (const candidate of candidates) {
        if ((candidate.targetMask & ~state.coveredMask) === 0n) continue

        const nextState = transitionState(state, candidate, targetIds)
        retainBetterState(statesByCoverage[countBits(nextState.coveredMask)], nextState)
      }
    }
  }

  return [...statesByCoverage[targetIds.length].values()]
    .map((state) => toResult(state, targetIds))
    .sort(compareRankedPaths)
}
