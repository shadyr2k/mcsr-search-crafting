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

function search(query: string, junk: number, score: number, kind: RankedSearch['kind'] = 'single'): RankedSearch {
  return {
    kind, queries: [query], coveredTargetIds: ['minecraft:stick'], totalJunkAppearances: junk, totalTypedCharacters: query.length, totalScore: score,
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
  test('uses the shared searchable language dropdown for comparison choices', () => {
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
    const leftLanguage = screen.getByRole('combobox', { name: 'Left comparison language' })
    fireEvent.focus(leftLanguage)
    const choices = screen.getByRole('region', { name: 'Left comparison language choices' })
    fireEvent.click(within(choices).getByRole('option', { name: 'german - deutsch (deutschland)' }))

    expect((leftLanguage as HTMLInputElement).value).toBe('german - deutsch (deutschland)')
  })

  test('compares selected crafts with independent character, junk, and score winners', () => {
    comparisonStates.set('en_us', ready({ kind: 'ranked', entryId: entry.id, rankedSearches: [search('cat', 1, 5)], bestScore: 5, visibleItemIds: [] }))
    comparisonStates.set('de_de', ready({ kind: 'ranked', entryId: entry.id, rankedSearches: [search('dogs', 0, 4, 'overlap')], bestScore: 4, visibleItemIds: [] }))

    render(<LanguageComparison
      baseData={data}
      entries={[entry]}
      languages={languages}
      selectedLocale="en_us"
      icons={icons}
      dataBaseUrl="/"
      scoringSettings={DEFAULT_SCORING_SETTINGS}
      itemIdSearch={false}
      languageScores={new Map([
        ['en_us', { status: 'ready' as const, score: 5 }],
        ['de_de', { status: 'ready' as const, score: 4 }],
        ['da_dk', { status: 'ready' as const, score: 1 }],
        ['fr_fr', { status: 'ready' as const, score: 10 }],
      ])}
    />)

    fireEvent.click(screen.getByRole('button', { name: /compare languages/i }))
    expect(screen.getByRole('combobox', { name: 'Left comparison language' })).toBeTruthy()
    expect(screen.getByText(/press compare to calculate/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^compare$/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Expand item set 1 comparison' }))
    expect(screen.getByText('3 chars').className).toContain('language-comparison__value--better')
    expect(screen.getByText('1 junk').className).toContain('language-comparison__value--worse')
    expect(screen.getByText('4 chars').className).toContain('language-comparison__value--worse')
    expect(screen.getByText('0 junk').className).toContain('language-comparison__value--better')
    expect(screen.getByRole('complementary', { name: 'Item set 1 scores' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Collapse item set 1 comparison' }).textContent).toContain('item set 1')
    expect(screen.getByRole('button', { name: 'Collapse item set 1 comparison' }).textContent).not.toContain('Stick')
    const itemScores = screen.getByRole('complementary', { name: 'Item set 1 scores' })
    expect(itemScores.textContent).toMatch(/overlap.*chars.*junk.*score/)
    expect(itemScores.textContent).toContain('❌ / ✅')
    const characterPair = itemScores.querySelectorAll('.language-comparison__score-pair')[1]!
    expect(characterPair.textContent).toBe('3 / 4')
    expect(characterPair.children[0].className).toContain('language-comparison__value--better')
    expect(characterPair.children[2].className).toContain('language-comparison__value--worse')
    const scoreBoxes = screen.getByRole('complementary', { name: 'Overall language comparison' }).querySelectorAll('.language-comparison__score-box')
    expect(screen.getByLabelText('Total character and junk comparison').textContent).toBe('chars3 / 4junk1 / 0')
    expect(screen.getByText('best calculated · da_dk')).toBeTruthy()
    expect(screen.getByText('worst calculated · fr_fr')).toBeTruthy()
    expect(scoreBoxes).toHaveLength(4)
    expect(scoreBoxes[0].className).toContain('language-comparison__score-box--bound')
    expect(scoreBoxes[1].textContent).toContain('german')
    expect(scoreBoxes[1].getAttribute('style')).toContain('80')
    expect(scoreBoxes[2].textContent).toContain('english')
    expect(scoreBoxes[2].getAttribute('style')).toContain('67')
    expect(scoreBoxes[3].className).toContain('language-comparison__score-box--bound')
    const comparisonRow = screen.getByRole('region', { name: 'Item set 1 comparison' })
    fireEvent.click(screen.getByRole('button', { name: 'Collapse item set 1 comparison' }))
    expect(comparisonRow.querySelector('.crafting-sheet__details--closing')).toBeTruthy()
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
    expect(screen.getByText('item set scores')).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: 'Compared item set' })).toBeNull()
    unmount()

    const onBack = vi.fn()
    render(<LanguageComparison {...props} layout="page" compactLayout onBack={onBack} />)
    expect(screen.getByRole('button', { name: 'Back to crafts' }).className).toContain('language-comparison__back-button')
    fireEvent.click(screen.getByRole('button', { name: /^compare$/i }))
    expect(screen.getAllByRole('region', { name: /item set \d comparison/i })).toHaveLength(1)
    expect(screen.getByRole('combobox', { name: 'Compared item set' })).toBeTruthy()
    expect(screen.getByText('item set scores')).toBeTruthy()
    expect(screen.getByLabelText(/Language positions:/).textContent).toMatch(/left.*english.*right.*german/i)
    fireEvent.click(screen.getByRole('button', { name: 'Back to crafts' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
