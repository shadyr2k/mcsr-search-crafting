import { useEffect, useMemo, useRef, useState } from 'react'

import { loadLocalizedSearchPayload, parseLocalizedGeneratedData } from '../data/schema'
import type { EntryOptimizationOutcome, GeneratedData, RowOptimizationState, TargetWorkspaceEntry } from '../domain/types'
import { optimizeWorkspaceEntry } from '../engine/optimizeWorkspace'
import type { ScoringSettings } from '../engine/scoring'
import { scoringSettingsFingerprint } from '../engine/scoring'
import { languageCraftEntryKey, loadLanguageCraftOutcomes, saveLanguageCraftOutcome } from '../persistence/languageCraftCache'
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
  minecraftVersion = '1.16.1',
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
    if (reusableOutcomes && loadedLocale) {
      cacheRef.current.set(loadedLocale, { fingerprint: entryFingerprint, outcomes: reusableOutcomes })
      activeEntries.forEach((entry) => {
        const outcome = reusableOutcomes.get(entry.id)
        if (outcome) void saveLanguageCraftOutcome(minecraftVersion, languageCraftEntryKey(entry, scoringSettings, itemIdSearch), loadedLocale, outcome)
      })
    }

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
        const persistedByLocale = new Map<string, ReadonlyMap<string, EntryOptimizationOutcome>>()
        await Promise.all(pendingLocales.map(async (locale) => {
          const storedEntries = await Promise.all(activeEntries.map(async (entry) => [
            entry.id,
            (await loadLanguageCraftOutcomes(minecraftVersion, languageCraftEntryKey(entry, scoringSettings, itemIdSearch))).get(locale),
          ] as const))
          const outcomes = new Map<string, EntryOptimizationOutcome>()
          storedEntries.forEach(([entryId, outcome]) => { if (outcome !== undefined) outcomes.set(entryId, outcome) })
          persistedByLocale.set(locale, outcomes)
        }))
        if (controller.signal.aborted) return
        const localesNeedingCalculation = pendingLocales.filter((locale) => (
          (persistedByLocale.get(locale)?.size ?? 0) !== activeEntries.length
        ))
        for (const locale of pendingLocales) {
          const outcomes = persistedByLocale.get(locale)
          if (outcomes?.size !== activeEntries.length) continue
          cacheRef.current.set(locale, { fingerprint: entryFingerprint, outcomes })
          publish(locale, { status: 'ready', outcomes })
        }
        if (localesNeedingCalculation.some((locale) => locale !== 'en_us')) payload = await loadLocalizedSearchPayload(dataBaseUrl)
        for (const locale of localesNeedingCalculation) {
          if (controller.signal.aborted) return
          const localeData = locale === 'en_us'
            ? baseData
            : parseLocalizedGeneratedData(payload, locale, baseData)
          const persisted = persistedByLocale.get(locale) ?? new Map()
          const calculated = await Promise.all(activeEntries.map(async (entry) => [entry.id, persisted.get(entry.id) ?? await optimizeWorkspaceEntry(localeData, entry, {
              signal: controller.signal,
              scoringSettings,
              itemIdSearch,
            })] as const))
          const outcomes = new Map<string, EntryOptimizationOutcome>(calculated)
          activeEntries.forEach((entry) => {
            if (persisted.has(entry.id)) return
            const outcome = outcomes.get(entry.id)
            if (outcome) void saveLanguageCraftOutcome(minecraftVersion, languageCraftEntryKey(entry, scoringSettings, itemIdSearch), locale, outcome)
          })
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
  }, [activeEntries, baseData, dataBaseUrl, enabled, entryFingerprint, fingerprint, itemIdSearch, leftLocale, loadedLocale, loadedReadyFingerprint, minecraftVersion, rightLocale, scoringSettings])

  return states
}
