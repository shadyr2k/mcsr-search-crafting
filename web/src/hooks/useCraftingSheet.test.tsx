import { act, renderHook } from '@testing-library/react'
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
      bestScore: searches[0].totalScore,
      visibleItemIds: [],
    },
  }]])
}

afterEach(() => localStorage.clear())

describe('useCraftingSheet', () => {
  test('restores individual choices after reload, isolates languages, and resets the execution mode', () => {
    const itemSet = { ...entry('bed-anchor'), targetIds: ['bed', 'anchor'] }
    const searches = [search('a')]
    const bedQueries = [search('b'), search('bed', 1)]
    const anchorQueries = [search('aw')]
    const states = new Map(statesFor(itemSet.id, searches))
    const state = states.get(itemSet.id)!
    if (state.status !== 'ready' || state.outcome.kind !== 'ranked') throw new Error('Expected fixture')
    state.outcome.itemSearches = { bed: bedQueries, anchor: anchorQueries }
    const hook = renderHook(({ locale }) => useCraftingSheet(locale, [itemSet], states), { initialProps: { locale: 'en_us' } })
    act(() => hook.result.current.setCraftMode(itemSet.id, 'individual'))
    act(() => hook.result.current.selectItemCraft(itemSet.id, 'bed', craftingSheetCraftKey(bedQueries[1])))
    expect(hook.result.current.totalTypedCharacters).toBe(5)
    expect(hook.result.current.entries[0].itemChoices[0].scoreDelta).toBe(1)
    hook.rerender({ locale: 'de_de' })
    expect(hook.result.current.entries[0].mode).toBe('combined')
    hook.unmount()

    const reloaded = renderHook(() => useCraftingSheet('en_us', [itemSet], states))
    expect(reloaded.result.current.entries[0].queryLabel).toBe('bed (Shift+Home) aw')
    act(() => reloaded.result.current.setEntryDisabled(itemSet.id, true))
    expect(reloaded.result.current.totalTypedCharacters).toBe(0)
    act(() => reloaded.result.current.reset())
    expect(reloaded.result.current.entries[0]).toMatchObject({ mode: 'combined', disabled: false })
    expect(reloaded.result.current.totalTypedCharacters).toBe(1)
  })

  test('keeps selections and disabled rows separate for each language and resets one language to its calculated default', () => {
    const itemSet = entry('tools')
    const searches = [search('a'), search('zq', 1)]
    const states = statesFor(itemSet.id, searches)
    const hook = renderHook(({ locale }) => useCraftingSheet(locale, [itemSet], states), {
      initialProps: { locale: 'en_us' },
    })

    act(() => hook.result.current.selectCraft(itemSet.id, craftingSheetCraftKey(searches[1])))
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
      schemaVersion: 1,
      selectionsByLocale: {
        de_de: { tools: { disabled: true } },
      },
    })
  })
})
