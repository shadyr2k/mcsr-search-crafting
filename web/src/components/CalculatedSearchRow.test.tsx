import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { parseIconManifest } from '../data/iconManifest'
import type { RankedSearch, RecipeResultCollection, SearchItem, TargetWorkspaceEntry } from '../domain/types'
import type { CollectionMatchExplanation } from '../engine/search'
import { CalculatedSearchRow } from './CalculatedSearchRow'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

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
  test('does not render a search-crafts row for a disabled item set', () => {
    render(<CalculatedSearchRow entry={{ ...entry, enabled: false }} entryNumber={1} state={{ status: 'idle' }} items={items} icons={icons} />)

    expect(screen.queryByLabelText('Calculated searches for item set 1')).toBeNull()
  })

  test('shows two regular previews before an uncomplicated overlap and groups every craft category on expansion', () => {
    const nonShiftHomeOverlap = search(['ab', 'be'], 4, 'overlap')
    nonShiftHomeOverlap.steps[1] = { ...nonShiftHomeOverlap.steps[1], freeBackspaceCount: 1 }
    const rankedSearches = [
      search(['wn'], 1),
      search(['aw', 'be'], 2, 'overlap'),
      search(['re'], 3),
      nonShiftHomeOverlap,
    ]
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches, bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} />)

    expect(screen.getAllByRole('listitem', { name: 'Regular craft: wn' })).toHaveLength(1)
    expect(screen.getAllByRole('listitem', { name: 'Regular craft: re' })).toHaveLength(1)
    expect(screen.queryByRole('listitem', { name: 'Overlap craft: aw, Shift+Home, be' })).toBeNull()
    expect(screen.getByRole('listitem', { name: 'Overlap craft: ab, 1 backspace, be' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Regular crafts' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))

    const overlapCategory = screen.getByRole('region', { name: 'Overlap crafts' })
    expect(within(overlapCategory).getByRole('listitem', { name: 'Overlap craft: aw, Shift+Home, be' })).toBeTruthy()
    expect(within(overlapCategory).getByRole('listitem', { name: 'Overlap craft: ab, 1 backspace, be' })).toBeTruthy()
    expect(within(overlapCategory).getAllByRole('listitem')[0].getAttribute('aria-label')).toBe('Overlap craft: ab, 1 backspace, be')
    expect(within(overlapCategory).getByRole('img', { name: 'Shift' })).toBeTruthy()
    expect(within(overlapCategory).getByRole('img', { name: 'Home' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hide crafts for item set 1' }).getAttribute('aria-expanded')).toBe('true')
  })

  test('hides a longer regular craft with the same visible targets and junk', () => {
    const shorter = search(['lla'], 3)
    const longer = search([':lla'], 4)
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches: [longer, shorter], bestScore: 3, visibleItemIds: [] } }} items={items} icons={icons} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))
    const regularCategory = screen.getByRole('region', { name: 'Regular crafts' })
    expect(within(regularCategory).getByRole('listitem', { name: 'Regular craft: lla' })).toBeTruthy()
    expect(within(regularCategory).queryByRole('listitem', { name: 'Regular craft: :lla' })).toBeNull()
  })

  test('uses a junkless Shift+Home overlap when every ordinary-backspace overlap has junk', () => {
    const backspaceWithJunk = search(['junk', 'mask'], 1, 'overlap')
    const shiftHomeJunkless = search(['move', 'home'], 2, 'overlap')
    shiftHomeJunkless.steps[1] = { ...shiftHomeJunkless.steps[1], freeBackspaceCount: 4, junkItemIds: [] }
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches: [backspaceWithJunk, shiftHomeJunkless], bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} />)

    expect(screen.getAllByRole('listitem', { name: 'Overlap craft: move, Shift+Home, home' })[0]).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))
    const overlapCategory = screen.getByRole('region', { name: 'Overlap crafts' })
    expect(within(overlapCategory).getAllByRole('listitem', { name: /Overlap craft:/ })[0].getAttribute('aria-label')).toBe('Overlap craft: move, Shift+Home, home')
  })

  test('keeps a junkless ordinary-backspace overlap ahead of a junkless Shift+Home overlap', () => {
    const backspaceWithJunk = search(['junk', 'mask'], 1, 'overlap')
    const shiftHomeJunkless = search(['move', 'home'], 2, 'overlap')
    shiftHomeJunkless.steps[1] = { ...shiftHomeJunkless.steps[1], freeBackspaceCount: 4, junkItemIds: [] }
    const backspaceJunkless = search(['keep', 'key'], 3, 'overlap')
    backspaceJunkless.steps[1] = { ...backspaceJunkless.steps[1], freeBackspaceCount: 1, junkItemIds: [] }
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches: [backspaceWithJunk, shiftHomeJunkless, backspaceJunkless], bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} />)

    expect(screen.getAllByRole('listitem', { name: 'Overlap craft: keep, 1 backspace, key' })[0]).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))
    const overlapCategory = screen.getByRole('region', { name: 'Overlap crafts' })
    expect(within(overlapCategory).getAllByRole('listitem', { name: /Overlap craft:/ })[0].getAttribute('aria-label')).toBe('Overlap craft: keep, 1 backspace, key')
  })

  test('uses craft color classes instead of visible category badges and stars only junkless previews', () => {
    const first = search(['st'], 1)
    const second = search(['ic'], 2)
    const overlap = search(['ab', 'be'], 3, 'overlap')
    overlap.steps[1] = { ...overlap.steps[1], freeBackspaceCount: 1 }
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches: [first, second, overlap], bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} />)

    const previews = screen.getByLabelText('Craft previews for item set 1')
    expect(within(previews).getAllByRole('listitem')).toHaveLength(3)
    expect(within(previews).getAllByLabelText('Junkless craft')).toHaveLength(2)
    expect(within(previews).queryByText('Regular')).toBeNull()
    expect(within(previews).queryByText('Overlap')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))
    expect(within(screen.getByRole('region', { name: 'Regular crafts' })).getByRole('listitem', { name: 'Regular craft: st' }).classList.contains('craft-result--single-craft')).toBe(true)
    expect(within(screen.getByRole('region', { name: 'Overlap crafts' })).getByRole('listitem', { name: 'Overlap craft: ab, 1 backspace, be' }).classList.contains('craft-result--overlap-craft')).toBe(true)
    expect(screen.queryByRole('heading', { name: 'Regular crafts' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Overlap crafts' })).toBeNull()
    expect(screen.queryAllByLabelText('Junkless craft').filter((star) => star.closest('.craft-category') !== null)).toHaveLength(0)
  })

  test('renders a language lead and text-only query previews when requested', () => {
    const rankedSearches = [search(['bo'], 1), search(['ow'], 2), search(['wn'], 3)]
    render(<CalculatedSearchRow
      entry={entry}
      entryNumber={1}
      state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches, bestScore: 1, visibleItemIds: [] } }}
      items={items}
      icons={icons}
      summaryLabel="english crafts"
      summaryLead={<span>english - english (united states)</span>}
      hidePreviewDecorations
      className="calculated-search-row--craft-lookup"
    />)

    const row = screen.getByRole('region', { name: 'Calculated searches for english crafts' })
    expect(within(row).getByText('english - english (united states)')).toBeTruthy()
    expect(within(row).getByLabelText('Craft previews for english crafts')).toBeTruthy()
    expect(within(row).queryByLabelText('Targets for item set a')).toBeNull()
    expect(within(row).queryByLabelText('Junkless craft')).toBeNull()

    fireEvent.click(within(row).getByRole('button', { name: 'Show all crafts for english crafts' }))
    expect(within(row).getByRole('region', { name: 'Regular crafts' })).toBeTruthy()
  })

  test('uses only the matching junkless craft kind for a category preview', () => {
    const regular = [search(['aa'], 1), search(['bb'], 2), search(['cc'], 3), search(['dd'], 4)]
    const overlap = [search(['ow', 'wl'], 5, 'overlap')]
    overlap[0].totalJunkAppearances = 0
    overlap[0].steps = overlap[0].steps.map((step) => ({ ...step, junkItemIds: [] }))
    const outcome = { kind: 'ranked' as const, entryId: 'a', rankedSearches: [...regular, ...overlap], bestScore: 1, visibleItemIds: [] }

    const single = render(<CalculatedSearchRow
      entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome }} items={items} icons={icons}
      previewMode="junkless-single"
    />)
    const singlePreviews = screen.getByLabelText('Craft previews for item set 1')
    expect(within(singlePreviews).getAllByRole('listitem')).toHaveLength(3)
    expect(within(singlePreviews).queryByRole('listitem', { name: 'Overlap craft: ow, Shift+Home, wl' })).toBeNull()
    single.unmount()

    render(<CalculatedSearchRow
      entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome }} items={items} icons={icons}
      previewMode="junkless-overlap"
    />)
    const overlapPreviews = screen.getByLabelText('Craft previews for item set 1')
    expect(within(overlapPreviews).getAllByRole('listitem')).toHaveLength(1)
    expect(within(overlapPreviews).getByRole('listitem', { name: 'Overlap craft: ow, Shift+Home, wl' })).toBeTruthy()
    expect(within(overlapPreviews).queryByRole('listitem', { name: 'Regular craft: aa' })).toBeNull()
  })

  test('keeps craft disclosures mounted while collapsed so both directions can animate', () => {
    const craft = search(['bow'], 1)
    craft.steps[0] = { ...craft.steps[0], junkItemIds: ['minecraft:stick'] }
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches: [craft], bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} />)

    const rowToggle = screen.getByRole('button', { name: 'Show all crafts for item set 1' })
    const categoriesId = rowToggle.getAttribute('aria-controls')!
    fireEvent.click(rowToggle)
    const detailToggle = screen.getByRole('button', { name: 'Show why Regular craft: bow' })
    const detailId = detailToggle.getAttribute('aria-controls')!
    fireEvent.click(detailToggle)
    expect(document.getElementById(detailId)?.getAttribute('aria-hidden')).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: 'Hide why Regular craft: bow' }))
    expect(document.getElementById(detailId)?.getAttribute('aria-hidden')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Hide crafts for item set 1' }))
    const categories = document.getElementById(categoriesId)!
    expect(categories.getAttribute('aria-hidden')).toBe('true')
    expect(categories.classList.contains('craft-categories--closing')).toBe(true)
  })

  test('removes collapsed craft categories immediately when animations are disabled', () => {
    render(<CalculatedSearchRow
      entry={entry}
      entryNumber={1}
      state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches: [search(['bow'], 1)], bestScore: 1, visibleItemIds: [] } }}
      items={items}
      icons={icons}
      removeAnimations
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))
    expect(screen.getByRole('region', { name: 'Regular crafts' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hide crafts for item set 1' }))
    expect(screen.queryByRole('region', { name: 'Regular crafts' })).toBeNull()
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

  test('shows one overlap craft for reordered versions of the same query set', () => {
    const first = search(['aw', 'be'], 1, 'overlap')
    const reordered = search(['be', 'aw'], 2, 'overlap')
    first.steps[1] = { ...first.steps[1], freeBackspaceCount: 1 }
    reordered.steps[1] = { ...reordered.steps[1], freeBackspaceCount: 1 }
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches: [first, reordered], bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))
    expect(within(screen.getByRole('region', { name: 'Overlap crafts' })).getAllByRole('listitem', { name: /Overlap craft:/ })).toHaveLength(1)
  })

  test('keeps each overlap step and its full junk list together after expansion', () => {
    const overlap = search(['bo', 'st'], 1, 'overlap')
    overlap.steps[0] = {
      ...overlap.steps[0],
      coveredTargetIds: ['minecraft:bow'],
      newTargetIds: ['minecraft:bow'],
      junkItemIds: Array.from({ length: 4 }, () => 'minecraft:stick'),
    }
    overlap.steps[1] = {
      ...overlap.steps[1],
      coveredTargetIds: ['minecraft:stick'],
      newTargetIds: ['minecraft:stick'],
      junkItemIds: Array.from({ length: 5 }, () => 'minecraft:bow'),
    }
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches: [overlap], bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))
    const craftRow = within(screen.getByRole('region', { name: 'Overlap crafts' })).getByRole('listitem', { name: /Overlap craft: bo/ })
    expect(within(screen.getByLabelText('Search step 1')).getByLabelText('Junk preview: 3 of 4 items')).toBeTruthy()
    expect(within(screen.getByLabelText('Search step 2')).getByLabelText('Junk preview: 3 of 5 items')).toBeTruthy()

    fireEvent.click(within(craftRow).getByRole('button', { name: /Show why Overlap craft: bo/ }))
    expect(within(screen.getByLabelText('Search step 1')).getByLabelText('All junk for bo: 4 items')).toBeTruthy()
    expect(within(screen.getByLabelText('Search step 2')).getByLabelText('All junk for st: 5 items')).toBeTruthy()
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
    expect(within(craftRow).getByLabelText('All junk: 5 items')).toBeTruthy()
    expect(within(craftRow).queryByLabelText('All matched items and junk')).toBeNull()
    expect(within(craftRow).getByTitle(/line Brown Bed/)).toBeTruthy()
    expect(within(craftRow).queryByTitle(/line Brown Stick/)).toBeNull()
  })

  test('keeps compact item previews visible instead of dropping them at narrow widths', () => {
    const craft = search(['very long query', 'another long query', 'final query'], 1)
    craft.steps[0].junkItemIds = Array.from({ length: 5 }, () => 'minecraft:stick')
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches: [craft], bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))
    const craftRow = within(screen.getByRole('region', { name: 'Regular crafts' })).getByRole('listitem', { name: /Regular craft: very_long_query/ })

    expect(craftRow.classList.contains('craft-result--items-overflow')).toBe(false)
    expect(craftRow.querySelector('.craft-result__item-preview img')).toBeTruthy()
    fireEvent.click(within(craftRow).getByRole('button', { name: /Show why Regular craft: very_long_query/ }))
    expect(within(craftRow).getByLabelText('All junk: 5 items')).toBeTruthy()
  })

  test('cycles every matched member of a collection capture group instead of listing them separately', () => {
    vi.useFakeTimers()
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
      coveredTargetIds: [bedIds[0]],
      explanations: bedIds.slice(0, 3).map((itemId) => ({
        ...explanation(`${bedItems.get(itemId)?.name}`, 0),
        query: 'be', collectionId: bedCollection.id, matchedMemberItemId: itemId, matchedMemberName: bedItems.get(itemId)!.name,
        visibleOutputItemId: bedIds[0], visibleOutputName: bedItems.get(bedIds[0])!.name, matchedSpan: { start: 0, end: 2, text: 'be' },
      })),
    }

    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches: [craft], bestScore: 1, visibleItemIds: [] } }} items={bedItems} icons={bedIcons} collections={new Map([[bedCollection.id, bedCollection]])} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show why Regular craft: be' }))
    expect(screen.getByLabelText('Black Bed')).toBeTruthy()
    expect(screen.queryByText('all beds')).toBeNull()
    expect(screen.getAllByRole('img', { name: /Bed/ })).toHaveLength(2)
    expect(screen.getAllByRole('img', { name: 'Black Bed' })).toHaveLength(2)
    act(() => vi.advanceTimersByTime(800))
    expect(screen.getByLabelText('Blue Bed')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Blue Bed' })).toBeTruthy()
    expect(screen.getByText(/be/i, { selector: 'mark' })).toBeTruthy()
  })

  test('shows the matched attribute instead of an unhighlighted name for a single collection member', () => {
    const helmetCollection: RecipeResultCollection = {
      id: 'collection:helmet', recipeBookCategory: 'crafting_equipment', recipeGroup: null, recipeIds: [], outputItemIds: ['minecraft:bow'],
    }
    const craft = search(['rmat'], 1)
    craft.steps[0] = {
      ...craft.steps[0],
      explanations: [{
        ...explanation('+2 Armatura', 4),
        query: 'rmat', collectionId: helmetCollection.id, source: 'attribute', line: '+2 Armatura', matchedSpan: { start: 4, end: 8, text: 'rmat' },
      }],
    }
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches: [craft], bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} collections={new Map([[helmetCollection.id, helmetCollection]])} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show why Regular craft: rmat' }))
    expect(screen.getByText((_, element) => element?.textContent === '+2 Armatura')).toBeTruthy()
    expect(screen.getByText('rmat', { selector: 'mark' })).toBeTruthy()
  })

  test('limits each expanded category to three crafts until its top-ten control is used', () => {
    const rankedSearches = Array.from({ length: 11 }, (_, index) => search([`q${index + 1}`], index + 1))
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches, bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))
    const regularCategory = screen.getByRole('region', { name: 'Regular crafts' })
    expect(within(regularCategory).getAllByRole('listitem', { name: /Regular craft:/ })).toHaveLength(3)
    fireEvent.click(within(regularCategory).getByRole('button', { name: 'Show more regular crafts' }))
    expect(within(regularCategory).getAllByRole('listitem', { name: /Regular craft:/ })).toHaveLength(10)
  })

  test('switches between junkless and other overlap crafts with independent top-ten controls', () => {
    const junkless = Array.from({ length: 4 }, (_, index) => {
      const craft = search([`clean${index}`], index + 1, 'overlap')
      craft.steps[0].junkItemIds = []
      return craft
    })
    const other = Array.from({ length: 4 }, (_, index) => search([`other${index}`], index + 5, 'overlap'))
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches: [search(['regular'], 0), ...junkless, ...other], bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))
    expect(screen.getByRole('heading', { name: 'regular crafts' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'overlap crafts' })).toBeTruthy()
    const overlapCategory = screen.getByRole('region', { name: 'Overlap crafts' })
    expect(within(overlapCategory).getAllByRole('listitem', { name: /Overlap craft:/ })).toHaveLength(3)
    expect(within(overlapCategory).getByRole('button', { name: 'junkless' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(within(overlapCategory).getByRole('button', { name: 'Show more overlap crafts' }))
    expect(within(overlapCategory).getAllByRole('listitem', { name: /Overlap craft:/ })).toHaveLength(4)
    fireEvent.click(within(overlapCategory).getByRole('button', { name: 'other' }))
    expect(within(overlapCategory).getAllByRole('listitem', { name: /Overlap craft:/ })).toHaveLength(3)
    expect(within(overlapCategory).getByRole('button', { name: 'other' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(within(overlapCategory).getByRole('button', { name: 'Show more overlap crafts' }))
    expect(within(overlapCategory).getAllByRole('listitem', { name: /Overlap craft:/ })).toHaveLength(4)
    fireEvent.click(within(overlapCategory).getByRole('button', { name: 'junkless' }))
    expect(within(overlapCategory).getAllByRole('listitem', { name: /Overlap craft:/ })).toHaveLength(4)
  })

  test('keeps a mixed overlap sequence in other when a subset craft is junkless', () => {
    const junkless = search(['r', 'ra', 'rc'], 1, 'overlap')
    junkless.totalJunkAppearances = 0
    junkless.steps = junkless.steps.map((step) => ({ ...step, junkItemIds: [] }))
    // The first two steps are clean, including a regular subset craft. The
    // finished sequence belongs in other because its final step has junk.
    const mixed = search(['r', 'rb', 'rc'], 2, 'overlap')
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches: [junkless, mixed], bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))
    const overlapCategory = screen.getByRole('region', { name: 'Overlap crafts' })
    fireEvent.click(within(overlapCategory).getByRole('button', { name: 'other' }))

    const mixedRow = within(overlapCategory).getByRole('listitem', { name: 'Overlap craft: r, Shift+Home, rb, Shift+Home, rc' })
    expect(mixedRow.querySelectorAll('.craft-result__step')).toHaveLength(3)
    expect(mixedRow.querySelectorAll('.craft-result__step .craft-result__junk')).toHaveLength(1)
    expect(within(overlapCategory).queryByRole('listitem', { name: 'Overlap craft: r, Shift+Home, ra, Shift+Home, rc' })).toBeNull()
  })

  test('switches between junkless and other regular crafts with independent top-ten controls', () => {
    const junkless = Array.from({ length: 4 }, (_, index) => search([`clean${index}`], index + 1))
    const other = Array.from({ length: 4 }, (_, index) => {
      const craft = search([`other${index}`], index + 5)
      craft.steps[0].junkItemIds = ['minecraft:stick']
      return craft
    })
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches: [...junkless, ...other], bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))
    const regularCategory = screen.getByRole('region', { name: 'Regular crafts' })
    expect(within(regularCategory).getAllByRole('listitem', { name: /Regular craft:/ })).toHaveLength(3)
    expect(within(regularCategory).getByRole('button', { name: 'junkless' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(within(regularCategory).getByRole('button', { name: 'Show more regular crafts' }))
    expect(within(regularCategory).getAllByRole('listitem', { name: /Regular craft:/ })).toHaveLength(4)
    fireEvent.click(within(regularCategory).getByRole('button', { name: 'other' }))
    expect(within(regularCategory).getAllByRole('listitem', { name: /Regular craft:/ })).toHaveLength(3)
    expect(within(regularCategory).getByRole('button', { name: 'other' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(within(regularCategory).getByRole('button', { name: 'Show more regular crafts' }))
    expect(within(regularCategory).getAllByRole('listitem', { name: /Regular craft:/ })).toHaveLength(4)
    fireEvent.click(within(regularCategory).getByRole('button', { name: 'junkless' }))
    expect(within(regularCategory).getAllByRole('listitem', { name: /Regular craft:/ })).toHaveLength(4)
  })

  test('can hide digit-containing regular and overlap crafts for one item set', () => {
    const numericOverlap = search(['+8', 'axe'], 3, 'overlap')
    numericOverlap.steps[1] = { ...numericOverlap.steps[1], freeBackspaceCount: 1 }
    const textOverlap = search(['stone', 'axe'], 4, 'overlap')
    textOverlap.steps[1] = { ...textOverlap.steps[1], freeBackspaceCount: 1 }
    const rankedSearches = [search(['3'], 1), search(['sword'], 2), numericOverlap, textOverlap]
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches, bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))
    const filter = screen.getByRole('group', { name: 'Number craft filter' })
    const regularCategory = screen.getByRole('region', { name: 'Regular crafts' })
    const overlapCategory = screen.getByRole('region', { name: 'Overlap crafts' })
    expect(within(filter).getByRole('button', { name: 'show' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(regularCategory).getByRole('listitem', { name: 'Regular craft: 3' })).toBeTruthy()
    expect(within(overlapCategory).getByRole('listitem', { name: 'Overlap craft: +8, 1 backspace, axe' })).toBeTruthy()

    fireEvent.click(within(filter).getByRole('button', { name: 'hide' }))

    expect(within(regularCategory).queryByRole('listitem', { name: 'Regular craft: 3' })).toBeNull()
    expect(within(overlapCategory).queryByRole('listitem', { name: 'Overlap craft: +8, 1 backspace, axe' })).toBeNull()
    expect(within(regularCategory).getByRole('listitem', { name: 'Regular craft: sword' })).toBeTruthy()
    expect(within(overlapCategory).getByRole('listitem', { name: 'Overlap craft: stone, 1 backspace, axe' })).toBeTruthy()
    expect(within(filter).getByRole('button', { name: 'hide' }).getAttribute('aria-pressed')).toBe('true')
  })

  test('starts with digit-containing crafts hidden when configured', () => {
    const numeric = search(['3'], 1)
    const text = search(['sword'], 2)
    render(<CalculatedSearchRow
      entry={entry}
      entryNumber={1}
      state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches: [numeric, text], bestScore: 1, visibleItemIds: [] } }}
      items={items}
      icons={icons}
      hideNumberCraftsByDefault
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))
    const filter = screen.getByRole('group', { name: 'Number craft filter' })
    const regularCategory = screen.getByRole('region', { name: 'Regular crafts' })
    expect(within(filter).getByRole('button', { name: 'hide' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(regularCategory).queryByRole('listitem', { name: 'Regular craft: 3' })).toBeNull()
    expect(within(regularCategory).getByRole('listitem', { name: 'Regular craft: sword' })).toBeTruthy()
  })

  test('uses two previews from a category when the other category has no crafts', () => {
    const rankedSearches = [
      search(['aw', 'be'], 1, 'overlap'),
      search(['an', 'be'], 2, 'overlap'),
      search(['ab', 'be'], 3, 'overlap'),
    ]
    rankedSearches.forEach((rankedSearch) => {
      rankedSearch.steps[1] = { ...rankedSearch.steps[1], freeBackspaceCount: 1 }
    })
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches, bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} />)

    expect(screen.getAllByRole('listitem', { name: /Overlap craft:/ })).toHaveLength(2)
    const summary = screen.getByLabelText('Craft previews for item set 1').closest('.calculated-search-row__summary')
    expect(summary?.classList.contains('calculated-search-row__summary--only-overlap')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Show all crafts for item set 1' }))
    expect(screen.getByRole('region', { name: 'Overlap crafts' }).parentElement?.classList.contains('craft-categories__content--single-category')).toBe(true)
  })

  test('uses a third regular preview when no suitable overlap craft is available', () => {
    const rankedSearches = [
      search(['one'], 1),
      search(['two'], 2),
      search(['three'], 3),
    ]
    render(<CalculatedSearchRow entry={entry} entryNumber={1} state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches, bestScore: 1, visibleItemIds: [] } }} items={items} icons={icons} />)

    const previews = screen.getByLabelText('Craft previews for item set 1')
    expect(within(previews).getAllByRole('listitem', { name: /Regular craft:/ })).toHaveLength(3)
    expect(within(previews).getByRole('listitem', { name: 'Regular craft: three' })).toBeTruthy()
  })

  test('uses text keycaps for Shift+Home and backspace when requested', () => {
    const overlap = search(['first', 'second', 'third'], 1, 'overlap')
    overlap.steps[1] = { ...overlap.steps[1], retainedPrefix: 'f', freeBackspaceCount: 1, typedSuffix: 'second' }
    overlap.steps[2] = { ...overlap.steps[2], retainedPrefix: '', freeBackspaceCount: 6, typedSuffix: 'third' }
    render(<CalculatedSearchRow
      entry={entry}
      entryNumber={1}
      state={{ status: 'ready', fingerprint: 'x', outcome: { kind: 'ranked', entryId: 'a', rankedSearches: [overlap], bestScore: 1, visibleItemIds: [] } }}
      items={items}
      icons={icons}
      textControlKeycaps
    />)

    expect(document.querySelectorAll('.query-control-keycap')).toHaveLength(2)
    expect(screen.getByText('SH')).toBeTruthy()
    expect(screen.getByText('←')).toBeTruthy()
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
