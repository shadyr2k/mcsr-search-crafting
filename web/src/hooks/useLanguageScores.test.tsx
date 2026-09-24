import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import type { GeneratedData, LanguageMetadata, TargetWorkspaceEntry } from '../domain/types'
import { LANGUAGE_SCORE_CACHE_UPDATED_EVENT, languageScoreEntryKey } from '../persistence/languageScoreCache'
import { saveLanguageScoreCache } from '../persistence/storage'
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
const noBannedLocales = new Set<string>()
const minecraftVersion = 'language-score-hook-test'

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

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('useLanguageScores', () => {
  test('shows only already cached language scores without starting optimizations', async () => {
    const itemSets = [entry('tools', 'minecraft:stick'), entry('blocks', 'minecraft:crafting_table')]
    saveLanguageScoreCache({
      entryScores: {
        [languageScoreEntryKey(itemSets[0])]: {
          en_us: { score: 3, optimalCharacterCount: 4, leastJunk: 0 },
          de_de: { score: 103, optimalCharacterCount: 104, leastJunk: 1 },
        },
        [languageScoreEntryKey(itemSets[1])]: {
          en_us: { score: 5, optimalCharacterCount: 6, leastJunk: 2 },
          de_de: { score: 105, optimalCharacterCount: 106, leastJunk: 0 },
        },
      },
    }, undefined, minecraftVersion)

    const hook = renderHook(() => useLanguageScores(data, languages, itemSets, noBannedLocales, minecraftVersion))

    await waitFor(() => expect(hook.result.current.get('en_us')).toEqual({ status: 'ready', score: 8, optimalCharacterCount: 10, leastJunk: 2 }))
    expect(hook.result.current.get('de_de')).toEqual({ status: 'ready', score: 208, optimalCharacterCount: 210, leastJunk: 1 })
  })

  test('keeps an uncached language uncalculated until an explicit comparison saves it', async () => {
    const itemSets = [entry('tools', 'minecraft:stick')]
    const hook = renderHook(() => useLanguageScores(data, languages, itemSets, noBannedLocales, minecraftVersion))

    await waitFor(() => expect(hook.result.current.get('en_us')).toEqual({ status: 'not-calculated' }))
    expect(hook.result.current.get('de_de')).toEqual({ status: 'not-calculated' })

    saveLanguageScoreCache({
      entryScores: {
        [languageScoreEntryKey(itemSets[0])]: {
          en_us: { score: 3, optimalCharacterCount: 4, leastJunk: 0 },
        },
      },
    }, undefined, minecraftVersion)
    window.dispatchEvent(new Event(LANGUAGE_SCORE_CACHE_UPDATED_EVENT))

    await waitFor(() => expect(hook.result.current.get('en_us')).toEqual({ status: 'ready', score: 3, optimalCharacterCount: 4, leastJunk: 0 }))
    expect(hook.result.current.get('de_de')).toEqual({ status: 'not-calculated' })
  })
})
