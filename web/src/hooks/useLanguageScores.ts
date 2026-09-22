import { useEffect, useMemo, useRef, useState } from 'react'

import { isBannedLocale } from '../components/LanguageSelector'
import { loadLocalizedSearchPayload, parseLocalizedGeneratedData } from '../data/schema'
import type { GeneratedData, LanguageMetadata, LanguageScoreState, TargetWorkspaceEntry } from '../domain/types'
import { metricsForOutcome, optimizeWorkspaceEntry } from '../engine/optimizeWorkspace'
import { DEFAULT_SCORING_SETTINGS, scoringSettingsFingerprint, type ScoringSettings } from '../engine/scoring'
import { languageCraftEntryKey, loadLanguageCraftOutcomes, pruneLanguageCraftCache, saveLanguageCraftOutcome } from '../persistence/languageCraftCache'
import { languageScoreCacheGeneration, LEGACY_GAME_VERSION_ID, loadLanguageScoreCache, saveLanguageScoreCache, type CachedLanguageScore, type LanguageScoreCache } from '../persistence/storage'

interface ScoringEntry {
  entry: TargetWorkspaceEntry
  cacheKey: string
  craftCacheKey: string
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function cacheKeyForEntry(entry: TargetWorkspaceEntry): string {
  const targetIds = [...new Set(entry.targetIds)]
  if (!entry.retainCraftOrder) targetIds.sort()
  return JSON.stringify({
    targetIds,
    inventoryItemIds: [...new Set(entry.inventoryItemIds)].sort(),
    gridSize: entry.gridSize,
    retainCraftOrder: entry.retainCraftOrder === true,
  })
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
  dataBaseUrl = import.meta.env.BASE_URL,
  minecraftVersion = LEGACY_GAME_VERSION_ID,
  scoringSettings: ScoringSettings = DEFAULT_SCORING_SETTINGS,
  itemIdSearch = false,
  cacheInvalidationKey = 0,
): ReadonlyMap<string, LanguageScoreState> {
  const [scores, setScores] = useState<ReadonlyMap<string, LanguageScoreState>>(new Map())
  const [loadedCacheIdentity, setLoadedCacheIdentity] = useState<string>()
  const [loadedCacheGeneration, setLoadedCacheGeneration] = useState<number>()
  const cacheRef = useRef<LanguageScoreCache | undefined>(undefined)
  const scoringEntries = useMemo(() => entries
    .filter((entry) => entry.enabled && entry.targetIds.length > 0)
    .map((entry) => ({
      entry,
      cacheKey: cacheKeyForEntry(entry),
      craftCacheKey: languageCraftEntryKey(entry, scoringSettings, itemIdSearch),
    })), [entries, itemIdSearch, scoringSettings])
  const inputFingerprint = useMemo(() => JSON.stringify({
    locales: languages.map((language) => language.locale),
    itemSets: scoringEntries.map(({ cacheKey }) => cacheKey).sort(),
  }), [languages, scoringEntries])
  const enabledBannedLocalesFingerprint = useMemo(() => JSON.stringify([...enabledBannedLocales].sort()), [enabledBannedLocales])
  const cacheIdentity = `${minecraftVersion}:${scoringSettingsFingerprint(scoringSettings)}:${itemIdSearch}:${cacheInvalidationKey}`

  useEffect(() => {
    cacheRef.current = loadLanguageScoreCache(undefined, minecraftVersion).value
    setScores(new Map())
    setLoadedCacheGeneration(languageScoreCacheGeneration(minecraftVersion))
    setLoadedCacheIdentity(cacheIdentity)
  }, [cacheIdentity, minecraftVersion])

  useEffect(() => {
    if (scoringEntries.length === 0) return
    void pruneLanguageCraftCache(minecraftVersion, new Set(scoringEntries.map(({ craftCacheKey }) => craftCacheKey)))
  }, [minecraftVersion, scoringEntries])

  useEffect(() => {
    if (loadedCacheIdentity !== cacheIdentity || loadedCacheGeneration === undefined || !baseData || languages.length === 0 || scoringEntries.length === 0) {
      setScores(new Map())
      return
    }

    const eligibleLanguages = languages.filter((language) => (
      !isBannedLocale(language.locale) || enabledBannedLocales.has(language.locale)
    ))
    const pendingLocales = new Set<string>()
    const initialScores = new Map<string, LanguageScoreState>()
    for (const language of languages) {
      if (!eligibleLanguages.includes(language)) {
        initialScores.set(language.locale, { status: 'disabled' })
        continue
      }
      const cachedScore = cachedAggregateScore(cacheRef.current, language.locale, scoringEntries)
      if (cachedScore === undefined) {
        pendingLocales.add(language.locale)
        initialScores.set(language.locale, { status: 'pending' })
      } else initialScores.set(language.locale, { status: 'ready', ...cachedScore })
    }
    setScores(initialScores)
    const controller = new AbortController()

    function publish(locale: string, state: LanguageScoreState) {
      if (controller.signal.aborted) return
      setScores((current) => {
        const next = new Map(current)
        next.set(locale, state)
        return next
      })
    }

    function rememberScore(cacheKey: string, locale: string, score: CachedLanguageScore) {
      const currentCache = cacheRef.current
      const current = currentCache?.entryScores[cacheKey]?.[locale]
      if (!currentCache || (current?.score === score.score
        && current.optimalCharacterCount === score.optimalCharacterCount
        && current.leastJunk === score.leastJunk)) return
      const updatedCache: LanguageScoreCache = {
        entryScores: {
          ...currentCache.entryScores,
          [cacheKey]: { ...currentCache.entryScores[cacheKey], [locale]: score },
        },
      }
      cacheRef.current = updatedCache
      saveLanguageScoreCache(updatedCache, undefined, minecraftVersion, loadedCacheGeneration)
    }

    async function calculate(
      locale: string,
      localeData: GeneratedData,
      cachedOutcomes: ReadonlyMap<string, import('../domain/types').EntryOptimizationOutcome>,
    ) {
      try {
        for (const { entry, cacheKey, craftCacheKey } of scoringEntries) {
          const outcome = cachedOutcomes.get(entry.id) ?? await optimizeWorkspaceEntry(localeData, entry, {
            signal: controller.signal,
            scoringSettings,
            itemIdSearch,
          })
          if (controller.signal.aborted) return
          if (!Number.isFinite(outcome.bestScore)) throw new Error('No language score was available.')
          if (!cachedOutcomes.has(entry.id)) void saveLanguageCraftOutcome(minecraftVersion, craftCacheKey, locale, outcome)
          rememberScore(cacheKey, locale, { score: outcome.bestScore, ...metricsForOutcome(outcome) })
        }
        const score = cachedAggregateScore(cacheRef.current, locale, scoringEntries)
        publish(locale, score === undefined ? { status: 'unavailable' } : { status: 'ready', ...score })
      } catch (error) {
        if (!isAbortError(error)) publish(locale, { status: 'unavailable' })
      }
    }

    void (async () => {
      const cachedByLocale = new Map<string, ReadonlyMap<string, import('../domain/types').EntryOptimizationOutcome>>()
      await Promise.all(eligibleLanguages.map(async (language) => {
        const cachedEntries = await Promise.all(scoringEntries.map(async ({ entry, craftCacheKey }) => [
          entry.id,
          (await loadLanguageCraftOutcomes(minecraftVersion, craftCacheKey)).get(language.locale),
        ] as const))
        const outcomes = new Map<string, import('../domain/types').EntryOptimizationOutcome>()
        cachedEntries.forEach(([entryId, outcome]) => { if (outcome !== undefined) outcomes.set(entryId, outcome) })
        cachedByLocale.set(language.locale, outcomes)
      }))
      if (controller.signal.aborted) return

      const needsCalculation = (locale: string) => (cachedByLocale.get(locale)?.size ?? 0) !== scoringEntries.length
      await calculate('en_us', baseData, cachedByLocale.get('en_us') ?? new Map())
      if (controller.signal.aborted) return

      const pendingLocalizedLocales = eligibleLanguages.filter((language) => (
        language.locale !== 'en_us' && needsCalculation(language.locale)
      ))
      for (const language of eligibleLanguages) {
        if (language.locale === 'en_us' || needsCalculation(language.locale)) continue
        await calculate(language.locale, baseData, cachedByLocale.get(language.locale) ?? new Map())
      }
      if (pendingLocalizedLocales.length === 0) return

      let payload: unknown
      try {
        payload = await loadLocalizedSearchPayload(dataBaseUrl)
      } catch (error) {
        if (!isAbortError(error)) pendingLocalizedLocales.forEach((language) => publish(language.locale, { status: 'unavailable' }))
        return
      }

      for (const language of pendingLocalizedLocales) {
        if (controller.signal.aborted) return
        try {
          await calculate(language.locale, parseLocalizedGeneratedData(payload, language.locale, baseData), cachedByLocale.get(language.locale) ?? new Map())
        } catch (error) {
          if (!isAbortError(error)) publish(language.locale, { status: 'unavailable' })
        }
      }
    })()

    return () => controller.abort()
  }, [baseData, cacheIdentity, dataBaseUrl, enabledBannedLocalesFingerprint, inputFingerprint, itemIdSearch, languages, loadedCacheGeneration, loadedCacheIdentity, minecraftVersion, scoringEntries, scoringSettings])

  return scores
}
