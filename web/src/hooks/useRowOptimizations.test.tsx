import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import type { EntryOptimizationOutcome, GeneratedData, TargetWorkspaceEntry } from '../domain/types'
import { DEFAULT_SCORING_SETTINGS } from '../engine/scoring'
import { useRowOptimizations } from './useRowOptimizations'

const data: GeneratedData = {
  schemaVersion: 3,
  items: new Map(),
  inventoryItems: new Map(),
  recipes: [],
  collections: new Map(),
  presets: new Map(),
}

function entry(id: string, overrides: Partial<TargetWorkspaceEntry> = {}): TargetWorkspaceEntry {
  return {
    id,
    targetIds: ['minecraft:stick'],
    inventoryItemIds: ['minecraft:oak_planks'],
    enabled: true,
    gridSize: 3,
    order: 0,
    ...overrides,
  }
}

function outcome(entryId: string, bestScore = 0): EntryOptimizationOutcome {
  return {
    kind: 'ranked',
    entryId,
    rankedSearches: [],
    bestScore,
    visibleItemIds: [],
  }
}

describe('useRowOptimizations', () => {
  test('recalculates only the saved row whose fingerprint changed', async () => {
    const optimize = vi.fn(async (_data, current: TargetWorkspaceEntry) => outcome(current.id))
    const first = entry('a')
    const second = entry('b')
    const { rerender } = renderHook(({ entries }) => useRowOptimizations(data, entries, DEFAULT_SCORING_SETTINGS, false, optimize), {
      initialProps: { entries: [first, second] },
    })
    await waitFor(() => expect(optimize).toHaveBeenCalledTimes(2))

    rerender({ entries: [{ ...first, inventoryItemIds: ['minecraft:stick'] }, second] })
    await waitFor(() => expect(optimize).toHaveBeenCalledTimes(3))
    expect(optimize.mock.calls.map(([, current]) => current.id)).toEqual(['a', 'b', 'a'])
  })

  test('recalculates saved rows after the scoring settings change', async () => {
    const optimize = vi.fn(async (_data, current: TargetWorkspaceEntry) => outcome(current.id))
    const saved = entry('a')
    const hook = renderHook(({ settings }) => useRowOptimizations(data, [saved], settings, false, optimize), {
      initialProps: { settings: DEFAULT_SCORING_SETTINGS },
    })
    await waitFor(() => expect(optimize).toHaveBeenCalledTimes(1))

    hook.rerender({ settings: { ...DEFAULT_SCORING_SETTINGS, junkItemPenalty: 1 } })
    await waitFor(() => expect(optimize).toHaveBeenCalledTimes(2))
  })

  test('aborts obsolete work and ignores its later resolution', async () => {
    let resolveFirst!: (value: EntryOptimizationOutcome) => void
    const first = new Promise<EntryOptimizationOutcome>((resolve) => { resolveFirst = resolve })
    const optimize = vi.fn()
      .mockReturnValueOnce(first)
      .mockImplementation(async (_data, current: TargetWorkspaceEntry) => outcome(current.id, 0))
    const saved = entry('a')
    const hook = renderHook(({ entries }) => useRowOptimizations(data, entries, DEFAULT_SCORING_SETTINGS, false, optimize), {
      initialProps: { entries: [saved] },
    })
    await waitFor(() => expect(optimize).toHaveBeenCalledTimes(1))

    hook.rerender({ entries: [{ ...saved, gridSize: 2 }] })
    await waitFor(() => expect(optimize).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(hook.result.current.states.get('a')).toMatchObject({ status: 'ready', outcome: { bestScore: 0 } }))
    await act(async () => { resolveFirst(outcome('a', 99)) })
    expect(hook.result.current.states.get('a')).toMatchObject({ status: 'ready', outcome: { bestScore: 0 } })
  })

  test('retains ready cache for reordering and excludes disabled rows from the aggregate', async () => {
    const optimize = vi.fn(async (_data, current: TargetWorkspaceEntry) => outcome(current.id, current.id === 'a' ? 2 : 3))
    const first = entry('a', { order: 0 })
    const second = entry('b', { order: 1 })
    const hook = renderHook(({ entries }) => useRowOptimizations(data, entries, DEFAULT_SCORING_SETTINGS, false, optimize), {
      initialProps: { entries: [first, second] },
    })
    await waitFor(() => expect(hook.result.current.aggregate).toEqual({ status: 'ready', score: 5 }))

    hook.rerender({ entries: [{ ...second, order: 0 }, { ...first, order: 1, enabled: false }] })
    expect(optimize).toHaveBeenCalledTimes(2)
    expect(hook.result.current.aggregate).toEqual({ status: 'ready', score: 3 })
  })

  test('reports technical errors and retries the same saved fingerprint', async () => {
    const optimize = vi.fn()
      .mockImplementationOnce(async () => { throw new Error('broken data') })
      .mockImplementation(async (_data, current: TargetWorkspaceEntry) => outcome(current.id, 1))
    const hook = renderHook(() => useRowOptimizations(data, [entry('a')], DEFAULT_SCORING_SETTINGS, false, optimize))
    await waitFor(() => expect(hook.result.current.states.get('a')).toMatchObject({ status: 'error', message: 'broken data' }))

    act(() => hook.result.current.retry('a'))
    await waitFor(() => expect(hook.result.current.states.get('a')).toMatchObject({ status: 'ready', outcome: { bestScore: 1 } }))
    expect(optimize).toHaveBeenCalledTimes(2)
  })

  test('aborts and removes state when a saved row is deleted', async () => {
    let receivedSignal: AbortSignal | undefined
    const optimize = vi.fn((
      _data: GeneratedData,
      _entry: TargetWorkspaceEntry,
      options?: { signal?: AbortSignal },
    ) => {
      receivedSignal = options?.signal
      return new Promise<EntryOptimizationOutcome>(() => {})
    })
    const saved = entry('a')
    const hook = renderHook(({ entries }) => useRowOptimizations(data, entries, DEFAULT_SCORING_SETTINGS, false, optimize), {
      initialProps: { entries: [saved] },
    })
    await waitFor(() => expect(hook.result.current.states.get('a')).toMatchObject({ status: 'pending' }))

    hook.rerender({ entries: [] })
    await waitFor(() => expect(hook.result.current.states.has('a')).toBe(false))
    expect(receivedSignal?.aborted).toBe(true)
  })
})
