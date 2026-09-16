import { describe, expect, test } from 'vitest'

import type { RankedSearch, RowOptimizationState, TargetWorkspaceEntry } from '../domain/types'
import { craftingSheetCraftKey, createCraftingSheetModel } from './craftingSheet'

function entry(id: string, order: number): TargetWorkspaceEntry {
  return {
    id,
    targetIds: [`minecraft:${id}`],
    inventoryItemIds: [],
    enabled: true,
    gridSize: 3,
    order,
  }
}

function search(query: string, totalScore = 0): RankedSearch {
  return {
    kind: 'single',
    queries: [query],
    steps: [{
      query,
      retainedPrefix: '',
      freeBackspaceCount: 0,
      typedSuffix: query,
      coveredTargetIds: [],
      newTargetIds: [],
      junkItemIds: [],
      explanations: [],
      score: { typingPenalty: 0, junkPresencePenalty: 0, junkCountPenalty: 0, total: totalScore },
    }],
    coveredTargetIds: [],
    totalJunkAppearances: 0,
    totalTypedCharacters: query.length,
    totalScore,
  }
}

function ready(entryId: string, searches: RankedSearch[]) {
  return {
    status: 'ready' as const,
    fingerprint: entryId,
    outcome: {
      kind: 'ranked' as const,
      entryId,
      rankedSearches: searches,
      bestScore: searches[0]?.totalScore ?? 0,
      visibleItemIds: [],
    },
  }
}

