import { useEffect, useMemo, useRef, useState } from 'react'

import type {
  EntryOptimizationOutcome,
  GeneratedData,
  RowOptimizationState,
  TargetWorkspaceEntry,
} from '../domain/types'
import {
  aggregateEnglishScore,
  optimizeWorkspaceEntry,
  type OptimizeWorkspaceOptions,
} from '../engine/optimizeWorkspace'
import { DEFAULT_SCORING_SETTINGS, type ScoringSettings, scoringSettingsFingerprint } from '../engine/scoring'
import { languageCraftEntryKey, loadLanguageCraftOutcomeRecords, saveLanguageCraftOutcome, type CachedLanguageCraftOutcome } from '../persistence/languageCraftCache'

export interface LanguageCraftCacheContext {
  minecraftVersion: string
  locale: string
}

interface CachedOutcomesRecord {
  identity: string
  outcomes: ReadonlyMap<string, CachedLanguageCraftOutcome>
}

interface RequestRecord {
  requestId: number
  fingerprint: string
  retryToken: number
  data: GeneratedData
  controller: AbortController
}

interface SettledRecord {
  fingerprint: string
  retryToken: number
  data: GeneratedData
  status: 'ready' | 'error'
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function entryOptimizationFingerprint(
  entry: TargetWorkspaceEntry,
  scoringSettings: ScoringSettings = DEFAULT_SCORING_SETTINGS,
  itemIdSearch = false,
): string {
  return JSON.stringify({
    targetIds: entry.retainCraftOrder ? [...new Set(entry.targetIds)] : [...new Set(entry.targetIds)].sort(),
    inventoryItemIds: [...new Set(entry.inventoryItemIds)].sort(),
    gridSize: entry.gridSize,
    retainCraftOrder: entry.retainCraftOrder === true,
    scoring: scoringSettingsFingerprint(scoringSettings),
    itemIdSearch,
  })
}

export function useRowOptimizations(
  data: GeneratedData | undefined,
  entries: readonly TargetWorkspaceEntry[],
  scoringSettings: ScoringSettings = DEFAULT_SCORING_SETTINGS,
  itemIdSearch = false,
  optimize: typeof optimizeWorkspaceEntry = optimizeWorkspaceEntry,
  languageCraftCache?: LanguageCraftCacheContext,
  resultDetail: NonNullable<OptimizeWorkspaceOptions['resultDetail']> = 'all',
  cacheInvalidationKey = 0,
  paused = false,
): {
  states: ReadonlyMap<string, RowOptimizationState>
  aggregate: ReturnType<typeof aggregateEnglishScore>
  retry(entryId: string): void
} {
  const [states, setStates] = useState<ReadonlyMap<string, RowOptimizationState>>(new Map())
  const statesRef = useRef(states)
  const requestsRef = useRef(new Map<string, RequestRecord>())
  const settledRef = useRef(new Map<string, SettledRecord>())
  const nextRequestId = useRef(0)
  const [retryTokens, setRetryTokens] = useState<ReadonlyMap<string, number>>(new Map())
  const [cachedOutcomes, setCachedOutcomes] = useState<CachedOutcomesRecord>()
  const cacheMinecraftVersion = languageCraftCache?.minecraftVersion
  const cacheLocale = languageCraftCache?.locale
  const cacheIdentity = useMemo(() => cacheMinecraftVersion === undefined || cacheLocale === undefined ? undefined : JSON.stringify({
    minecraftVersion: cacheMinecraftVersion,
    locale: cacheLocale,
    cacheInvalidationKey,
    entries: entries.map((entry) => [entry.id, languageCraftEntryKey(entry, scoringSettings, itemIdSearch)]).sort(([left], [right]) => left.localeCompare(right)),
  }), [cacheInvalidationKey, cacheLocale, cacheMinecraftVersion, entries, itemIdSearch, scoringSettings])
  const cachedEntries = useMemo(() => entries.map((entry) => ({
    id: entry.id,
    key: languageCraftEntryKey(entry, scoringSettings, itemIdSearch),
  })), [cacheIdentity])
  const cacheIsReady = cacheIdentity === undefined || cachedOutcomes?.identity === cacheIdentity
  const reusableCachedOutcomes = cachedOutcomes !== undefined && cacheIdentity === cachedOutcomes.identity
    ? cachedOutcomes.outcomes
    : undefined

  useEffect(() => {
    if (paused || cacheIdentity === undefined || cacheMinecraftVersion === undefined || cacheLocale === undefined) {
      setCachedOutcomes(undefined)
      return
    }
    let cancelled = false
    void Promise.all(cachedEntries.map(async (entry) => [
      entry.id,
      (await loadLanguageCraftOutcomeRecords(
        cacheMinecraftVersion,
        entry.key,
      )).get(cacheLocale),
    ] as const)).then((records) => {
      if (cancelled) return
      setCachedOutcomes({
        identity: cacheIdentity,
        outcomes: new Map(records.filter((record): record is [string, CachedLanguageCraftOutcome] => record[1] !== undefined)),
      })
    }).catch(() => {
      if (!cancelled) setCachedOutcomes({ identity: cacheIdentity, outcomes: new Map() })
    })
    return () => { cancelled = true }
  }, [cacheIdentity, cacheLocale, cacheMinecraftVersion, cachedEntries, paused])

  function publish(entryId: string, state: RowOptimizationState | undefined): void {
    const next = new Map(statesRef.current)
    if (state === undefined) next.delete(entryId)
    else next.set(entryId, state)
    statesRef.current = next
    setStates(next)
  }

  useEffect(() => {
    if (paused) {
      for (const request of requestsRef.current.values()) request.controller.abort()
      requestsRef.current.clear()
      settledRef.current.clear()
      const next = new Map<string, RowOptimizationState>()
      for (const entry of entries) {
        const fingerprint = entryOptimizationFingerprint(entry, scoringSettings, itemIdSearch)
        const active = data !== undefined && entry.enabled && entry.targetIds.length > 0
        next.set(entry.id, active ? { status: 'pending', fingerprint } : { status: 'idle' })
      }
      const unchanged = next.size === statesRef.current.size && [...next].every(([entryId, state]) => {
        const current = statesRef.current.get(entryId)
        if (current?.status !== state.status) return false
        return state.status !== 'pending' || (current.status === 'pending' && current.fingerprint === state.fingerprint)
      })
      if (unchanged) return
      statesRef.current = next
      setStates(next)
      return
    }
    const entriesById = new Map(entries.map((entry) => [entry.id, entry]))
    for (const [entryId, request] of requestsRef.current) {
      if (!entriesById.has(entryId)) {
        request.controller.abort()
        requestsRef.current.delete(entryId)
        settledRef.current.delete(entryId)
        publish(entryId, undefined)
      }
    }

    for (const entry of entries) {
      const fingerprint = entryOptimizationFingerprint(entry, scoringSettings, itemIdSearch)
      const retryToken = retryTokens.get(entry.id) ?? 0
      const active = data !== undefined && entry.enabled && entry.targetIds.length > 0
      const current = statesRef.current.get(entry.id)
      const request = requestsRef.current.get(entry.id)
      const settled = settledRef.current.get(entry.id)

      if (!active) {
        if (request) {
          request.controller.abort()
          requestsRef.current.delete(entry.id)
        }
        if (current?.status === 'pending') publish(entry.id, { status: 'idle' })
        continue
      }
      if (!cacheIsReady) {
        request?.controller.abort()
        requestsRef.current.delete(entry.id)
        if (current?.status !== 'pending' || current.fingerprint !== fingerprint) publish(entry.id, { status: 'pending', fingerprint })
        continue
      }
      const cached = reusableCachedOutcomes?.get(entry.id)
      const cachedOutcome = cached?.resultDetail === 'optimal' && resultDetail === 'all'
        ? undefined
        : cached?.outcome
      if (cachedOutcome !== undefined && retryToken === 0) {
        request?.controller.abort()
        requestsRef.current.delete(entry.id)
        settledRef.current.set(entry.id, { fingerprint, retryToken, data: data!, status: 'ready' })
        if (current?.status !== 'ready' || current.fingerprint !== fingerprint || current.outcome !== cachedOutcome) {
          publish(entry.id, { status: 'ready', fingerprint, outcome: cachedOutcome })
        }
        continue
      }
      if (
        request?.fingerprint === fingerprint
        && request.retryToken === retryToken
        && request.data === data
        && (current?.status === 'pending' || current?.status === 'ready')
      ) continue
      if (
        !request
        && (current?.status === 'ready' || current?.status === 'error')
        && current.fingerprint === fingerprint
        && settled?.fingerprint === fingerprint
        && settled.retryToken === retryToken
        && settled.data === data
        && settled.status === current.status
      ) continue

      request?.controller.abort()
      settledRef.current.delete(entry.id)
      const controller = new AbortController()
      const requestId = ++nextRequestId.current
      requestsRef.current.set(entry.id, { requestId, fingerprint, retryToken, data, controller })
      publish(entry.id, { status: 'pending', fingerprint })
      const options: OptimizeWorkspaceOptions = { signal: controller.signal, scoringSettings, itemIdSearch, resultDetail }

      optimize(data, entry, options).then((outcome) => {
        const latest = requestsRef.current.get(entry.id)
        if (controller.signal.aborted || latest?.requestId !== requestId) return
        requestsRef.current.delete(entry.id)
        settledRef.current.set(entry.id, { fingerprint, retryToken, data, status: 'ready' })
        if (cacheMinecraftVersion && cacheLocale) void saveLanguageCraftOutcome(
          cacheMinecraftVersion,
          languageCraftEntryKey(entry, scoringSettings, itemIdSearch),
          cacheLocale,
          outcome,
          resultDetail,
        )
        publish(entry.id, { status: 'ready', fingerprint, outcome })
      }).catch((error: unknown) => {
        const latest = requestsRef.current.get(entry.id)
        if (controller.signal.aborted || latest?.requestId !== requestId || isAbortError(error)) return
        requestsRef.current.delete(entry.id)
        settledRef.current.set(entry.id, { fingerprint, retryToken, data, status: 'error' })
        publish(entry.id, {
          status: 'error',
          fingerprint,
          message: error instanceof Error ? error.message : 'Calculation failed.',
        })
      })
    }
  }, [cacheIsReady, cacheLocale, cacheMinecraftVersion, data, entries, itemIdSearch, optimize, paused, resultDetail, retryTokens, reusableCachedOutcomes, scoringSettings])

  useEffect(() => () => {
    for (const request of requestsRef.current.values()) request.controller.abort()
  }, [])

  const aggregate = useMemo(() => aggregateEnglishScore(entries, states), [entries, states])
  return {
    states,
    aggregate,
    retry(entryId: string) {
      setRetryTokens((current) => {
        const next = new Map(current)
        next.set(entryId, (next.get(entryId) ?? 0) + 1)
        return next
      })
    },
  }
}
