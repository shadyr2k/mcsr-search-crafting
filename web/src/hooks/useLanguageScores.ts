import { useEffect, useMemo, useState } from 'react'

import { isBannedLocale } from '../components/LanguageSelector'
import type { GeneratedData, LanguageMetadata, LanguageScoreState, TargetWorkspaceEntry } from '../domain/types'
import { DEFAULT_SCORING_SETTINGS, scoringSettingsFingerprint, type ScoringSettings } from '../engine/scoring'
import { languageCraftEntryKey, pruneLanguageCraftCache } from '../persistence/languageCraftCache'
import { LANGUAGE_SCORE_CACHE_UPDATED_EVENT, languageScoreEntryKey } from '../persistence/languageScoreCache'
import { LEGACY_GAME_VERSION_ID, loadLanguageScoreCache, type CachedLanguageScore, type LanguageScoreCache } from '../persistence/storage'

interface ScoringEntry {
  entry: TargetWorkspaceEntry
  cacheKey: string
  craftCacheKey: string
}

function cachedAggregateScore(
  cache: LanguageScoreCache | undefined,
  locale: string,
  entries: readonly ScoringEntry[],
): CachedLanguageScore | undefined {
  if (!cache) return undefined
  let score = 0
  let optimalCharacterCount = 0
  let leastJunk = 0
  let hasOptimalMetrics = true
  for (const { cacheKey } of entries) {
    const entryScore = cache.entryScores[cacheKey]?.[locale]
    if (entryScore === undefined) return undefined
    score += entryScore.score
    if (entryScore.optimalCharacterCount === undefined || entryScore.leastJunk === undefined) hasOptimalMetrics = false
    else {
      optimalCharacterCount += entryScore.optimalCharacterCount
      leastJunk += entryScore.leastJunk
    }
  }
  return {
    score,
    ...(hasOptimalMetrics ? { optimalCharacterCount, leastJunk } : {}),
  }
}

export function useLanguageScores(
  baseData: GeneratedData | undefined,
  languages: readonly LanguageMetadata[],
  entries: readonly TargetWorkspaceEntry[],
  enabledBannedLocales: ReadonlySet<string>,
  minecraftVersion = LEGACY_GAME_VERSION_ID,
  scoringSettings: ScoringSettings = DEFAULT_SCORING_SETTINGS,
  itemIdSearch = false,
  cacheInvalidationKey = 0,
  pendingLocale?: string,
): ReadonlyMap<string, LanguageScoreState> {
  const [cache, setCache] = useState<LanguageScoreCache>()
  const scoringEntries = useMemo(() => entries
    .filter((entry) => entry.enabled && entry.targetIds.length > 0)
    .map((entry) => ({
      entry,
      cacheKey: languageScoreEntryKey(entry),
      craftCacheKey: languageCraftEntryKey(entry, scoringSettings, itemIdSearch),
    })), [entries, itemIdSearch, scoringSettings])
  const cacheIdentity = `${minecraftVersion}:${scoringSettingsFingerprint(scoringSettings)}:${itemIdSearch}:${cacheInvalidationKey}`

  useEffect(() => {
    const refresh = () => setCache(loadLanguageScoreCache(undefined, minecraftVersion).value)
    refresh()
    window.addEventListener(LANGUAGE_SCORE_CACHE_UPDATED_EVENT, refresh)
    return () => window.removeEventListener(LANGUAGE_SCORE_CACHE_UPDATED_EVENT, refresh)
  }, [cacheIdentity, minecraftVersion])

  useEffect(() => {
    if (scoringEntries.length === 0) return
    void pruneLanguageCraftCache(minecraftVersion, new Set(scoringEntries.map(({ craftCacheKey }) => craftCacheKey)))
  }, [minecraftVersion, scoringEntries])

  return useMemo(() => {
    if (!baseData || languages.length === 0 || scoringEntries.length === 0) return new Map()
    const scores = new Map<string, LanguageScoreState>()
    for (const language of languages) {
      if (isBannedLocale(language.locale) && !enabledBannedLocales.has(language.locale)) scores.set(language.locale, { status: 'disabled' })
      else {
        const score = cachedAggregateScore(cache, language.locale, scoringEntries)
        scores.set(language.locale, score === undefined
          ? language.locale === pendingLocale ? { status: 'pending' } : { status: 'not-calculated' }
          : { status: 'ready', ...score })
      }
    }
    return scores
  }, [baseData, cache, enabledBannedLocales, languages, pendingLocale, scoringEntries])
}
