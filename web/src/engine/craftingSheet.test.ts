import { describe, expect, test } from 'vitest'

import type { RankedSearch, RowOptimizationState, TargetWorkspaceEntry } from '../domain/types'
import { craftingSheetCraftKey, createCraftingSheetModel } from './craftingSheet'

const choiceId = craftingSheetCraftKey

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
  test('seeds the unified editor from the selected shared craft and counts its junk once', () => {
    const itemSet = { ...entry('tools', 0), targetIds: ['helmet', 'pickaxe'] }
    const shared = search('gold', 4.5)
    shared.coveredTargetIds = [...itemSet.targetIds]
    shared.steps[0] = { ...shared.steps[0], coveredTargetIds: [...itemSet.targetIds], newTargetIds: [...itemSet.targetIds], junkItemIds: ['junk'] }
    shared.totalJunkAppearances = 1
    const state = ready(itemSet.id, [shared])
    const states = new Map([[itemSet.id, { ...state, outcome: { ...state.outcome, itemSearches: {
      helmet: [search('lea'), shared], pickaxe: [search('lab'), shared],
    } } }]])
    const model = createCraftingSheetModel([itemSet], states)
    expect(model.entries[0].itemChoices.map((choice) => choice.options.find((option) => option.id === choice.selectedOptionId)?.label)).toEqual(['gold', 'gold'])
    expect(model.entries[0].selectedSearch).toMatchObject({ kind: 'single', queries: ['gold'], totalJunkAppearances: 1, totalTypedCharacters: 4, totalScore: 4.5 })
    expect(model.entries[0].selectedSearch?.steps[0].newTargetIds).toEqual(['helmet', 'pickaxe'])
    expect(model.entries[0].itemChoices[1].options.find((option) => option.id === choiceId(shared))).toMatchObject({ totalTypedCharacters: 0, junkCount: 0, totalScore: 0 })

    const edited = createCraftingSheetModel([itemSet], states, { tools: { itemCraftKeys: { helmet: choiceId(shared), pickaxe: choiceId(search('lab')) }, itemOrder: ['helmet', 'pickaxe'] } })
    expect(edited.entries[0].selectedSearch?.queries).toEqual(['gold', 'lab'])
    expect(edited.totalTypedCharacters).toBe(7)
    const legacyCombined = createCraftingSheetModel([itemSet], states, { tools: {
      mode: 'combined', craftKey: choiceId(shared), itemCraftKeys: { helmet: choiceId(search('lea')) }, itemOrder: ['pickaxe', 'helmet'],
    } })
    expect(legacyCombined.entries[0].queryLabel).toBe('gold')
    expect(legacyCombined.entries[0].itemIds).toEqual(['helmet', 'pickaxe'])
    const legacyIndividual = createCraftingSheetModel([itemSet], states, { tools: {
      mode: 'individual', itemCraftKeys: { helmet: choiceId(search('lea')), pickaxe: choiceId(search('lab')) },
    } })
    expect(legacyIndividual.entries[0].queryLabel).toBe('lea ←← ab')
  })

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

  test.each([
    ['lea', 'lab', 'l', 2, 'ab', 5],
    ['leap', 'labs', 'l', 3, 'abs', 7],
    ['leaps', 'labs', '', 5, 'labs', 9],
    ['leaps', 'labor', '', 5, 'labor', 10],
    ['lea', 'bed', '', 3, 'bed', 6],
    ['la', 'lab', 'la', 0, 'b', 3],
    ['lea', 'lea', 'lea', 0, '', 3],
  ])('reuses the prefix from %s to %s within the normal backspace limit', (from, to, prefix, backspaces, suffix, chars) => {
    const itemSet = { ...entry('tools', 0), targetIds: ['helmet', 'pickaxe'] }
    const state = ready(itemSet.id, [search('all')])
    const model = createCraftingSheetModel([itemSet], new Map([[itemSet.id, {
      ...state, outcome: { ...state.outcome, itemSearches: { helmet: [search(from)], pickaxe: [search(to)] } },
    }]]), { tools: { mode: 'individual' } })
    if (from === to) expect(model.entries[0].selectedSearch?.steps).toHaveLength(1)
    else expect(model.entries[0].selectedSearch?.steps[1]).toMatchObject({ retainedPrefix: prefix, freeBackspaceCount: backspaces, typedSuffix: suffix })
    expect(model.totalTypedCharacters).toBe(chars)
    expect(model.totalScore).toBe(Math.max(0, from.length - 2) + suffix.length)
    expect(model.entries[0].itemChoices[1].options[0].totalTypedCharacters).toBe(suffix.length)
  })

  test('restores the chosen item order, discards stale IDs, and appends new targets', () => {
    const itemSet = { ...entry('tools', 0), targetIds: ['helmet', 'pickaxe', 'new'] }
    const state = ready(itemSet.id, [search('all')])
    const model = createCraftingSheetModel([itemSet], new Map([[itemSet.id, {
      ...state, outcome: { ...state.outcome, itemSearches: { helmet: [search('lea')], pickaxe: [search('lab')], new: [search('bed')] } },
    }]]), { tools: { mode: 'individual', itemOrder: ['pickaxe', 'old', 'pickaxe', 'helmet'] } })
    expect(model.entries[0].itemChoices.map((choice) => choice.itemId)).toEqual(['pickaxe', 'helmet', 'new'])
    expect(model.entries[0].itemIds).toEqual(['pickaxe', 'helmet', 'new'])
    expect(model.entries[0].queryLabel).toBe('lab ←← ea (Shift+Home) bed')
    expect(itemSet.targetIds).toEqual(['helmet', 'pickaxe', 'new'])
  })
})
