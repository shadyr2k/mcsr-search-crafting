import type {
  EntryOptimizationOutcome,
  GeneratedData,
  RankedSearch,
  RowOptimizationState,
  TargetWorkspaceEntry,
} from '../domain/types'

import { eligibleRecipes } from './craftability'
import { optimizeOverlapPreparedCooperatively, type OverlapResult } from './overlapOptimizer'
import { DEFAULT_SCORING_SETTINGS, type ScoringSettings, incompleteScore, scoreStep } from './scoring'
import { compareRankedSearches, rankedFromSingle, rankSearches } from './rankedSearch'
import { maximumJunkItems } from './resultLimit'
import {
  optimizeSinglePrepared,
  prepareOptimizationCooperatively,
  type SingleResult,
} from './singleOptimizer'

export interface IncompleteAttempt {
  matchedTargetIds: string[]
  unmatchedTargetIds: string[]
  score: number
}

export interface WorkspaceEntryResult {
  entryId: string
  displayIndex: number
  targetIds: string[]
  gridSize: 2 | 3
  visibleItemIds: string[]
  single: SingleResult[]
  overlap: OverlapResult[]
  incomplete: IncompleteAttempt | null
  availableCompleteMethod: 'single' | 'overlap' | null
  bestScore: number
  itemSearches?: Record<string, RankedSearch[]>
}

export interface WorkspaceResult {
  entries: WorkspaceEntryResult[]
  aggregateScore: number
  skippedEmptyEntryCount: number
}

export type WorkspaceOptimizationPhase = 'matching' | 'overlap'

export interface WorkspaceOptimizationProgress {
  entryId: string
  entryIndex: number
  entryCount: number
  phase: WorkspaceOptimizationPhase
  completed: number
  total?: number
}

