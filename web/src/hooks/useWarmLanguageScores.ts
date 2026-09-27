import { useEffect, useMemo } from 'react'

import { isBannedLocale } from '../components/LanguageSelector'
import { loadLocalizedSearchPayload, parseLocalizedGeneratedData } from '../data/schema'
import type { EntryOptimizationOutcome, GeneratedData, LanguageMetadata, TargetWorkspaceEntry } from '../domain/types'
import { optimizeWorkspaceEntry } from '../engine/optimizeWorkspace'
import type { ScoringSettings } from '../engine/scoring'
import { languageCraftEntryKey, loadLanguageCraftOutcomes, saveLanguageCraftOutcome } from '../persistence/languageCraftCache'
import { cacheLanguageOutcomeScores } from '../persistence/languageScoreCache'
import { languageScoreCacheGeneration } from '../persistence/storage'
import { entryOptimizationFingerprint } from './useRowOptimizations'

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}

/**
 * Fills the per-language craft and score caches after the initial workspace is
 * available. Languages are handled one at a time so rendering remains usable
 * while their optimal crafts are prepared.
 */
export function useWarmLanguageScores(
  baseData: GeneratedData | undefined,
  languages: readonly LanguageMetadata[],
  entries: readonly TargetWorkspaceEntry[],
  enabledBannedLocales: ReadonlySet<string>,
  minecraftVersion: string,
  scoringSettings: ScoringSettings,
  itemIdSearch = false,
  dataBaseUrl = import.meta.env.BASE_URL,
): void {
  const activeEntries = useMemo(() => entries.filter((entry) => entry.enabled && entry.targetIds.length > 0), [entries])
  const fingerprint = useMemo(() => JSON.stringify({
    entries: activeEntries.map((entry) => entryOptimizationFingerprint(entry, scoringSettings, itemIdSearch)),
    locales: languages
      .filter((language) => !isBannedLocale(language.locale) || enabledBannedLocales.has(language.locale))
      .map((language) => language.locale),
    minecraftVersion,
  }), [activeEntries, enabledBannedLocales, itemIdSearch, languages, minecraftVersion, scoringSettings])

  useEffect(() => {
    if (!baseData || activeEntries.length === 0 || languages.length === 0) return

    const controller = new AbortController()
    const eligibleLocales = languages.filter((language) => !isBannedLocale(language.locale) || enabledBannedLocales.has(language.locale))
    const scoreCacheGeneration = languageScoreCacheGeneration(minecraftVersion)

    void (async () => {
      const cachedOutcomes = new Map(await Promise.all(activeEntries.map(async (entry) => {
        try {
          return [
            entry.id,
            await loadLanguageCraftOutcomes(minecraftVersion, languageCraftEntryKey(entry, scoringSettings, itemIdSearch)),
          ] as const
        } catch {
          return [entry.id, new Map<string, EntryOptimizationOutcome>()] as const
        }
      })))
      let payload: unknown | undefined

      for (const language of eligibleLocales) {
        if (controller.signal.aborted) return

        try {
          const persisted = new Map<string, EntryOptimizationOutcome>()
          for (const entry of activeEntries) {
            const outcome = cachedOutcomes.get(entry.id)?.get(language.locale)
            if (outcome !== undefined) persisted.set(entry.id, outcome)
          }

          if (persisted.size === activeEntries.length) {
            cacheLanguageOutcomeScores(minecraftVersion, activeEntries, language.locale, persisted, scoreCacheGeneration)
            await yieldToBrowser()
            continue
          }

          if (language.locale !== 'en_us' && payload === undefined) payload = await loadLocalizedSearchPayload(dataBaseUrl)
          if (controller.signal.aborted) return
          const languageData = language.locale === 'en_us'
            ? baseData
            : parseLocalizedGeneratedData(payload, language.locale, baseData)
          const outcomes = new Map(persisted)
          const savedOutcomes: Promise<void>[] = []

          for (const entry of activeEntries) {
            if (controller.signal.aborted) return
            const existing = outcomes.get(entry.id)
            if (existing !== undefined) continue
            const outcome = await optimizeWorkspaceEntry(languageData, entry, {
              signal: controller.signal,
              scoringSettings,
              itemIdSearch,
            })
            outcomes.set(entry.id, outcome)
            savedOutcomes.push(saveLanguageCraftOutcome(
              minecraftVersion,
              languageCraftEntryKey(entry, scoringSettings, itemIdSearch),
              language.locale,
              outcome,
            ))
          }

          if (controller.signal.aborted) return
          await Promise.all(savedOutcomes)
          cacheLanguageOutcomeScores(minecraftVersion, activeEntries, language.locale, outcomes, scoreCacheGeneration)
          await yieldToBrowser()
        } catch (error) {
          if (isAbortError(error) || controller.signal.aborted) return
          // A malformed or unavailable locale should not prevent the remaining
          // languages from receiving their cached scores.
        }
      }
    })()

    return () => controller.abort()
  // The fingerprint covers every input that changes calculated outcomes. Do
  // not restart this long-running background pass for unrelated app renders
  // such as a page change or a cosmetic settings update.
  }, [baseData, dataBaseUrl, fingerprint])
}
