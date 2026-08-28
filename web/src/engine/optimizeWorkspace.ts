import type { GeneratedData, TargetWorkspaceEntry } from '../domain/types'

import { visibleOutputIds } from './craftability'
import { optimizeOverlap, type OverlapResult } from './overlapOptimizer'
import { incompleteScore } from './scoring'
import { optimizeSingle, type SingleResult } from './singleOptimizer'

export interface IncompleteAttempt {
  matchedTargetIds: string[]
  unmatchedTargetIds: string[]
  score: number
}

export interface WorkspaceEntryResult {
  entryId: string
  entryOrder: number
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
}

export interface OptimizeWorkspaceOptions {
  signal?: AbortSignal
  yieldControl?: () => Promise<void>
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('Workspace optimization was cancelled.', 'AbortError')
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function optimizeEntry(
  data: GeneratedData,
  inventory: ReadonlySet<string>,
  entry: TargetWorkspaceEntry,
): WorkspaceEntryResult {
  const visibleIds = visibleOutputIds(data.recipes, new Set(inventory), entry.gridSize)
  const targetIds = [...new Set(entry.targetIds)]
  const input = {
    targetIds: new Set(targetIds),
    visibleItemIds: visibleIds,
    items: data.items,
  }
  const single = optimizeSingle(input)
  // One-step paths are single-query crafts. Keeping them out of this category
  // makes the independently displayed overlap alternative meaningful.
  const overlap = optimizeOverlap(input).filter(({ steps }) => steps.length > 1)
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
    entryOrder: entry.order,
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
  const enabledEntries = entries
    .filter(({ enabled }) => enabled)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
  const optimizedEntries: WorkspaceEntryResult[] = []
  const yieldControl = options.yieldControl ?? yieldToBrowser

  throwIfAborted(options.signal)
  for (const [index, entry] of enabledEntries.entries()) {
    optimizedEntries.push(optimizeEntry(data, inventory, entry))
    throwIfAborted(options.signal)
    if (index < enabledEntries.length - 1) {
      await yieldControl()
      throwIfAborted(options.signal)
    }
  }

  return {
    entries: optimizedEntries,
    aggregateScore: optimizedEntries.reduce((sum, entry) => sum + entry.bestScore, 0),
  }
}
