import { afterEach, describe, expect, test, vi } from 'vitest'

import type { RankedSearch } from '../domain/types'
import { matchingCraftQuerySearches } from './craftQuerySuggestions'

function craft(query: string): RankedSearch {
  return {
    kind: 'single',
    queries: [query],
    steps: [],
    coveredTargetIds: [],
    totalJunkAppearances: 0,
    totalTypedCharacters: query.length,
    totalScore: 0,
  }
}

const match = (searches: readonly RankedSearch[], query: string) => matchingCraftQuerySearches(searches, query, new AbortController().signal)

afterEach(() => vi.useRealTimers())

describe('matchingCraftQuerySearches', () => {
  test('preserves ranked order and matches aliases only within the first original character', async () => {
    const searches = ['æb', 'éx', 'bread', 'Éb', 'ae'].map(craft)
    expect(await match(searches, 'E')).toEqual([searches[0], searches[1], searches[3]])
    expect(await match(searches, 'eb')).toEqual([searches[0], searches[3]])
    expect(await match(searches, 'b')).toEqual([searches[2]])
  })

  test('normalizes manual spaces and returns no matches for an empty query', async () => {
    const searches = [' a', 'ab', ':oak_pl'].map(craft)
    expect(await match(searches, '_')).toEqual([searches[0]])
    expect(await match(searches, ':oak_')).toEqual([searches[2]])
    expect(await match(searches, '')).toEqual([])
  })

  test('does not lose later matches when narrowing a truncated prefix', async () => {
    const searches = [...Array.from({ length: 60 }, (_, index) => craft(`aa${index}`)), craft('az')]
    expect(await match(searches, 'a')).toEqual(searches.slice(0, 48))
    expect(await match(searches, 'az')).toEqual([searches[60]])
  })

  test('narrows completed prefix results while retaining aliases and ranked order', async () => {
    const searches = ['æb', 'éx', 'eb', 'ab', 'ef'].map(craft)
    expect(await match(searches, 'e')).toEqual([searches[0], searches[1], searches[2], searches[4]])
    expect(await match(searches, 'eb')).toEqual([searches[0], searches[2]])
    expect(await match(searches, 'e')).toHaveLength(4)
  })

  test('keeps cached results separate for different ranked source arrays', async () => {
    const first = [craft('aa')]
    const second = [craft('ab')]
    expect(await match(first, 'a')).toEqual(first)
    expect(await match(second, 'a')).toEqual(second)
    expect(await match(second, 'ab')).toEqual(second)
    expect(await match(first, 'ab')).toEqual([])
  })

  test('rejects a request that was already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(matchingCraftQuerySearches([craft('aa')], 'a', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })

  test('yields during a large scan and cancels pending work for an obsolete input', async () => {
    vi.useFakeTimers()
    const searches = [...Array.from({ length: 1500 }, () => craft('aa')), craft('az')]
    const controller = new AbortController()
    const pending = matchingCraftQuerySearches(searches, 'az', controller.signal)
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(vi.getTimerCount()).toBe(1)
    controller.abort()
    await rejection
    expect(vi.getTimerCount()).toBe(0)

    const next = match(searches, 'az')
    await vi.runAllTimersAsync()
    expect(await next).toEqual([searches[1500]])
  })
})
