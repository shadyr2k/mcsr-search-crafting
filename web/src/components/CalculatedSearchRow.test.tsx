import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { parseIconManifest } from '../data/iconManifest'
import type { RankedSearch, RecipeResultCollection, SearchItem, TargetWorkspaceEntry } from '../domain/types'
import type { CollectionMatchExplanation } from '../engine/search'
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
      query, retainedPrefix: '', freeBackspaceCount: index === 0 ? 0 : 2, typedSuffix: query,
      coveredTargetIds: ['minecraft:bow'], newTargetIds: ['minecraft:bow'], junkItemIds: index === queries.length - 1 && kind === 'overlap' ? ['minecraft:stick'] : [], explanations: [],
      score: { typingPenalty: score, junkPresencePenalty: 0, junkCountPenalty: 0, total: score },
    })),
  }
}

function explanation(line: string, start: number): CollectionMatchExplanation {
  return {
    query: 'wn', collectionId: 'beds', recipeGroup: null, matchedMemberItemId: 'minecraft:bow', matchedMemberName: 'Bow',
    visibleOutputItemId: 'minecraft:bow', visibleOutputName: 'Bow', source: 'name', line,
    matchedSpan: { start, end: start + 2, text: 'wn' },
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
    expect(screen.getByRole('listitem', { name: 'Overlap craft: aw, Shift+Home, be' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Regular crafts' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))

    expect(screen.getByRole('heading', { name: 'Regular crafts' })).toBeTruthy()
    const overlapCategory = screen.getByRole('region', { name: 'Overlap crafts' })
    expect(screen.getByRole('heading', { name: 'Overlap crafts' })).toBeTruthy()
    expect(within(overlapCategory).getByRole('img', { name: 'Shift' })).toBeTruthy()
    expect(within(overlapCategory).getByRole('img', { name: 'Home' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hide crafts for item set 1' }).getAttribute('aria-expanded')).toBe('true')
  })

  test('combines repeated regular queries and reveals their match evidence on demand', () => {
    const first = search(['wn'], 1)
    first.steps[0].explanations = [explanation('Brown Bed', 3)]
    const second = search(['wn'], 2)
    second.steps[0].explanations = [explanation('Respawn Anchor', 5)]
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches: [first, second], bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} />)

    expect(screen.getAllByRole('listitem', { name: 'Regular craft: wn' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))
    expect(screen.getAllByRole('listitem', { name: 'Regular craft: wn' })).toHaveLength(2)
    expect(screen.queryByText('Brown Bed')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show why Regular craft: wn' }))
    expect(screen.getByTitle(/line Brown Bed/)).toBeTruthy()
    expect(screen.getByTitle(/line Respawn Anchor/)).toBeTruthy()
  })

  test('shows overlap suffixes after individual backspaces and renders spaces as underscores', () => {
    const overlap = search(['anc', 'an be'], 1, 'overlap')
    overlap.steps[1] = { ...overlap.steps[1], retainedPrefix: 'an', freeBackspaceCount: 1, typedSuffix: ' be' }
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches: [overlap], bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} />)

    expect(screen.getByText('_be')).toBeTruthy()
    expect(screen.queryByText('an_be')).toBeNull()
    expect(screen.getByRole('img', { name: 'Backspace' })).toBeTruthy()
  })

  test('combines repeated spans for the same item into one explanation', () => {
    const craft = search(['w'], 1)
    craft.steps[0].explanations = [
      { ...explanation('White Wool', 0), query: 'w', matchedSpan: { start: 0, end: 1, text: 'W' } },
      { ...explanation('White Wool', 6), query: 'w', matchedSpan: { start: 6, end: 7, text: 'W' } },
    ]
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches: [craft], bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show why Regular craft: w' }))
    expect(screen.getAllByText('W', { selector: 'mark' })).toHaveLength(2)
    expect(screen.getAllByTitle(/line White Wool/)).toHaveLength(1)
  })

  test('shows a compact junk preview and target-only evidence after expansion', () => {
    const craft = search(['wn'], 1)
    craft.steps[0].junkItemIds = Array.from({ length: 5 }, () => 'minecraft:stick')
    craft.steps[0].explanations = [
      explanation('Brown Bed', 3),
      { ...explanation('Brown Stick', 3), visibleOutputItemId: 'minecraft:stick', visibleOutputName: 'Stick' },
    ]
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches: [craft], bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))
    const regularCategory = screen.getByRole('region', { name: 'Regular crafts' })
    const craftRow = within(regularCategory).getByRole('listitem', { name: 'Regular craft: wn' })
    expect(within(craftRow).getByLabelText('Junk preview: 3 of 5 items')).toBeTruthy()
    expect(within(craftRow).getByLabelText('2 more junk items')).toBeTruthy()

    fireEvent.click(within(craftRow).getByRole('button', { name: 'Show why Regular craft: wn' }))
    expect(within(craftRow).getByLabelText('Remaining junk: 2 items')).toBeTruthy()
    expect(within(craftRow).queryByLabelText('All matched items and junk')).toBeNull()
    expect(within(craftRow).getByTitle(/line Brown Bed/)).toBeTruthy()
    expect(within(craftRow).queryByTitle(/line Brown Stick/)).toBeNull()
  })

  test('summarizes a fully matched result collection instead of listing every member', () => {
    const bedIds = ['minecraft:black_bed', 'minecraft:blue_bed', 'minecraft:green_bed', 'minecraft:red_bed']
    const bedItems = new Map<string, SearchItem>([...items, ...bedIds.map((itemId): [string, SearchItem] => [itemId, {
      id: itemId,
      name: `${itemId.split(':')[1].split('_')[0].replace(/^./, (letter) => letter.toUpperCase())} Bed`,
      confidence: 'exact',
      searchLines: [],
    }])])
    const bedIcons = parseIconManifest({
      schema_version: 1,
      minecraft_version: '1.16.1',
      icon_width: 16,
      icon_height: 16,
      icons: Object.fromEntries(bedIds.map((itemId) => [itemId, `${itemId.slice('minecraft:'.length)}.png`])),
    })
    const bedCollection: RecipeResultCollection = {
      id: 'collection:beds', recipeBookCategory: 'crafting_building_blocks', recipeGroup: 'bed', recipeIds: [], outputItemIds: bedIds,
    }
    const craft = search(['be'], 1)
    craft.steps[0] = {
      ...craft.steps[0],
      coveredTargetIds: bedIds,
      explanations: bedIds.map((itemId) => ({
        ...explanation(`${bedItems.get(itemId)?.name}`, 0),
        query: 'be', collectionId: bedCollection.id, matchedMemberItemId: itemId, matchedMemberName: bedItems.get(itemId)!.name,
        visibleOutputItemId: itemId, visibleOutputName: bedItems.get(itemId)!.name, matchedSpan: { start: 0, end: 2, text: 'be' },
      })),
    }

    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches: [craft], bestScore: 1, visibleItemIds: [] } }} items={bedItems} icons={bedIcons} collections={new Map([[bedCollection.id, bedCollection]])} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show why Regular craft: be' }))
    expect(screen.getByLabelText('All beds')).toBeTruthy()
    expect(screen.getAllByRole('img', { name: /Bed/ })).toHaveLength(7)
    expect(screen.getByText('be', { selector: 'mark' })).toBeTruthy()
  })

  test('limits each expanded category to three crafts until its top-ten control is used', () => {
    const rankedSearches = Array.from({ length: 11 }, (_, index) => search([`q${index + 1}`], index + 1))
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches, bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))
    const regularCategory = screen.getByRole('region', { name: 'Regular crafts' })
    expect(within(regularCategory).getAllByRole('listitem', { name: /Regular craft:/ })).toHaveLength(3)
    fireEvent.click(within(regularCategory).getByRole('button', { name: 'Show top 10 regular crafts' }))
    expect(within(regularCategory).getAllByRole('listitem', { name: /Regular craft:/ })).toHaveLength(10)
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
