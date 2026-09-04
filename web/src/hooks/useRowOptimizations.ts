import { useEffect, useMemo, useRef, useState } from 'react'

import type {
  GeneratedData,
  RowOptimizationState,
  TargetWorkspaceEntry,
} from '../domain/types'
import {
  aggregateEnglishScore,
  optimizeWorkspaceEntry,
  type OptimizeWorkspaceOptions,
} from '../engine/optimizeWorkspace'

interface RequestRecord {
  requestId: number
  fingerprint: string
  retryToken: number
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

export function entryOptimizationFingerprint(entry: TargetWorkspaceEntry): string {
  return JSON.stringify({
    targetIds: [...new Set(entry.targetIds)].sort(),
    inventoryItemIds: [...new Set(entry.inventoryItemIds)].sort(),
    gridSize: entry.gridSize,
  })
}

export function useRowOptimizations(
  data: GeneratedData | undefined,
  entries: readonly TargetWorkspaceEntry[],
  optimize: typeof optimizeWorkspaceEntry = optimizeWorkspaceEntry,
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

  function publish(entryId: string, state: RowOptimizationState | undefined): void {
    const next = new Map(statesRef.current)
    if (state === undefined) next.delete(entryId)
    else next.set(entryId, state)
    statesRef.current = next
    setStates(next)
  }

  useEffect(() => {
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
      const fingerprint = entryOptimizationFingerprint(entry)
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
      if (
        request?.fingerprint === fingerprint
        && request.retryToken === retryToken
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
      requestsRef.current.set(entry.id, { requestId, fingerprint, retryToken, controller })
      publish(entry.id, { status: 'pending', fingerprint })
      const options: OptimizeWorkspaceOptions = { signal: controller.signal }

      optimize(data, entry, options).then((outcome) => {
        const latest = requestsRef.current.get(entry.id)
        if (controller.signal.aborted || latest?.requestId !== requestId) return
        requestsRef.current.delete(entry.id)
        settledRef.current.set(entry.id, { fingerprint, retryToken, data, status: 'ready' })
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
  }, [data, entries, optimize, retryTokens])

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
