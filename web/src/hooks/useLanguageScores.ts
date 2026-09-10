import { useEffect, useMemo, useRef, useState } from 'react'

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
  const enabledBannedLocalesRef = useRef(enabledBannedLocales)
  const previouslyEnabledBannedLocalesRef = useRef<ReadonlySet<string> | undefined>(undefined)
  useEffect(() => { enabledBannedLocalesRef.current = enabledBannedLocales }, [enabledBannedLocales])
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
  }), [languages, entries])

  useEffect(() => {
    previouslyEnabledBannedLocalesRef.current = new Set(enabledBannedLocales)
    if (!baseData || languages.length === 0 || !scoreableEntries(entries)) {
      setScores(new Map())
      return
    }
    const controller = new AbortController()
    const eligibleLanguages = languages.filter((language) => !isBannedLocale(language.locale) || enabledBannedLocalesRef.current.has(language.locale))
    setScores(new Map(languages.map((language) => [
      language.locale,
      eligibleLanguages.includes(language) ? { status: 'pending' } : { status: 'disabled' },
    ] satisfies [string, LanguageScoreState])))

    function publish(locale: string, state: LanguageScoreState) {
      if (isBannedLocale(locale) && !enabledBannedLocalesRef.current.has(locale)) return
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
  }, [baseData, entries, inputFingerprint, languages])

  useEffect(() => {
    const previous = previouslyEnabledBannedLocalesRef.current
    previouslyEnabledBannedLocalesRef.current = new Set(enabledBannedLocales)
    if (!baseData || languages.length === 0 || !scoreableEntries(entries) || previous === undefined) return

    const newlyEnabled = [...enabledBannedLocales].filter((locale) => !previous.has(locale))
    const newlyDisabled = [...previous].filter((locale) => !enabledBannedLocales.has(locale))
    if (newlyEnabled.length === 0 && newlyDisabled.length === 0) return

    setScores((current) => {
      const next = new Map(current)
      newlyDisabled.forEach((locale) => next.set(locale, { status: 'disabled' }))
      newlyEnabled.forEach((locale) => next.set(locale, { status: 'pending' }))
      return next
    })
    if (newlyEnabled.length === 0) return

    const controller = new AbortController()
    void (async () => {
      let payload: unknown
      try {
        payload = await loadLocalizedSearchPayload()
      } catch (error) {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setScores((current) => {
            const next = new Map(current)
            newlyEnabled.forEach((locale) => next.set(locale, { status: 'unavailable' }))
            return next
          })
        }
        return
      }

      for (const locale of newlyEnabled) {
        if (controller.signal.aborted || !enabledBannedLocalesRef.current.has(locale)) continue
        try {
          const score = await aggregateLocaleScore(parseLocalizedGeneratedData(payload, locale, baseData), entries, { signal: controller.signal })
          if (!controller.signal.aborted && enabledBannedLocalesRef.current.has(locale)) {
            setScores((current) => {
              const next = new Map(current)
              next.set(locale, score === undefined ? { status: 'unavailable' } : { status: 'ready', score })
              return next
            })
          }
        } catch (error) {
          if (!controller.signal.aborted && !isAbortError(error)) {
            setScores((current) => {
              const next = new Map(current)
              next.set(locale, { status: 'unavailable' })
              return next
            })
          }
        }
      }
    })()

    return () => controller.abort()
  }, [baseData, enabledBannedLocales, entries, inputFingerprint, languages])

  return scores
}
