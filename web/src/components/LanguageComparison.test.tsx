import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { parseIconManifest } from '../data/iconManifest'
import type { EntryOptimizationOutcome, GeneratedData, RankedSearch, TargetWorkspaceEntry } from '../domain/types'
import type { LanguageComparisonState } from '../hooks/useLanguageComparison'
import { DEFAULT_SCORING_SETTINGS } from '../engine/scoring'

const comparisonStates = vi.hoisted(() => new Map<string, LanguageComparisonState>())

vi.mock('../hooks/useLanguageComparison', () => ({
  useLanguageComparison: () => comparisonStates,
}))

import { LanguageComparison } from './LanguageComparison'

afterEach(() => {
  cleanup()
  comparisonStates.clear()
})

const data: GeneratedData = {
  schemaVersion: 3,
  items: new Map([['minecraft:stick', { id: 'minecraft:stick', name: 'Stick', confidence: 'exact', searchLines: [] }]]),
  inventoryItems: new Map(),
  recipes: [],
  collections: new Map(),
  presets: new Map(),
}
const icons = parseIconManifest({ schema_version: 1, minecraft_version: '1.16.1', icon_width: 16, icon_height: 16, icons: { 'minecraft:stick': 'minecraft/stick.png' } })
const entry: TargetWorkspaceEntry = { id: 'tools', targetIds: ['minecraft:stick'], inventoryItemIds: [], enabled: true, gridSize: 3, order: 0 }
const languages = [
  { locale: 'en_us', name: 'English', region: 'United States', script: 'latin' as const },
  { locale: 'de_de', name: 'Deutsch', region: 'Deutschland', script: 'latin' as const },
]

function search(query: string, junk: number, score: number): RankedSearch {
  return {
    kind: 'single', queries: [query], coveredTargetIds: ['minecraft:stick'], totalJunkAppearances: junk, totalTypedCharacters: query.length, totalScore: score,
    steps: [{
      query, retainedPrefix: '', freeBackspaceCount: 0, typedSuffix: query,
      coveredTargetIds: ['minecraft:stick'], newTargetIds: ['minecraft:stick'], junkItemIds: Array.from({ length: junk }, () => 'minecraft:stick'), explanations: [],
      score: { typingPenalty: score, junkPresencePenalty: 0, junkCountPenalty: 0, total: score },
    }],
  }
}

function ready(outcome: EntryOptimizationOutcome): LanguageComparisonState {
  return { status: 'ready', outcomes: new Map([[entry.id, outcome]]), data }
}

describe('LanguageComparison', () => {
  test('compares selected crafts with independent character, junk, and score winners', () => {
    comparisonStates.set('en_us', ready({ kind: 'ranked', entryId: entry.id, rankedSearches: [search('cat', 1, 5)], bestScore: 5, visibleItemIds: [] }))
    comparisonStates.set('de_de', ready({ kind: 'ranked', entryId: entry.id, rankedSearches: [search('dogs', 0, 4)], bestScore: 4, visibleItemIds: [] }))

    render(<LanguageComparison
      baseData={data}
      entries={[entry]}
      languages={languages}
      selectedLocale="en_us"
      icons={icons}
      dataBaseUrl="/"
      scoringSettings={DEFAULT_SCORING_SETTINGS}
      itemIdSearch={false}
    />)

    fireEvent.click(screen.getByRole('button', { name: /compare languages/i }))
    expect(screen.getByRole('combobox', { name: 'Left comparison language' })).toBeTruthy()
    expect(screen.getByText(/press compare to calculate/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^compare$/i }))
    expect(screen.getByText('3 chars').className).toContain('language-comparison__value--better')
    expect(screen.getByText('1 junk').className).toContain('language-comparison__value--worse')
    expect(screen.getByText('4 chars').className).toContain('language-comparison__value--worse')
    expect(screen.getByText('0 junk').className).toContain('language-comparison__value--better')
    expect(within(screen.getByLabelText('Craft differences')).getByText('german has the lower calculated score.')).toBeTruthy()
  })

  test('shows all paired item sets in the normal layout and one navigable set in compact layout', () => {
    const secondEntry: TargetWorkspaceEntry = { ...entry, id: 'tools-two', order: 1 }
    const outcomeFor = (entryId: string, query: string): EntryOptimizationOutcome => ({
      kind: 'ranked', entryId, rankedSearches: [search(query, 0, query.length)], bestScore: query.length, visibleItemIds: [],
    })
    comparisonStates.set('en_us', { status: 'ready', outcomes: new Map([
      [entry.id, outcomeFor(entry.id, 'cat')],
      [secondEntry.id, outcomeFor(secondEntry.id, 'cats')],
    ]), data })
    comparisonStates.set('de_de', { status: 'ready', outcomes: new Map([
      [entry.id, outcomeFor(entry.id, 'dog')],
      [secondEntry.id, outcomeFor(secondEntry.id, 'dogs')],
    ]), data })

    const props = {
      baseData: data, entries: [entry, secondEntry], languages, selectedLocale: 'en_us', icons, dataBaseUrl: '/', scoringSettings: DEFAULT_SCORING_SETTINGS, itemIdSearch: false,
    }
    const { unmount } = render(<LanguageComparison {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /compare languages/i }))
    expect(screen.getByText('english - english (united states)')).toBeTruthy()
    expect(screen.getByText('german - deutsch (deutschland)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^compare$/i }))
    expect(screen.getAllByRole('region', { name: /item set \d comparison/i })).toHaveLength(2)
    expect(screen.getByRole('complementary', { name: 'Overall language comparison' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Craft differences by item set' })).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: 'Compared item set' })).toBeNull()
    unmount()

    render(<LanguageComparison {...props} layout="page" compactLayout />)
    fireEvent.click(screen.getByRole('button', { name: /^compare$/i }))
    expect(screen.getAllByRole('region', { name: /item set \d comparison/i })).toHaveLength(1)
    expect(screen.getByRole('combobox', { name: 'Compared item set' })).toBeTruthy()
    expect(screen.getByRole('complementary', { name: 'Craft differences' })).toBeTruthy()
  })
})
