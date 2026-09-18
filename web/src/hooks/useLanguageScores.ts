import { useEffect, useMemo, useRef, useState } from 'react'

import { isBannedLocale } from '../components/LanguageSelector'
import { loadLocalizedSearchPayload, parseLocalizedGeneratedData } from '../data/schema'
import type { GeneratedData, LanguageMetadata, LanguageScoreState, TargetWorkspaceEntry } from '../domain/types'
import { aggregateLocaleScore } from '../engine/optimizeWorkspace'
import { LEGACY_GAME_VERSION_ID, loadLanguageScoreCache, saveLanguageScoreCache, type LanguageScoreCache } from '../persistence/storage'

interface ScoringEntry {
  entry: TargetWorkspaceEntry
  cacheKey: string
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
): number | undefined {
  if (!cache) return undefined
  let total = 0
  for (const { cacheKey } of entries) {
    const score = cache.entryScores[cacheKey]?.[locale]
    if (score === undefined) return undefined
    total += score
  }
  return total
}

export function useLanguageScores(
  baseData: GeneratedData | undefined,
  languages: readonly LanguageMetadata[],
  entries: readonly TargetWorkspaceEntry[],
  enabledBannedLocales: ReadonlySet<string>,
  dataBaseUrl = import.meta.env.BASE_URL,
  minecraftVersion = LEGACY_GAME_VERSION_ID,
): ReadonlyMap<string, LanguageScoreState> {
  const [scores, setScores] = useState<ReadonlyMap<string, LanguageScoreState>>(new Map())
  const [loadedCacheVersion, setLoadedCacheVersion] = useState<string>()
  const cacheRef = useRef<LanguageScoreCache | undefined>(undefined)
  const scoringEntries = useMemo(() => entries
    .filter((entry) => entry.enabled && entry.targetIds.length > 0)
    .map((entry) => ({ entry, cacheKey: cacheKeyForEntry(entry) })), [entries])
  const inputFingerprint = useMemo(() => JSON.stringify({
    locales: languages.map((language) => language.locale),
    itemSets: scoringEntries.map(({ cacheKey }) => cacheKey).sort(),
  }), [languages, scoringEntries])
  const enabledBannedLocalesFingerprint = useMemo(() => JSON.stringify([...enabledBannedLocales].sort()), [enabledBannedLocales])

  useEffect(() => {
    cacheRef.current = loadLanguageScoreCache(undefined, minecraftVersion).value
    setScores(new Map())
    setLoadedCacheVersion(minecraftVersion)
  }, [minecraftVersion])

  useEffect(() => {
    if (loadedCacheVersion !== minecraftVersion || !baseData || languages.length === 0 || scoringEntries.length === 0) {
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
      const score = cachedAggregateScore(cacheRef.current, language.locale, scoringEntries)
      if (score === undefined) {
        pendingLocales.add(language.locale)
        initialScores.set(language.locale, { status: 'pending' })
      } else initialScores.set(language.locale, { status: 'ready', score })
    }
    setScores(initialScores)
    if (pendingLocales.size === 0) return

    const controller = new AbortController()

    function publish(locale: string, state: LanguageScoreState) {
      if (controller.signal.aborted) return
      setScores((current) => {
        const next = new Map(current)
        next.set(locale, state)
        return next
      })
    }

    function rememberScore(cacheKey: string, locale: string, score: number) {
      const currentCache = cacheRef.current
      if (!currentCache || currentCache.entryScores[cacheKey]?.[locale] === score) return
      const updatedCache: LanguageScoreCache = {
        entryScores: {
          ...currentCache.entryScores,
          [cacheKey]: { ...currentCache.entryScores[cacheKey], [locale]: score },
        },
      }
      cacheRef.current = updatedCache
      saveLanguageScoreCache(updatedCache, undefined, minecraftVersion)
    }

    async function calculate(locale: string, localeData: GeneratedData) {
      try {
        for (const { entry, cacheKey } of scoringEntries) {
          if (cachedAggregateScore(cacheRef.current, locale, [{ entry, cacheKey }]) !== undefined) continue
          const score = await aggregateLocaleScore(localeData, [entry], { signal: controller.signal })
          if (controller.signal.aborted) return
          if (score === undefined || !Number.isFinite(score)) throw new Error('No language score was available.')
          rememberScore(cacheKey, locale, score)
        }
        const score = cachedAggregateScore(cacheRef.current, locale, scoringEntries)
        publish(locale, score === undefined ? { status: 'unavailable' } : { status: 'ready', score })
      } catch (error) {
        if (!isAbortError(error)) publish(locale, { status: 'unavailable' })
      }
    }

    void (async () => {
      if (pendingLocales.has('en_us')) await calculate('en_us', baseData)
      if (controller.signal.aborted) return

      const pendingLocalizedLocales = eligibleLanguages.filter((language) => (
        language.locale !== 'en_us' && pendingLocales.has(language.locale)
      ))
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
          await calculate(language.locale, parseLocalizedGeneratedData(payload, language.locale, baseData))
        } catch (error) {
          if (!isAbortError(error)) publish(language.locale, { status: 'unavailable' })
        }
      }
    })()

    return () => controller.abort()
  }, [baseData, dataBaseUrl, enabledBannedLocalesFingerprint, inputFingerprint, languages, loadedCacheVersion, minecraftVersion, scoringEntries])

  return scores
}
