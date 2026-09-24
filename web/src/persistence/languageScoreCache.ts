import type { EntryOptimizationOutcome, TargetWorkspaceEntry } from '../domain/types'
import { metricsForOutcome } from '../engine/optimizeWorkspace'
import { SEARCH_ALGORITHM_REVISION } from '../engine/rankedSearch'
import {
  languageScoreCacheGeneration,
  loadLanguageScoreCache,
  saveLanguageScoreCache,
  type CachedLanguageScore,
} from './storage'

export const LANGUAGE_SCORE_CACHE_UPDATED_EVENT = 'mcsr-language-score-cache-updated'

/**
 * Score entries intentionally omit calculation settings. Settings changes clear
 * the whole versioned score cache, which keeps the score list coherent.
 */
export function languageScoreEntryKey(entry: TargetWorkspaceEntry): string {
  const targetIds = [...new Set(entry.targetIds)]
  if (!entry.retainCraftOrder) targetIds.sort()
  return JSON.stringify({
    targetIds,
    inventoryItemIds: [...new Set(entry.inventoryItemIds)].sort(),
    gridSize: entry.gridSize,
    retainCraftOrder: entry.retainCraftOrder === true,
    algorithm: SEARCH_ALGORITHM_REVISION,
  })
}

function sameScore(left: CachedLanguageScore | undefined, right: CachedLanguageScore): boolean {
  return left?.score === right.score
    && left.optimalCharacterCount === right.optimalCharacterCount
    && left.leastJunk === right.leastJunk
}

/** Saves the score-list data derived from an explicit language comparison. */
export function cacheLanguageOutcomeScores(
  minecraftVersion: string,
  entries: readonly TargetWorkspaceEntry[],
  locale: string,
  outcomes: ReadonlyMap<string, EntryOptimizationOutcome>,
  expectedGeneration = languageScoreCacheGeneration(minecraftVersion),
): void {
  const cache = loadLanguageScoreCache(undefined, minecraftVersion).value
  let entryScores = cache.entryScores
  let changed = false

  for (const entry of entries) {
    const outcome = outcomes.get(entry.id)
    if (!outcome || !Number.isFinite(outcome.bestScore)) continue
    const score: CachedLanguageScore = { score: outcome.bestScore, ...metricsForOutcome(outcome) }
    const key = languageScoreEntryKey(entry)
    const existingScores = entryScores[key] ?? {}
    if (sameScore(existingScores[locale], score)) continue
    entryScores = { ...entryScores, [key]: { ...existingScores, [locale]: score } }
    changed = true
  }

  if (!changed) return
  saveLanguageScoreCache({ entryScores }, undefined, minecraftVersion, expectedGeneration)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LANGUAGE_SCORE_CACHE_UPDATED_EVENT))
}