export interface OptimizeWorkspaceOptions {
  signal?: AbortSignal
  yieldControl?: () => Promise<void>
  workChunkSize?: number
  onProgress?: (progress: WorkspaceOptimizationProgress) => void
  scoringSettings?: ScoringSettings
  itemIdSearch?: boolean
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('Workspace optimization was cancelled.', 'AbortError')
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function optimizeEntry(
  data: GeneratedData,
  inventory: ReadonlySet<string>,
  entry: TargetWorkspaceEntry,
  displayIndex: number,
  entryIndex: number,
  entryCount: number,
  options: Required<Pick<OptimizeWorkspaceOptions, 'yieldControl'>> & OptimizeWorkspaceOptions,
): Promise<WorkspaceEntryResult> {
  const scoringSettings = options.scoringSettings ?? DEFAULT_SCORING_SETTINGS
  const eligible = eligibleRecipes(data.recipes, inventory, entry.gridSize)
  const visibleIds = new Set(eligible.map(({ outputItemId }) => outputItemId))
  const targetIds = [...new Set(entry.targetIds)]
  if (!entry.retainCraftOrder) targetIds.sort()
  const input = {
    targetIds: new Set(targetIds),
    eligibleRecipes: eligible,
    recipes: data.recipes,
    collections: data.collections,
    items: data.items,
  }
  const prepared = await prepareOptimizationCooperatively(input, {
    signal: options.signal,
    yieldControl: options.yieldControl,
    workChunkSize: options.workChunkSize,
    onProgress: (completed, total) => options.onProgress?.({
      entryId: entry.id,
      entryIndex,
      entryCount,
      phase: 'matching',
      completed,
      total,
    }),
    preserveTargetOrder: entry.retainCraftOrder === true,
    itemIdSearch: options.itemIdSearch,
  })
  throwIfAborted(options.signal)
  const single = optimizeSinglePrepared(prepared, scoringSettings)
  const itemSearches = Object.fromEntries(entry.targetIds.map((itemId) => [itemId,
    prepared.candidates.filter((candidate) => candidate.coveredTargetIds.includes(itemId)
      && (candidate.query.length <= 5 || (options.itemIdSearch === true && candidate.query.startsWith(':')))
      && candidate.junkItemIds.length <= maximumJunkItems(candidate.coveredTargetIds.length))
      .map((candidate) => rankedFromSingle({
        ...candidate,
        coveredTargetIds: [itemId],
        score: scoreStep(candidate.query.length, candidate.junkItemIds.length, scoringSettings),
      }, scoringSettings)).sort(compareRankedSearches),
  ]))
  // One-step paths are single-query crafts. Keeping them out of this category
  // makes the independently displayed overlap alternative meaningful.
  const overlap = targetIds.length > 1
    ? (await optimizeOverlapPreparedCooperatively(prepared, {
        signal: options.signal,
        yieldControl: options.yieldControl,
        workChunkSize: options.workChunkSize,
        onProgress: (completed) => options.onProgress?.({
          entryId: entry.id,
          entryIndex,
          entryCount,
          phase: 'overlap',
          completed,
        }),
        retainTargetOrder: entry.retainCraftOrder === true,
        scoringSettings,
      })).filter(({ steps }) => steps.length > 1)
    : []
  throwIfAborted(options.signal)
  const bestSingleScore = single[0]?.score.total
  const bestOverlapScore = overlap[0]?.score.total
  const hasCompleteResult = bestSingleScore !== undefined || bestOverlapScore !== undefined
  const matchedTargetIds = targetIds.filter((targetId) => visibleIds.has(targetId) && data.items.has(targetId))
  const incomplete = hasCompleteResult ? null : {
    matchedTargetIds,
    unmatchedTargetIds: targetIds.filter((targetId) => !matchedTargetIds.includes(targetId)),
    score: incompleteScore(targetIds.length, visibleIds.size, scoringSettings),
  }

  let availableCompleteMethod: WorkspaceEntryResult['availableCompleteMethod'] = null
  if (bestSingleScore !== undefined && (bestOverlapScore === undefined || bestSingleScore <= bestOverlapScore)) {
    availableCompleteMethod = 'single'
  } else if (bestOverlapScore !== undefined) {
    availableCompleteMethod = 'overlap'
  }

  return {
    entryId: entry.id,
    displayIndex,
    targetIds,
    gridSize: entry.gridSize,
    visibleItemIds: [...visibleIds].sort(),
    single,
    itemSearches,
    overlap,
    incomplete,
    availableCompleteMethod,
    bestScore: Math.min(
      bestSingleScore ?? Number.POSITIVE_INFINITY,
      bestOverlapScore ?? Number.POSITIVE_INFINITY,
      incomplete?.score ?? Number.POSITIVE_INFINITY,
    ),
  }
}

export async function optimizeWorkspaceEntry(
  data: GeneratedData,
  entry: TargetWorkspaceEntry,
  options: OptimizeWorkspaceOptions = {},
): Promise<EntryOptimizationOutcome> {
  const inventory = new Set(entry.inventoryItemIds)
  const legacy = await optimizeEntry(
    data,
    inventory,
    entry,
    0,
    0,
    1,
    { ...options, yieldControl: options.yieldControl ?? yieldToBrowser },
  )
  const scoringSettings = options.scoringSettings ?? DEFAULT_SCORING_SETTINGS
  const rankedSearches = rankSearches(legacy.single, legacy.overlap, scoringSettings)
  if (rankedSearches.length > 0) {
    return {
      kind: 'ranked',
      entryId: entry.id,
      rankedSearches,
      itemSearches: legacy.itemSearches,
      bestScore: rankedSearches[0].totalScore,
      visibleItemIds: legacy.visibleItemIds,
    }
  }
  return {
    kind: 'no-viable',
    entryId: entry.id,
    rankedSearches: [],
    bestScore: legacy.incomplete?.score ?? incompleteScore(legacy.targetIds.length, legacy.visibleItemIds.length, scoringSettings),
    visibleItemIds: legacy.visibleItemIds,
    matchedTargetIds: legacy.incomplete?.matchedTargetIds ?? [],
    unmatchedTargetIds: legacy.incomplete?.unmatchedTargetIds ?? legacy.targetIds,
  }
}

export type EnglishAggregate =
  | { status: 'blank' }
  | { status: 'pending' }
  | { status: 'unavailable' }
  | { status: 'ready'; score: number }

export function aggregateEnglishScore(
  entries: readonly TargetWorkspaceEntry[],
  states: ReadonlyMap<string, RowOptimizationState>,
): EnglishAggregate {
  const scoreable = entries.filter((entry) => entry.enabled && entry.targetIds.length > 0)
  if (scoreable.length === 0) return { status: 'blank' }
  const relevantStates = scoreable.map((entry) => states.get(entry.id))
  if (relevantStates.some((state) => state?.status === 'pending')) return { status: 'pending' }
  if (relevantStates.some((state) => state?.status !== 'ready')) return { status: 'unavailable' }
  return {
    status: 'ready',
    score: relevantStates.reduce(
      (sum, state) => sum + (state?.status === 'ready' ? state.outcome.bestScore : 0),
      0,
    ),
  }
}

export async function aggregateLocaleScore(
  data: GeneratedData,
  entries: readonly TargetWorkspaceEntry[],
  options: OptimizeWorkspaceOptions = {},
): Promise<number | undefined> {
  return (await aggregateLocaleMetrics(data, entries, options))?.score
}

export interface AggregateLocaleMetrics {
  score: number
  optimalCharacterCount?: number
  leastJunk?: number
}

function metricsForOutcome(outcome: EntryOptimizationOutcome): Omit<AggregateLocaleMetrics, 'score'> {
  if (outcome.kind !== 'ranked' || outcome.rankedSearches.length === 0) return {}
  const optimalSearches = outcome.rankedSearches.filter((search) => search.totalScore === outcome.bestScore)
  return {
    optimalCharacterCount: Math.min(...optimalSearches.map((search) => search.totalTypedCharacters)),
    leastJunk: Math.min(...optimalSearches.map((search) => search.totalJunkAppearances)),
  }
}

export async function aggregateLocaleMetrics(
  data: GeneratedData,
  entries: readonly TargetWorkspaceEntry[],
  options: OptimizeWorkspaceOptions = {},
): Promise<AggregateLocaleMetrics | undefined> {
  const scoreable = entries.filter((entry) => entry.enabled && entry.targetIds.length > 0)
  if (scoreable.length === 0) return undefined
  let score = 0
  let optimalCharacterCount = 0
  let leastJunk = 0
  let hasOptimalMetrics = true
  for (const entry of scoreable) {
    const outcome = await optimizeWorkspaceEntry(data, entry, options)
    score += outcome.bestScore
    const metrics = metricsForOutcome(outcome)
    if (metrics.optimalCharacterCount === undefined || metrics.leastJunk === undefined) hasOptimalMetrics = false
    else {
      optimalCharacterCount += metrics.optimalCharacterCount
      leastJunk += metrics.leastJunk
    }
    await (options.yieldControl ?? yieldToBrowser)()
    throwIfAborted(options.signal)
  }
  return {
    score,
    ...(hasOptimalMetrics ? { optimalCharacterCount, leastJunk } : {}),
  }
}

export async function optimizeWorkspace(
  data: GeneratedData,
  inventory: ReadonlySet<string>,
  entries: readonly TargetWorkspaceEntry[],
  options: OptimizeWorkspaceOptions = {},
): Promise<WorkspaceResult> {
  const orderedEntries = [...entries]
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .map((entry, displayIndex) => ({ entry, displayIndex }))
    .filter(({ entry }) => entry.enabled)
  const skippedEmptyEntryCount = orderedEntries.filter(({ entry }) => entry.targetIds.length === 0).length
  const enabledEntries = orderedEntries.filter(({ entry }) => entry.targetIds.length > 0)
  const optimizedEntries: WorkspaceEntryResult[] = []
  const yieldControl = options.yieldControl ?? yieldToBrowser

  throwIfAborted(options.signal)
  for (const [index, { entry, displayIndex }] of enabledEntries.entries()) {
    optimizedEntries.push(await optimizeEntry(
      data,
      inventory,
      entry,
      displayIndex,
      index,
      enabledEntries.length,
      { ...options, yieldControl },
    ))
    throwIfAborted(options.signal)
    if (index < enabledEntries.length - 1) {
      await yieldControl()
      throwIfAborted(options.signal)
    }
  }

  return {
    entries: optimizedEntries,
    aggregateScore: optimizedEntries.reduce((sum, entry) => sum + entry.bestScore, 0),
    skippedEmptyEntryCount,
  }
}
