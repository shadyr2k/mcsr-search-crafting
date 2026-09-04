import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { parseIconManifest } from '../data/iconManifest'
import type { RankedSearch, SearchItem, TargetWorkspaceEntry } from '../domain/types'
import { CalculatedSearchRow } from './CalculatedSearchRow'

afterEach(cleanup)

const entry: TargetWorkspaceEntry = { id: 'a', targetIds: ['minecraft:bow'], inventoryItemIds: [], enabled: true, gridSize: 3, order: 0 }
const items = new Map<string, SearchItem>([['minecraft:bow', { id: 'minecraft:bow', name: 'Bow', confidence: 'exact', searchLines: [] }]])
const icons = parseIconManifest({ schema_version: 1, minecraft_version: '1.16.1', icon_width: 16, icon_height: 16, icons: { 'minecraft:bow': 'minecraft/bow.png' } })

function search(query: string, score: number): RankedSearch {
  return {
    kind: 'single', queries: [query], coveredTargetIds: ['minecraft:bow'], totalJunkAppearances: 0, totalTypedCharacters: query.length, totalScore: score,
    steps: [{ query, retainedPrefix: '', freeBackspaceCount: 0, typedSuffix: query, coveredTargetIds: ['minecraft:bow'], newTargetIds: ['minecraft:bow'], junkItemIds: [], explanations: [], score: { typingPenalty: score, junkPresencePenalty: 0, junkCountPenalty: 0, total: score } }],
  }
}

describe('CalculatedSearchRow', () => {
  test('shows the best three total and expands to at most ten total', () => {
    const rankedSearches = Array.from({ length: 12 }, (_, index) => search(`q${index + 1}`, index + 1))
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches, bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} />)

    expect(screen.getByText('q1, q2, q3')).toBeTruthy()
    expect(screen.queryByRole('listitem', { name: 'Rank 4' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show searches for item set 1' }))
    expect(screen.getAllByRole('listitem', { name: /Rank / })).toHaveLength(10)
    expect(screen.getByRole('button', { name: 'Hide searches for item set 1' }).getAttribute('aria-expanded')).toBe('true')
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
