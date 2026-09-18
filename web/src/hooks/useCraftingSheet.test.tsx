import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import type { RankedSearch, RowOptimizationState, TargetWorkspaceEntry } from '../domain/types'
import { craftingSheetCraftKey } from '../engine/craftingSheet'
import { useCraftingSheet } from './useCraftingSheet'

function entry(id: string): TargetWorkspaceEntry {
  return {
    id,
    targetIds: [`minecraft:${id}`],
    inventoryItemIds: [],
    enabled: true,
    gridSize: 3,
    order: 0,
  }
}

function search(query: string, score = 0): RankedSearch {
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
      score: { typingPenalty: 0, junkPresencePenalty: 0, junkCountPenalty: 0, total: score },
    }],
    coveredTargetIds: [],
    totalJunkAppearances: 0,
    totalTypedCharacters: query.length,
    totalScore: score,
  }
}

function statesFor(entryId: string, searches: RankedSearch[]): ReadonlyMap<string, RowOptimizationState> {
  return new Map<string, RowOptimizationState>([[entryId, {
    status: 'ready',
    fingerprint: entryId,
    outcome: {
      kind: 'ranked',
      entryId,
      rankedSearches: searches,
      itemSearches: { [`minecraft:${entryId}`]: searches },
      bestScore: searches[0].totalScore,
      visibleItemIds: [],
    },
  }]])
}

afterEach(() => localStorage.clear())

describe('useCraftingSheet', () => {
  test('keeps other queries fixed on edit, restores choices after reload, and resets to the suggested sequence', () => {
    const itemSet = { ...entry('bed-anchor'), targetIds: ['bed', 'anchor'] }
    const searches = [search('a')]
    searches[0].steps[0].newTargetIds = ['bed', 'anchor']
    searches[0].steps[0].coveredTargetIds = ['bed', 'anchor']
    const bedQueries = [search('b'), search('bed', 1), searches[0]]
    const anchorQueries = [search('aw'), searches[0]]
    const states = new Map(statesFor(itemSet.id, searches))
    const state = states.get(itemSet.id)!
    if (state.status !== 'ready' || state.outcome.kind !== 'ranked') throw new Error('Expected fixture')
    state.outcome.itemSearches = { bed: bedQueries, anchor: anchorQueries }
    const hook = renderHook(({ locale }) => useCraftingSheet(locale, [itemSet], states), { initialProps: { locale: 'en_us' } })
    act(() => hook.result.current.selectItemCraft(itemSet.id, 'bed', craftingSheetCraftKey(bedQueries[1])))
    expect(hook.result.current.entries[0].queryLabel).toBe('bed (Shift+Home) a')
    act(() => hook.result.current.selectItemCraft(itemSet.id, 'anchor', craftingSheetCraftKey(anchorQueries[0])))
    expect(hook.result.current.totalTypedCharacters).toBe(5)
    expect(hook.result.current.entries[0].itemChoices[0].scoreDelta).toBe(1)
    act(() => hook.result.current.moveItemCraft(itemSet.id, 'anchor', -1))
    expect(hook.result.current.entries[0].queryLabel).toBe('aw (Shift+Home) bed')
    act(() => hook.result.current.moveItemCraft(itemSet.id, 'anchor', -1))
    expect(hook.result.current.entries[0].itemIds).toEqual(['anchor', 'bed'])
    hook.rerender({ locale: 'de_de' })
    expect(hook.result.current.entries[0].queryLabel).toBe('a')
    hook.unmount()

    const reloaded = renderHook(() => useCraftingSheet('en_us', [itemSet], states))
    expect(reloaded.result.current.entries[0].queryLabel).toBe('aw (Shift+Home) bed')
    act(() => reloaded.result.current.setEntryDisabled(itemSet.id, true))
    expect(reloaded.result.current.totalTypedCharacters).toBe(0)
    act(() => reloaded.result.current.reset())
    expect(reloaded.result.current.entries[0]).toMatchObject({ disabled: false })
    expect(reloaded.result.current.entries[0].itemChoices.map((choice) => choice.itemId)).toEqual(['bed', 'anchor'])
    expect(reloaded.result.current.totalTypedCharacters).toBe(1)
  })

  test('keeps selections and disabled rows separate for each language and resets one language to its calculated default', () => {
    const itemSet = entry('tools')
    const searches = [search('a'), search('zq', 1)]
    const states = statesFor(itemSet.id, searches)
    const hook = renderHook(({ locale }) => useCraftingSheet(locale, [itemSet], states), {
      initialProps: { locale: 'en_us' },
    })

    act(() => hook.result.current.selectItemCraft(itemSet.id, itemSet.targetIds[0], craftingSheetCraftKey(searches[1])))
    expect(hook.result.current.characterSet).toEqual(['q', 'z'])

    hook.rerender({ locale: 'de_de' })
    expect(hook.result.current.characterSet).toEqual(['a'])
    act(() => hook.result.current.setEntryDisabled(itemSet.id, true))
    expect(hook.result.current.characterSet).toEqual([])

    hook.rerender({ locale: 'en_us' })
    expect(hook.result.current.characterSet).toEqual(['q', 'z'])
    act(() => hook.result.current.reset())
    expect(hook.result.current.characterSet).toEqual(['a'])
    expect(JSON.parse(localStorage.getItem('mcsr.crafting-sheet.v1') ?? '{}')).toEqual({
      schemaVersion: 2,
      selectionsByLocale: {
        de_de: { tools: { disabled: true, entryFingerprint: expect.any(String) } },
      },
    })
  })

  test('keeps saved choices for untouched item sets and drops them after an item set changes or is removed', async () => {
    const itemSet = entry('tools')
    const searches = [search('a'), search('zq', 1)]
    const states = statesFor(itemSet.id, searches)
    const hook = renderHook(({ locale, itemSets }) => useCraftingSheet(locale, itemSets, states), {
      initialProps: { locale: 'en_us', itemSets: [itemSet] as TargetWorkspaceEntry[] },
    })

    act(() => hook.result.current.selectItemCraft(itemSet.id, itemSet.targetIds[0], craftingSheetCraftKey(searches[1])))
    expect(hook.result.current.entries[0].queryLabel).toBe('zq')
    expect(JSON.parse(localStorage.getItem('mcsr.crafting-sheet.v1') ?? '{}')).toMatchObject({
      schemaVersion: 2,
      selectionsByLocale: { en_us: { tools: { entryFingerprint: expect.any(String) } } },
    })

    hook.rerender({ locale: 'de_de', itemSets: [itemSet] })
    act(() => hook.result.current.selectItemCraft(itemSet.id, itemSet.targetIds[0], craftingSheetCraftKey(searches[1])))

    hook.rerender({ locale: 'en_us', itemSets: [{ ...itemSet, gridSize: 2 }] })
    await waitFor(() => expect(hook.result.current.entries[0].queryLabel).toBe('a'))
    expect(JSON.parse(localStorage.getItem('mcsr.crafting-sheet.v1') ?? '{}')).toEqual({
      schemaVersion: 2,
      selectionsByLocale: {},
    })

    act(() => hook.result.current.selectItemCraft(itemSet.id, itemSet.targetIds[0], craftingSheetCraftKey(searches[1])))
    hook.rerender({ locale: 'en_us', itemSets: [] })
    await waitFor(() => expect(hook.result.current.entries).toEqual([]))
    expect(JSON.parse(localStorage.getItem('mcsr.crafting-sheet.v1') ?? '{}')).toEqual({
      schemaVersion: 2,
      selectionsByLocale: {},
    })
  })
})
