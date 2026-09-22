import { useEffect, useMemo, useRef, useState } from 'react'

import { loadLocalizedSearchPayload, parseLocalizedGeneratedData } from '../data/schema'
import type { EntryOptimizationOutcome, GeneratedData, RowOptimizationState, TargetWorkspaceEntry } from '../domain/types'
import { optimizeWorkspaceEntry } from '../engine/optimizeWorkspace'
import type { ScoringSettings } from '../engine/scoring'
import { scoringSettingsFingerprint } from '../engine/scoring'
import { entryOptimizationFingerprint } from './useRowOptimizations'

export type LanguageComparisonState =
  | { status: 'pending' }
  | { status: 'unavailable'; message?: string }
  | { status: 'ready'; outcomes: ReadonlyMap<string, EntryOptimizationOutcome> }

interface CachedOutcomes {
  fingerprint: string
  outcomes: ReadonlyMap<string, EntryOptimizationOutcome>
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** Calculates the active item sets for the two languages currently compared. */
export function useLanguageComparison(
  baseData: GeneratedData | undefined,
  entries: readonly TargetWorkspaceEntry[],
  leftLocale: string,
  rightLocale: string,
  dataBaseUrl = import.meta.env.BASE_URL,
  scoringSettings: ScoringSettings,
  itemIdSearch = false,
  enabled = true,
  loadedLocale?: string,
  loadedStates?: ReadonlyMap<string, RowOptimizationState>,
): ReadonlyMap<string, LanguageComparisonState> {
  const [states, setStates] = useState<ReadonlyMap<string, LanguageComparisonState>>(new Map())
  const cacheRef = useRef(new Map<string, CachedOutcomes>())
  const loadedStatesRef = useRef(loadedStates)
  loadedStatesRef.current = loadedStates
  const activeEntries = useMemo(
    () => entries.filter((entry) => entry.enabled && entry.targetIds.length > 0),
    [entries],
  )
  const fingerprint = useMemo(() => JSON.stringify({
    entries: activeEntries.map((entry) => entryOptimizationFingerprint(entry, scoringSettings, itemIdSearch)),
    locales: [leftLocale, rightLocale],
    scoring: scoringSettingsFingerprint(scoringSettings),
  }), [activeEntries, itemIdSearch, leftLocale, rightLocale, scoringSettings])
  const entryFingerprint = useMemo(() => JSON.stringify(activeEntries.map((entry) => entryOptimizationFingerprint(entry, scoringSettings, itemIdSearch))), [activeEntries, itemIdSearch, scoringSettings])
  const loadedReadyFingerprint = useMemo(() => {
    if (loadedLocale === undefined || loadedStates === undefined) return ''
    return activeEntries.every((entry) => {
      const state = loadedStates.get(entry.id)
      return state?.status === 'ready' && state.fingerprint === entryOptimizationFingerprint(entry, scoringSettings, itemIdSearch)
    }) ? `${loadedLocale}:${entryFingerprint}` : ''
  }, [activeEntries, entryFingerprint, itemIdSearch, loadedLocale, loadedStates, scoringSettings])

  useEffect(() => {
    const locales = [...new Set([leftLocale, rightLocale])]
    if (!enabled || !baseData || activeEntries.length === 0 || locales.some((locale) => locale.length === 0)) {
      setStates(new Map())
      return
    }

    const currentLoadedStates = loadedStatesRef.current
    const reusableOutcomes = loadedReadyFingerprint === '' || loadedLocale === undefined || currentLoadedStates === undefined
      ? undefined
      : (() => {
          const outcomes = new Map<string, EntryOptimizationOutcome>()
          for (const entry of activeEntries) {
            const state = currentLoadedStates.get(entry.id)
            if (state?.status !== 'ready' || state.fingerprint !== entryOptimizationFingerprint(entry, scoringSettings, itemIdSearch)) return undefined
            outcomes.set(entry.id, state.outcome)
          }
          return outcomes
        })()
    if (reusableOutcomes && loadedLocale) cacheRef.current.set(loadedLocale, { fingerprint: entryFingerprint, outcomes: reusableOutcomes })

    const controller = new AbortController()
    const initialStates = new Map<string, LanguageComparisonState>()
    for (const locale of locales) {
      const cached = cacheRef.current.get(locale)
      initialStates.set(locale, cached?.fingerprint === entryFingerprint
        ? { status: 'ready', outcomes: cached.outcomes }
        : { status: 'pending' })
    }
    setStates(initialStates)

    const publish = (locale: string, state: LanguageComparisonState) => {
      if (controller.signal.aborted) return
      setStates((current) => {
        const next = new Map(current)
        next.set(locale, state)
        return next
      })
    }

    const pendingLocales = locales.filter((locale) => initialStates.get(locale)?.status !== 'ready')
    void (async () => {
      let payload: unknown | undefined
      try {
        if (pendingLocales.some((locale) => locale !== 'en_us')) payload = await loadLocalizedSearchPayload(dataBaseUrl)
        for (const locale of pendingLocales) {
          if (controller.signal.aborted) return
          const localeData = locale === 'en_us'
            ? baseData
            : parseLocalizedGeneratedData(payload, locale, baseData)
          const calculated = await Promise.all(activeEntries.map(async (entry) => [entry.id, await optimizeWorkspaceEntry(localeData, entry, {
              signal: controller.signal,
              scoringSettings,
              itemIdSearch,
            })] as const))
          const outcomes = new Map<string, EntryOptimizationOutcome>(calculated)
          cacheRef.current.set(locale, { fingerprint: entryFingerprint, outcomes })
          publish(locale, { status: 'ready', outcomes })
        }
      } catch (error) {
        if (isAbortError(error)) return
        const message = error instanceof Error ? error.message : 'Calculation failed.'
        for (const locale of pendingLocales) {
          if (controller.signal.aborted) return
          publish(locale, { status: 'unavailable', message })
        }
      }
    })()

    return () => controller.abort()
  }, [activeEntries, baseData, dataBaseUrl, enabled, entryFingerprint, fingerprint, itemIdSearch, leftLocale, loadedLocale, loadedReadyFingerprint, rightLocale, scoringSettings])

  return states
}
