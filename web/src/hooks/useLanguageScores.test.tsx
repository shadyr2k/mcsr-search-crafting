import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { GeneratedData, LanguageMetadata, TargetWorkspaceEntry } from '../domain/types'

const mocks = vi.hoisted(() => ({
  aggregateLocaleMetrics: vi.fn(),
  loadLocalizedSearchPayload: vi.fn(),
  parseLocalizedGeneratedData: vi.fn(),
}))

vi.mock('../engine/optimizeWorkspace', () => ({
  aggregateLocaleMetrics: mocks.aggregateLocaleMetrics,
}))

vi.mock('../data/schema', () => ({
  loadLocalizedSearchPayload: mocks.loadLocalizedSearchPayload,
  parseLocalizedGeneratedData: mocks.parseLocalizedGeneratedData,
}))

import { useLanguageScores } from './useLanguageScores'

const data: GeneratedData = {
  schemaVersion: 3,
  items: new Map(),
  inventoryItems: new Map(),
  recipes: [],
  collections: new Map(),
  presets: new Map(),
}

const languages: LanguageMetadata[] = [
  { locale: 'en_us', name: 'English', region: 'US', script: 'latin' },
  { locale: 'de_de', name: 'Deutsch', region: 'DE', script: 'latin' },
]
const englishOnly = [languages[0]]
const noBannedLocales = new Set<string>()

function entry(id: string, targetId: string): TargetWorkspaceEntry {
  return {
    id,
    targetIds: [targetId],
    inventoryItemIds: ['minecraft:oak_planks'],
    enabled: true,
    gridSize: 3,
    order: 0,
  }
}

function scoreFor(locale: string, targetId: string): number {
  const targetScore = targetId === 'minecraft:stick' ? 3 : 5
  return locale === 'de_de' ? targetScore + 100 : targetScore
}

beforeEach(() => {
  mocks.loadLocalizedSearchPayload.mockResolvedValue({})
  mocks.parseLocalizedGeneratedData.mockImplementation((_payload: unknown, locale: string) => (
    { ...data, locale } as GeneratedData
  ))
  mocks.aggregateLocaleMetrics.mockImplementation(async (
    localeData: GeneratedData,
    currentEntries: readonly TargetWorkspaceEntry[],
  ) => {
    const score = scoreFor(
      (localeData as GeneratedData & { locale?: string }).locale ?? 'en_us',
      currentEntries[0].targetIds[0],
    )
    return { score, optimalCharacterCount: score + 1, leastJunk: score % 3 }
  })
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.clearAllMocks()
})

describe('useLanguageScores', () => {
  test('restores completed scores for every language after a reload', async () => {
    const itemSets = [entry('tools', 'minecraft:stick'), entry('blocks', 'minecraft:crafting_table')]
    const first = renderHook(() => useLanguageScores(data, languages, itemSets, noBannedLocales, '/versions/26.1.2/', '26.1.2'))

    await waitFor(() => expect(first.result.current.get('de_de')).toEqual({ status: 'ready', score: 208, optimalCharacterCount: 210, leastJunk: 1 }))
    expect(mocks.aggregateLocaleMetrics).toHaveBeenCalledTimes(4)

    first.unmount()
    mocks.aggregateLocaleMetrics.mockClear()
    mocks.loadLocalizedSearchPayload.mockClear()

    const reloaded = renderHook(() => useLanguageScores(data, languages, itemSets, noBannedLocales, '/versions/26.1.2/', '26.1.2'))

    await waitFor(() => expect(reloaded.result.current.get('en_us')).toEqual({ status: 'ready', score: 8, optimalCharacterCount: 10, leastJunk: 2 }))
    expect(reloaded.result.current.get('de_de')).toEqual({ status: 'ready', score: 208, optimalCharacterCount: 210, leastJunk: 1 })
    expect(mocks.aggregateLocaleMetrics).not.toHaveBeenCalled()
    expect(mocks.loadLocalizedSearchPayload).not.toHaveBeenCalled()
  })

  test('calculates only an item set that is not already cached', async () => {
    const tools = entry('tools', 'minecraft:stick')
    const blocks = entry('blocks', 'minecraft:crafting_table')
    const hook = renderHook(({ itemSets }) => useLanguageScores(data, englishOnly, itemSets, noBannedLocales, '/versions/26.1.2/', '26.1.2'), {
      initialProps: { itemSets: [tools] },
    })

    await waitFor(() => expect(hook.result.current.get('en_us')).toEqual({ status: 'ready', score: 3, optimalCharacterCount: 4, leastJunk: 0 }))
    expect(mocks.aggregateLocaleMetrics).toHaveBeenCalledTimes(1)

    hook.rerender({ itemSets: [tools, blocks] })

    await waitFor(() => expect(hook.result.current.get('en_us')).toEqual({ status: 'ready', score: 8, optimalCharacterCount: 10, leastJunk: 2 }))
    expect(mocks.aggregateLocaleMetrics).toHaveBeenCalledTimes(2)
    expect(mocks.aggregateLocaleMetrics.mock.calls[1][1]).toEqual([blocks])
  })
})

