import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { parseIconManifest } from '../data/iconManifest'
import type { RankedSearch, SearchItem, TargetWorkspaceEntry } from '../domain/types'
import { CalculatedSearchRow } from './CalculatedSearchRow'

afterEach(cleanup)

const entry: TargetWorkspaceEntry = { id: 'a', targetIds: ['minecraft:bow'], inventoryItemIds: [], enabled: true, gridSize: 3, order: 0 }
const items = new Map<string, SearchItem>([
  ['minecraft:bow', { id: 'minecraft:bow', name: 'Bow', confidence: 'exact', searchLines: [] }],
  ['minecraft:stick', { id: 'minecraft:stick', name: 'Stick', confidence: 'exact', searchLines: [] }],
])
const icons = parseIconManifest({ schema_version: 1, minecraft_version: '1.16.1', icon_width: 16, icon_height: 16, icons: { 'minecraft:bow': 'minecraft/bow.png', 'minecraft:stick': 'minecraft/stick.png' } })

function search(queries: readonly string[], score: number, kind: RankedSearch['kind'] = 'single'): RankedSearch {
  return {
    kind, queries: [...queries], coveredTargetIds: ['minecraft:bow'], totalJunkAppearances: kind === 'overlap' ? 1 : 0, totalTypedCharacters: queries.join('').length, totalScore: score,
    steps: queries.map((query, index) => ({
      query, retainedPrefix: index === 0 ? '' : query.slice(0, 1), freeBackspaceCount: index === 0 ? 0 : 2, typedSuffix: index === 0 ? query : query.slice(1),
      coveredTargetIds: ['minecraft:bow'], newTargetIds: ['minecraft:bow'], junkItemIds: index === queries.length - 1 && kind === 'overlap' ? ['minecraft:stick'] : [], explanations: [],
      score: { typingPenalty: score, junkPresencePenalty: 0, junkCountPenalty: 0, total: score },
    })),
  }
}

describe('CalculatedSearchRow', () => {
  test('balances compact previews and groups every craft category on expansion', () => {
    const rankedSearches = [
      search(['wn'], 1),
      search(['aw', 'be'], 2, 'overlap'),
      search(['re'], 3),
    ]
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches, bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} />)

    expect(screen.getByRole('listitem', { name: 'Regular craft: wn' })).toBeTruthy()
    expect(screen.getByRole('listitem', { name: 'Overlap craft: aw, 2 backspaces, be' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Regular crafts' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))

    expect(screen.getByRole('heading', { name: 'Regular crafts' })).toBeTruthy()
    const overlapCategory = screen.getByRole('region', { name: 'Overlap crafts' })
    expect(screen.getByRole('heading', { name: 'Overlap crafts' })).toBeTruthy()
    expect(within(overlapCategory).getAllByText('↞')).toHaveLength(2)
    expect(screen.getByRole('img', { name: 'Stick' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hide crafts for item set 1' }).getAttribute('aria-expanded')).toBe('true')
  })

  test('uses two previews from a category when the other category has no crafts', () => {
    const rankedSearches = [
      search(['aw', 'be'], 1, 'overlap'),
      search(['an', 'be'], 2, 'overlap'),
      search(['ab', 'be'], 3, 'overlap'),
    ]
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches, bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} />)

    expect(screen.getAllByRole('listitem', { name: /Overlap craft:/ })).toHaveLength(2)
  })

  test('renders no-viable and calculation errors distinctly', () => {
    const { rerender } = render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'no-viable', entryId: 'a', rankedSearches: [], bestScore: 7, visibleItemIds: [], matchedTargetIds: [], unmatchedTargetIds: ['minecraft:bow'] } }} items={items} icons={icons} />)
    expect(screen.getByText('No viable search')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()

    const retry = vi.fn()
    rerender(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'error', fingerprint: 'x', message: 'broken data' }} items={items} icons={icons} onRetry={retry} />)
    expect(screen.getByText('Calculation error')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry item set 1' }))
    expect(retry).toHaveBeenCalledOnce()
  })
})
