import { useEffect, useMemo, useState } from 'react'

import { loadLocalizedSearchPayload, parseLocalizedGeneratedData } from '../data/schema'
import type { EntryOptimizationOutcome, GeneratedData, TargetWorkspaceEntry } from '../domain/types'
import { optimizeWorkspaceEntry } from '../engine/optimizeWorkspace'
import type { ScoringSettings } from '../engine/scoring'
import { scoringSettingsFingerprint } from '../engine/scoring'
import { entryOptimizationFingerprint } from './useRowOptimizations'

export type LanguageComparisonState =
  | { status: 'pending' }
  | { status: 'unavailable'; message?: string }
  | { status: 'ready'; outcomes: ReadonlyMap<string, EntryOptimizationOutcome> }

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
): ReadonlyMap<string, LanguageComparisonState> {
  const [states, setStates] = useState<ReadonlyMap<string, LanguageComparisonState>>(new Map())
  const activeEntries = useMemo(
    () => entries.filter((entry) => entry.enabled && entry.targetIds.length > 0),
    [entries],
  )
  const fingerprint = useMemo(() => JSON.stringify({
    entries: activeEntries.map((entry) => entryOptimizationFingerprint(entry, scoringSettings, itemIdSearch)),
    locales: [leftLocale, rightLocale],
    scoring: scoringSettingsFingerprint(scoringSettings),
  }), [activeEntries, itemIdSearch, leftLocale, rightLocale, scoringSettings])

  useEffect(() => {
    const locales = [...new Set([leftLocale, rightLocale])]
    if (!enabled || !baseData || activeEntries.length === 0 || locales.some((locale) => locale.length === 0)) {
      setStates(new Map())
      return
    }

    const controller = new AbortController()
    setStates(new Map(locales.map((locale) => [locale, { status: 'pending' } as LanguageComparisonState])))

    const publish = (locale: string, state: LanguageComparisonState) => {
      if (controller.signal.aborted) return
      setStates((current) => {
        const next = new Map(current)
        next.set(locale, state)
        return next
      })
    }

    void (async () => {
      let payload: unknown | undefined
      try {
        if (locales.some((locale) => locale !== 'en_us')) payload = await loadLocalizedSearchPayload(dataBaseUrl)
        for (const locale of locales) {
          if (controller.signal.aborted) return
          const localeData = locale === 'en_us'
            ? baseData
            : parseLocalizedGeneratedData(payload, locale, baseData)
          const outcomes = new Map<string, EntryOptimizationOutcome>()
          for (const entry of activeEntries) {
            outcomes.set(entry.id, await optimizeWorkspaceEntry(localeData, entry, {
              signal: controller.signal,
              scoringSettings,
              itemIdSearch,
            }))
          }
          publish(locale, { status: 'ready', outcomes })
        }
      } catch (error) {
        if (isAbortError(error)) return
        const message = error instanceof Error ? error.message : 'Calculation failed.'
        for (const locale of locales) {
          if (controller.signal.aborted) return
          publish(locale, { status: 'unavailable', message })
        }
      }
    })()

    return () => controller.abort()
  }, [activeEntries, baseData, dataBaseUrl, enabled, fingerprint, itemIdSearch, leftLocale, rightLocale, scoringSettings])

  return states
}
