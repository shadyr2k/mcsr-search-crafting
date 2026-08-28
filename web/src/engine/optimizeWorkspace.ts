import type { GeneratedData, TargetWorkspaceEntry } from '../domain/types'

import { visibleOutputIds } from './craftability'
import { optimizeOverlapPreparedCooperatively, type OverlapResult } from './overlapOptimizer'
import { incompleteScore } from './scoring'
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
  const visibleIds = visibleOutputIds(data.recipes, new Set(inventory), entry.gridSize)
  const targetIds = [...new Set(entry.targetIds)].sort()
  const input = {
    targetIds: new Set(targetIds),
    visibleItemIds: visibleIds,
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
  })
  throwIfAborted(options.signal)
  const single = optimizeSinglePrepared(prepared)
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
    score: incompleteScore(targetIds.length, visibleIds.size),
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
