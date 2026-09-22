import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { EntryOptimizationOutcome, GeneratedData, TargetWorkspaceEntry } from '../domain/types'
import { DEFAULT_SCORING_SETTINGS } from '../engine/scoring'
import { entryOptimizationFingerprint } from './useRowOptimizations'

const mocks = vi.hoisted(() => ({
  loadLocalizedSearchPayload: vi.fn(),
  parseLocalizedGeneratedData: vi.fn(),
  optimizeWorkspaceEntry: vi.fn(),
}))

vi.mock('../data/schema', () => ({
  loadLocalizedSearchPayload: mocks.loadLocalizedSearchPayload,
  parseLocalizedGeneratedData: mocks.parseLocalizedGeneratedData,
}))

vi.mock('../engine/optimizeWorkspace', () => ({
  optimizeWorkspaceEntry: mocks.optimizeWorkspaceEntry,
}))

import { useLanguageComparison } from './useLanguageComparison'

afterEach(() => vi.clearAllMocks())

const entry: TargetWorkspaceEntry = { id: 'tools', targetIds: ['minecraft:stick'], inventoryItemIds: [], enabled: true, gridSize: 3, order: 0 }
const entries = [entry]
const baseData = {} as GeneratedData
const localizedData = {} as GeneratedData
const readyOutcome: EntryOptimizationOutcome = { kind: 'ranked', entryId: entry.id, rankedSearches: [], bestScore: 0, visibleItemIds: [] }

describe('useLanguageComparison', () => {
  test('reuses loaded current-language craft outcomes and calculates only the other locale', async () => {
    mocks.loadLocalizedSearchPayload.mockResolvedValue({})
    mocks.parseLocalizedGeneratedData.mockReturnValue(localizedData)
    mocks.optimizeWorkspaceEntry.mockResolvedValue(readyOutcome)
    const loadedStates = new Map([[
      entry.id,
      { status: 'ready' as const, fingerprint: entryOptimizationFingerprint(entry), outcome: readyOutcome },
    ]])

    const hook = renderHook(() => useLanguageComparison(
      baseData,
      entries,
      'en_us',
      'de_de',
      '/',
      DEFAULT_SCORING_SETTINGS,
      false,
      true,
      'en_us',
      loadedStates,
    ))

    expect(hook.result.current.get('en_us')).toMatchObject({ status: 'ready' })
    await waitFor(() => expect(hook.result.current.get('de_de')).toMatchObject({ status: 'ready' }))
    expect(mocks.optimizeWorkspaceEntry).toHaveBeenCalledTimes(1)
    expect(mocks.optimizeWorkspaceEntry).toHaveBeenCalledWith(localizedData, entry, expect.objectContaining({ itemIdSearch: false }))
  })
})
