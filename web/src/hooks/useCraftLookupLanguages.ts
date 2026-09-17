import { useEffect, useMemo, useState } from 'react'

import { isBannedLocale } from '../components/LanguageSelector'
import { loadLocalizedSearchPayload, parseLocalizedGeneratedData } from '../data/schema'
import type { EntryOptimizationOutcome, GeneratedData, LanguageMetadata, TargetWorkspaceEntry } from '../domain/types'
import { optimizeWorkspaceEntry } from '../engine/optimizeWorkspace'
import { entryOptimizationFingerprint } from './useRowOptimizations'

export type CraftLookupLanguageCategory = 'junkless-single' | 'junkless-overlap' | 'requires-junk' | 'no-viable'

export type CraftLookupLanguageState =
  | { status: 'pending' }
  | { status: 'unavailable' }
  | {
      status: 'ready'
      category: CraftLookupLanguageCategory
      data: GeneratedData
      outcome: EntryOptimizationOutcome
    }

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function classify(outcome: EntryOptimizationOutcome): CraftLookupLanguageCategory {
  if (outcome.kind === 'no-viable') return 'no-viable'
  if (outcome.rankedSearches.some((search) => search.kind === 'single' && search.totalJunkAppearances === 0)) return 'junkless-single'
  if (outcome.rankedSearches.some((search) => search.kind === 'overlap' && search.totalJunkAppearances === 0)) return 'junkless-overlap'
  return 'requires-junk'
}

export function useCraftLookupLanguages(
  baseData: GeneratedData | undefined,
  languages: readonly LanguageMetadata[],
  entry: TargetWorkspaceEntry | undefined,
  enabledBannedLocales: ReadonlySet<string>,
  dataBaseUrl = import.meta.env.BASE_URL,
): ReadonlyMap<string, CraftLookupLanguageState> {
  const [states, setStates] = useState<ReadonlyMap<string, CraftLookupLanguageState>>(new Map())
  const fingerprint = useMemo(() => entry ? entryOptimizationFingerprint(entry) : '', [entry])

  useEffect(() => {
    if (!baseData || !entry || entry.targetIds.length === 0) {
      setStates(new Map())
      return
    }

    const controller = new AbortController()
    const eligibleLanguages = languages.filter((language) => !isBannedLocale(language.locale) || enabledBannedLocales.has(language.locale))
    const pendingStates = new Map<string, CraftLookupLanguageState>()
    eligibleLanguages.forEach((language) => pendingStates.set(language.locale, { status: 'pending' }))
    setStates(pendingStates)

    const publish = (locale: string, state: CraftLookupLanguageState) => {
      if (controller.signal.aborted) return
      setStates((current) => {
        const next = new Map(current)
        next.set(locale, state)
        return next
      })
    }

    const calculate = async (locale: string, localeData: GeneratedData) => {
      try {
        const outcome = await optimizeWorkspaceEntry(localeData, entry, { signal: controller.signal })
        publish(locale, { status: 'ready', category: classify(outcome), data: localeData, outcome })
      } catch (error) {
        if (!isAbortError(error)) publish(locale, { status: 'unavailable' })
      }
    }

    void (async () => {
      await calculate('en_us', baseData)
      if (controller.signal.aborted) return
      let payload: unknown
      try {
        payload = await loadLocalizedSearchPayload(dataBaseUrl)
      } catch (error) {
        if (!isAbortError(error)) {
          eligibleLanguages.filter((language) => language.locale !== 'en_us').forEach((language) => publish(language.locale, { status: 'unavailable' }))
        }
        return
      }

      for (const language of eligibleLanguages) {
        if (language.locale === 'en_us' || controller.signal.aborted) continue
        try {
          await calculate(language.locale, parseLocalizedGeneratedData(payload, language.locale, baseData))
        } catch (error) {
          if (!isAbortError(error)) publish(language.locale, { status: 'unavailable' })
        }
      }
    })()

    return () => controller.abort()
  }, [baseData, dataBaseUrl, enabledBannedLocales, entry, fingerprint, languages])

  return states
}
