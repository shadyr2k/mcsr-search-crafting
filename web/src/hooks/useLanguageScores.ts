import { useEffect, useMemo, useState } from 'react'

import { loadLocalizedSearchPayload, parseLocalizedGeneratedData } from '../data/schema'
import type { GeneratedData, LanguageMetadata, LanguageScoreState, TargetWorkspaceEntry } from '../domain/types'
import { aggregateLocaleScore } from '../engine/optimizeWorkspace'
import { isBannedLocale } from '../components/LanguageSelector'

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function scoreableEntries(entries: readonly TargetWorkspaceEntry[]): boolean {
  return entries.some((entry) => entry.enabled && entry.targetIds.length > 0)
}

export function useLanguageScores(
  baseData: GeneratedData | undefined,
  languages: readonly LanguageMetadata[],
  entries: readonly TargetWorkspaceEntry[],
  enabledBannedLocales: ReadonlySet<string>,
): ReadonlyMap<string, LanguageScoreState> {
  const [scores, setScores] = useState<ReadonlyMap<string, LanguageScoreState>>(new Map())
  const inputFingerprint = useMemo(() => JSON.stringify({
    locales: languages.map((language) => language.locale),
    entries: entries.map((entry) => ({
      id: entry.id,
      enabled: entry.enabled,
      targets: entry.retainCraftOrder ? [...entry.targetIds] : [...entry.targetIds].sort(),
      inventory: [...entry.inventoryItemIds].sort(),
      gridSize: entry.gridSize,
      retainCraftOrder: entry.retainCraftOrder === true,
    })),
    enabledBannedLocales: [...enabledBannedLocales].sort(),
  }), [languages, entries, enabledBannedLocales])

  useEffect(() => {
    if (!baseData || languages.length === 0 || !scoreableEntries(entries)) {
      setScores(new Map())
      return
    }
    const controller = new AbortController()
    const eligibleLanguages = languages.filter((language) => !isBannedLocale(language.locale) || enabledBannedLocales.has(language.locale))
    setScores(new Map(languages.map((language) => [
      language.locale,
      eligibleLanguages.includes(language) ? { status: 'pending' } : { status: 'disabled' },
    ] satisfies [string, LanguageScoreState])))

    function publish(locale: string, state: LanguageScoreState) {
      setScores((current) => {
        const next = new Map(current)
        next.set(locale, state)
        return next
      })
    }

    async function calculate(locale: string, localeData: GeneratedData) {
      try {
        const score = await aggregateLocaleScore(localeData, entries, { signal: controller.signal })
        if (!controller.signal.aborted) publish(locale, score === undefined ? { status: 'unavailable' } : { status: 'ready', score })
      } catch (error) {
        if (!controller.signal.aborted && !isAbortError(error)) publish(locale, { status: 'unavailable' })
      }
    }

    void (async () => {
      await calculate('en_us', baseData)
      if (controller.signal.aborted) return
      let payload: unknown
      try {
        payload = await loadLocalizedSearchPayload()
      } catch (error) {
        if (!controller.signal.aborted && !isAbortError(error)) {
          eligibleLanguages.filter((language) => language.locale !== 'en_us').forEach((language) => publish(language.locale, { status: 'unavailable' }))
        }
        return
      }
      for (const language of eligibleLanguages) {
        if (language.locale === 'en_us' || controller.signal.aborted) continue
        try {
          await calculate(language.locale, parseLocalizedGeneratedData(payload, language.locale, baseData))
        } catch (error) {
          if (!controller.signal.aborted && !isAbortError(error)) publish(language.locale, { status: 'unavailable' })
        }
      }
    })()

    return () => controller.abort()
  }, [baseData, enabledBannedLocales, entries, inputFingerprint, languages])

  return scores
}