describe('crafting sheet model', () => {
  test('counts the characters in the displayed execution including full replacements', () => {
    const itemSet = entry('first', 0)
    const replacement = search('abcd')
    replacement.kind = 'overlap'
    replacement.queries = ['abcd', 'ab']
    replacement.steps.push({ ...search('ab').steps[0], freeBackspaceCount: 4 })
    // Optimizer costs can retain a theoretical prefix; the sheet counts what is actually typed.
    replacement.totalTypedCharacters = 4
    const model = createCraftingSheetModel([itemSet], new Map([[itemSet.id, ready(itemSet.id, [replacement])]]))
    expect(model.totalTypedCharacters).toBe(6)
    expect(model.entries[0].selectedSearch?.totalTypedCharacters).toBe(6)
  })

  test('jointly chooses equal-score crafts with the smallest shared character set while exposing every calculated option', () => {
    const first = entry('first', 0)
    const second = entry('second', 1)
    const firstAlternatives = [search('a'), search('k')]
    const secondAlternatives = [search('b'), search('k')]
    const model = createCraftingSheetModel([first, second], new Map([
      [first.id, ready(first.id, firstAlternatives)],
      [second.id, ready(second.id, secondAlternatives)],
    ]))

    expect(model.entries.map((sheetEntry) => sheetEntry.queryLabel)).toEqual(['k', 'k'])
    expect(model.entries.map((sheetEntry) => sheetEntry.options.map((option) => option.label))).toEqual([['a', 'k'], ['b', 'k']])
    expect(model.characterSet).toEqual(['k'])
    expect(model.characterUsages).toEqual([expect.objectContaining({
      character: 'k',
      craftCount: 2,
      entryIds: ['first', 'second'],
    })])
  })

  test('honors a manual non-optimal craft selection and excludes disabled rows from character counts', () => {
    const first = entry('first', 0)
    const second = entry('second', 1)
    const firstAlternatives = [search('k'), search('zq', 1)]
    const secondAlternatives = [search('k')]
    const model = createCraftingSheetModel([first, second], new Map([
      [first.id, ready(first.id, firstAlternatives)],
      [second.id, ready(second.id, secondAlternatives)],
    ]), {
      first: { craftKey: craftingSheetCraftKey(firstAlternatives[1]) },
      second: { disabled: true },
    })

    expect(model.entries[0]).toMatchObject({
      selectedOptionId: craftingSheetCraftKey(firstAlternatives[1]),
      queryLabel: 'zq',
      defaultOptionId: craftingSheetCraftKey(firstAlternatives[0]),
    })
    expect(model.entries[0].options.find((option) => option.label === 'zq')).toMatchObject({ isOptimal: false })
    expect(model.entries[1].disabled).toBe(true)
    expect(model.disabledEntries.map((sheetEntry) => sheetEntry.id)).toEqual(['second'])
    expect(model.characterSet).toEqual(['q', 'z'])
    expect(model.characterUsages.map(({ character, craftCount }) => ({ character, craftCount }))).toEqual([
      { character: 'q', craftCount: 1 },
      { character: 'z', craftCount: 1 },
    ])
  })

  test('uses a manual craft as a fixed seed when choosing the remaining optimal rows', () => {
    const first = entry('first', 0)
    const second = entry('second', 1)
    const firstAlternatives = [search('a'), search('b')]
    const secondAlternatives = [search('a'), search('b')]
    const model = createCraftingSheetModel([first, second], new Map([
      [first.id, ready(first.id, firstAlternatives)],
      [second.id, ready(second.id, secondAlternatives)],
    ]), {
      first: { craftKey: craftingSheetCraftKey(firstAlternatives[1]) },
    })

    expect(model.entries.map((sheetEntry) => sheetEntry.queryLabel)).toEqual(['b', 'b'])
    expect(model.entries[1].defaultOptionId).toBe(craftingSheetCraftKey(secondAlternatives[0]))
    expect(model.characterSet).toEqual(['b'])
  })

  test('falls back to a newly calculated default when a saved craft no longer exists and reports pending calculations', () => {
    const first = entry('first', 0)
    const pending = entry('pending', 1)
    const alternatives = [search('a')]
    const states: ReadonlyMap<string, RowOptimizationState> = new Map<string, RowOptimizationState>([
      [first.id, ready(first.id, alternatives)],
      [pending.id, { status: 'pending', fingerprint: 'pending' }],
    ])
    const model = createCraftingSheetModel([first, pending], states, { first: { craftKey: 'old-craft' } })

    expect(model.entries).toHaveLength(2)
    expect(model.entries[1].status).toBe('pending')
    expect(model.entries[0].selectedOptionId).toBe(craftingSheetCraftKey(alternatives[0]))
    expect(model.isCalculating).toBe(true)
  })

  test('composes individual crafts in item order with full replacement typing and recalculates totals', () => {
    const itemSet = { ...entry('bed-anchor', 0), targetIds: ['bed', 'anchor'] }
    const bed = search('bed', 1)
    const anchor = search('aw')
    const state = ready(itemSet.id, [search('aw', 2)])
    const model = createCraftingSheetModel([itemSet], new Map([[itemSet.id, {
      ...state,
      outcome: { ...state.outcome, itemSearches: { bed: [bed], anchor: [anchor] } },
    }]]), { [itemSet.id]: { mode: 'individual' } })

    expect(model.entries[0].selectedSearch).toMatchObject({
      queries: ['bed', 'aw'], totalTypedCharacters: 5, totalScore: 3,
      steps: [{ typedSuffix: 'bed' }, { retainedPrefix: '', freeBackspaceCount: 3, typedSuffix: 'aw' }],
    })
    expect(model.entries[0].queryLabel).toBe('bed (Shift+Home) aw')
    expect(model.entries[0].scoreDelta).toBe(1)
    expect(model.totalTypedCharacters).toBe(5)
    expect(model.characterSet).toEqual(['a', 'b', 'd', 'e', 'w'])
  })

  test('offers choices beyond ten while enforcing per-query character and result limits', () => {
    const itemSet = entry('first', 0)
    const tooMuchJunk = search('junk')
    tooMuchJunk.steps[0].junkItemIds = Array.from({ length: 40 }, (_, index) => `junk:${index}`)
    const searches = [...Array.from({ length: 12 }, (_, index) => search(`q${index}`, index)), search('abcdef', 20), tooMuchJunk]
    const model = createCraftingSheetModel([itemSet], new Map([[itemSet.id, ready(itemSet.id, searches)]]))
    expect(model.entries[0].options).toHaveLength(12)
    expect(model.entries[0].options[11]).toMatchObject({ label: 'q11', scoreDelta: 11 })
  })
})
