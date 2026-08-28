import type { SearchItem } from '../domain/types'

import { candidateQueries } from './candidates'
import { type MatchExplanation, matchItem } from './search'
import { type ScoreBreakdown, scoreStep } from './scoring'

export interface OptimizeInput {
  targetIds: ReadonlySet<string>
  visibleItemIds: ReadonlySet<string>
  items: ReadonlyMap<string, SearchItem>
}

export interface SingleResult {
  query: string
  coveredTargetIds: string[]
  junkItemIds: string[]
  explanations: MatchExplanation[]
  score: ScoreBreakdown
}

export interface PreparedCandidate {
  query: string
  targetMask: bigint
  coveredTargetIds: string[]
  junkItemIds: string[]
  explanations: MatchExplanation[]
}

export interface PreparedOptimization {
  targetIds: string[]
  candidates: PreparedCandidate[]
}

export interface CooperativePreparationOptions {
  signal?: AbortSignal
  yieldControl: () => Promise<void>
  workChunkSize?: number
  onProgress?: (completed: number, total: number) => void
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('Workspace optimization was cancelled.', 'AbortError')
}

function chunkSize(value: number | undefined): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value! : 4096
}

function preparationContext(input: OptimizeInput) {
  const targetIds = [...input.targetIds].sort(compareText)
  const targetIdSet = new Set(targetIds)
  const targetIndexes = new Map(targetIds.map((targetId, index) => [targetId, index]))
  const targetItems = targetIds
    .map((targetId) => input.items.get(targetId))
    .filter((target): target is SearchItem => target !== undefined)
  const visibleItemIds = [...input.visibleItemIds].sort(compareText)
  const queries = candidateQueries(targetItems)
  return { targetIds, targetIdSet, targetIndexes, visibleItemIds, queries }
}

function preparedCandidate(
  input: OptimizeInput,
  context: ReturnType<typeof preparationContext>,
  query: string,
): PreparedCandidate | undefined {
  const matchedItemIds = new Set<string>()
  const explanations: MatchExplanation[] = []

  for (const itemId of context.visibleItemIds) {
    const item = input.items.get(itemId)
    if (item === undefined) continue

    const itemExplanations = matchItem(item, query)
    if (itemExplanations.length === 0) continue

    matchedItemIds.add(itemId)
    explanations.push(...itemExplanations)
  }

  const coveredTargetIds = context.targetIds.filter((targetId) => matchedItemIds.has(targetId))
  if (coveredTargetIds.length === 0) return undefined

  let targetMask = 0n
  for (const targetId of coveredTargetIds) {
    targetMask |= 1n << BigInt(context.targetIndexes.get(targetId)!)
  }

  return {
    query,
    targetMask,
    coveredTargetIds,
    junkItemIds: [...matchedItemIds]
      .filter((itemId) => !context.targetIdSet.has(itemId))
      .sort(compareText),
    explanations,
  }
}

export function prepareOptimization(input: OptimizeInput): PreparedOptimization {
  const context = preparationContext(input)
  const candidates = context.queries
    .map((query) => preparedCandidate(input, context, query))
    .filter((candidate): candidate is PreparedCandidate => candidate !== undefined)
  return { targetIds: context.targetIds, candidates }
}

export async function prepareOptimizationCooperatively(
  input: OptimizeInput,
  options: CooperativePreparationOptions,
): Promise<PreparedOptimization> {
  const context = preparationContext(input)
  const candidates: PreparedCandidate[] = []
  const total = context.queries.length * context.visibleItemIds.length
  const boundedChunkSize = chunkSize(options.workChunkSize)
  let completed = 0
  let workSinceYield = 0

  throwIfAborted(options.signal)
  options.onProgress?.(completed, total)
  for (const query of context.queries) {
    const matchedItemIds = new Set<string>()
    const explanations: MatchExplanation[] = []

    for (const itemId of context.visibleItemIds) {
      const item = input.items.get(itemId)
      if (item !== undefined) {
        const itemExplanations = matchItem(item, query)
        if (itemExplanations.length > 0) {
          matchedItemIds.add(itemId)
          explanations.push(...itemExplanations)
        }
      }

      completed += 1
      workSinceYield += 1
      if (workSinceYield >= boundedChunkSize) {
        options.onProgress?.(completed, total)
        throwIfAborted(options.signal)
        await options.yieldControl()
        throwIfAborted(options.signal)
        workSinceYield = 0
      }
    }

    const coveredTargetIds = context.targetIds.filter((targetId) => matchedItemIds.has(targetId))
    if (coveredTargetIds.length === 0) continue

    let targetMask = 0n
    for (const targetId of coveredTargetIds) {
      targetMask |= 1n << BigInt(context.targetIndexes.get(targetId)!)
    }
    candidates.push({
      query,
      targetMask,
      coveredTargetIds,
      junkItemIds: [...matchedItemIds]
        .filter((itemId) => !context.targetIdSet.has(itemId))
        .sort(compareText),
      explanations,
    })
  }

  throwIfAborted(options.signal)
  options.onProgress?.(completed, total)
  return { targetIds: context.targetIds, candidates }
}

export function optimizeSinglePrepared(prepared: PreparedOptimization): SingleResult[] {
  if (prepared.targetIds.length === 0) return []
  const completeMask = (1n << BigInt(prepared.targetIds.length)) - 1n
  const results = prepared.candidates
    .filter((candidate) => candidate.targetMask === completeMask)
    .map((candidate): SingleResult => ({
      query: candidate.query,
      coveredTargetIds: candidate.coveredTargetIds,
      junkItemIds: candidate.junkItemIds,
      explanations: candidate.explanations,
      score: scoreStep(candidate.query.length, candidate.junkItemIds.length),
    }))

  return results.sort((left, right) =>
    left.score.total - right.score.total
    || left.junkItemIds.length - right.junkItemIds.length
    || left.query.length - right.query.length
    || compareText(left.query, right.query),
  )
}

export function optimizeSingle(input: OptimizeInput): SingleResult[] {
  return optimizeSinglePrepared(prepareOptimization(input))
}
