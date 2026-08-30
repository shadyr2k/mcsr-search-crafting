import type { CraftingRecipe, RecipeResultCollection, SearchItem } from '../domain/types'

import { candidateQueriesForTargets } from './candidates'
import { matchEligibleCollectionOutputs } from './collectionSearch'
import type { CollectionMatchExplanation } from './search'
import { type ScoreBreakdown, scoreStep } from './scoring'

export interface OptimizeInput {
  targetIds: ReadonlySet<string>
  eligibleRecipes: readonly CraftingRecipe[]
  recipes: readonly CraftingRecipe[]
  collections: ReadonlyMap<string, RecipeResultCollection>
  items: ReadonlyMap<string, SearchItem>
}

export interface SingleResult {
  query: string
  coveredTargetIds: string[]
  junkItemIds: string[]
  explanations: CollectionMatchExplanation[]
  score: ScoreBreakdown
}

export interface PreparedCandidate {
  query: string
  targetMask: bigint
  coveredTargetIds: string[]
  junkItemIds: string[]
  explanations: CollectionMatchExplanation[]
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
  const eligibleCollectionIds = [...new Set(
    input.eligibleRecipes.map(({ resultCollectionId }) => resultCollectionId),
  )].sort(compareText)
  const eligibleCollections = eligibleCollectionIds.map((collectionId) => ({
    collectionId,
    recipes: input.eligibleRecipes.filter(
      ({ resultCollectionId }) => resultCollectionId === collectionId,
    ),
  }))
  const queries = candidateQueriesForTargets(
    input.targetIds,
    input.recipes,
    input.collections,
    input.items,
  )
  return { targetIds, targetIdSet, targetIndexes, eligibleCollections, queries }
}

function addCollectionMatches(
  input: OptimizeInput,
  query: string,
  eligibleRecipes: readonly CraftingRecipe[],
  matchedItemIds: Set<string>,
  explanations: CollectionMatchExplanation[],
): void {
  const matches = matchEligibleCollectionOutputs(
    query,
    eligibleRecipes,
    input.collections,
    input.items,
  )
  for (const [outputItemId, outputExplanations] of matches) {
    matchedItemIds.add(outputItemId)
    explanations.push(...outputExplanations)
  }
}

function preparedCandidateFromMatches(
  context: ReturnType<typeof preparationContext>,
  query: string,
  matchedItemIds: ReadonlySet<string>,
  explanations: CollectionMatchExplanation[],
): PreparedCandidate | undefined {
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
  const candidates: PreparedCandidate[] = []
  for (const query of context.queries) {
    const matchedItemIds = new Set<string>()
    const explanations: CollectionMatchExplanation[] = []
    for (const { recipes } of context.eligibleCollections) {
      addCollectionMatches(input, query, recipes, matchedItemIds, explanations)
    }
    const candidate = preparedCandidateFromMatches(context, query, matchedItemIds, explanations)
    if (candidate !== undefined) candidates.push(candidate)
  }
  return { targetIds: context.targetIds, candidates }
}

export async function prepareOptimizationCooperatively(
  input: OptimizeInput,
  options: CooperativePreparationOptions,
): Promise<PreparedOptimization> {
  const context = preparationContext(input)
  const candidates: PreparedCandidate[] = []
  const total = context.queries.length * context.eligibleCollections.length
  const boundedChunkSize = chunkSize(options.workChunkSize)
  let completed = 0
  let workSinceYield = 0

  throwIfAborted(options.signal)
  options.onProgress?.(completed, total)
  for (const query of context.queries) {
    const matchedItemIds = new Set<string>()
    const explanations: CollectionMatchExplanation[] = []

    for (const { recipes } of context.eligibleCollections) {
      addCollectionMatches(input, query, recipes, matchedItemIds, explanations)

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

    const candidate = preparedCandidateFromMatches(context, query, matchedItemIds, explanations)
    if (candidate !== undefined) candidates.push(candidate)
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
