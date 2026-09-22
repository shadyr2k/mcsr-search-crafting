import { afterEach, describe, expect, test, vi } from 'vitest'

import type { EntryOptimizationOutcome, TargetWorkspaceEntry } from '../domain/types'
import { clearLanguageCraftCache, languageCraftEntryKey, loadLanguageCraftOutcomes, saveLanguageCraftOutcome } from './languageCraftCache'
import { DEFAULT_SCORING_SETTINGS } from '../engine/scoring'

const entry: TargetWorkspaceEntry = {
  id: 'tools', targetIds: ['minecraft:stick'], inventoryItemIds: ['minecraft:oak_planks'], enabled: true, gridSize: 3, order: 0,
}
const outcome: EntryOptimizationOutcome = {
  kind: 'no-viable', entryId: entry.id, rankedSearches: [], bestScore: 0, visibleItemIds: [], matchedTargetIds: [], unmatchedTargetIds: ['minecraft:stick'],
}

afterEach(async () => {
  await clearLanguageCraftCache('cache-test')
  vi.unstubAllGlobals()
})

describe('languageCraftCache', () => {
  test('keeps complete outcomes per language and item-set identity until invalidated', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const key = languageCraftEntryKey(entry, DEFAULT_SCORING_SETTINGS, false)
    await clearLanguageCraftCache('cache-test')
    await saveLanguageCraftOutcome('cache-test', key, 'de_de', outcome)

    expect((await loadLanguageCraftOutcomes('cache-test', key)).get('de_de')).toEqual(outcome)

    await clearLanguageCraftCache('cache-test')
    expect(await loadLanguageCraftOutcomes('cache-test', key)).toEqual(new Map())
  })
})
