import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { EntryOptimizationOutcome, GeneratedData, LanguageMetadata, TargetWorkspaceEntry } from '../domain/types'
import { DEFAULT_SCORING_SETTINGS } from '../engine/scoring'
import { languageCraftEntryKey, clearLanguageCraftCache } from '../persistence/languageCraftCache'
import { languageScoreEntryKey } from '../persistence/languageScoreCache'
import { loadLanguageScoreCache } from '../persistence/storage'

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
  metricsForOutcome: () => ({}),
}))

import { useWarmLanguageScores } from './useWarmLanguageScores'

const minecraftVersion = 'warm-language-score-test'
const entry: TargetWorkspaceEntry = { id: 'tools', targetIds: ['minecraft:stick'], inventoryItemIds: [], enabled: true, gridSize: 3, order: 0 }
const baseData = {} as GeneratedData
const localizedData = {} as GeneratedData
const languages: LanguageMetadata[] = [
  { locale: 'en_us', name: 'English', region: 'US', script: 'latin' },
  { locale: 'de_de', name: 'Deutsch', region: 'DE', script: 'latin' },
]
const outcome: EntryOptimizationOutcome = { kind: 'ranked', entryId: entry.id, rankedSearches: [], bestScore: 0, visibleItemIds: [] }

beforeEach(async () => {
  await clearLanguageCraftCache(minecraftVersion)
})

afterEach(async () => {
  await clearLanguageCraftCache(minecraftVersion)
  localStorage.clear()
  vi.clearAllMocks()
})

describe('useWarmLanguageScores', () => {
  test('calculates and caches every enabled language when the initial workspace is ready', async () => {
    mocks.loadLocalizedSearchPayload.mockResolvedValue({})
    mocks.parseLocalizedGeneratedData.mockReturnValue(localizedData)
    mocks.optimizeWorkspaceEntry.mockResolvedValue(outcome)

    renderHook(() => useWarmLanguageScores(
      baseData,
      languages,
      [entry],
      new Set(),
      minecraftVersion,
      DEFAULT_SCORING_SETTINGS,
      false,
      '/',
    ))

    await waitFor(() => expect(loadLanguageScoreCache(undefined, minecraftVersion).value.entryScores[languageScoreEntryKey(entry)])
      .toEqual({ en_us: { score: 0 }, de_de: { score: 0 } }))
    expect(mocks.optimizeWorkspaceEntry).toHaveBeenCalledTimes(2)
    expect(mocks.optimizeWorkspaceEntry).toHaveBeenCalledWith(baseData, entry, expect.objectContaining({ itemIdSearch: false }))
    expect(mocks.optimizeWorkspaceEntry).toHaveBeenCalledWith(localizedData, entry, expect.objectContaining({ itemIdSearch: false }))
    expect(await (await import('../persistence/languageCraftCache')).loadLanguageCraftOutcomes(
      minecraftVersion,
      languageCraftEntryKey(entry, DEFAULT_SCORING_SETTINGS, false),
    )).toEqual(new Map([['en_us', outcome], ['de_de', outcome]]))
  })
})
