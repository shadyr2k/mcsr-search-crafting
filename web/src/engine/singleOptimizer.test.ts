import { describe, expect, test } from 'vitest'

import type { SearchItem } from '../domain/types'
import { optimizeSingle, type OptimizeInput } from './singleOptimizer'

function item(id: string, text: string): SearchItem {
  return {
    id,
    name: id,
    confidence: 'source_reproduced',
    searchLines: [{ source: 'name', text }],
  }
}

function fixture(): OptimizeInput {
  const targets = [
    item('minecraft:iron_sword', 'Sword 4 z ab cd ef İx 1'),
    item('minecraft:diamond_sword', 'Sword 4 z ab cd ef İx 2'),
  ]
  const sharedJunk = item('minecraft:shared_junk', 'Axe 4')
  const secondJunk = item('minecraft:second_junk', 'Pick 4')

  return {
    targetIds: new Set(targets.map(({ id }) => id)),
    // The recipe layer has already collapsed two recipes for shared_junk into one visible output.
    visibleItemIds: new Set([...targets, sharedJunk, secondJunk].map(({ id }) => id)),
    items: new Map([...targets, sharedJunk, secondJunk].map((searchItem) => [searchItem.id, searchItem])),
  }
}

function resultIndex(results: ReturnType<typeof optimizeSingle>, query: string): number {
  const index = results.findIndex((result) => result.query === query)
  expect(index).toBeGreaterThanOrEqual(0)
  return index
}

describe('optimizeSingle', () => {
  test('keeps only complete queries and reports distinct visible junk with match explanations', () => {
    const results = optimizeSingle(fixture())
    const dirty = results.find((result) => result.query === '4')

    expect(dirty).toMatchObject({
      query: '4',
      coveredTargetIds: ['minecraft:diamond_sword', 'minecraft:iron_sword'],
      junkItemIds: ['minecraft:second_junk', 'minecraft:shared_junk'],
      score: {
        lengthPenalty: 0,
        junkPresencePenalty: 2,
        junkCountPenalty: 1,
        total: 3,
      },
    })
    expect(dirty?.explanations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        itemId: 'minecraft:iron_sword',
        source: 'name',
        line: 'Sword 4 z ab cd ef İx 1',
        matchedSpan: { start: 6, end: 7, text: '4' },
      }),
      expect.objectContaining({ itemId: 'minecraft:shared_junk' }),
      expect.objectContaining({ itemId: 'minecraft:second_junk' }),
    ]))
    expect(results.map((result) => result.query)).not.toContain('1')
    expect(dirty?.junkItemIds).not.toContain('minecraft:iron_sword')
  })

  test('ranks by score, junk appearances, fixed step count, typed characters, then query text', () => {
    const results = optimizeSingle(fixture())

    // A clean three-character query outranks the dirty one-character query on score.
    expect(resultIndex(results, 'swo')).toBeLessThan(resultIndex(results, '4'))
    // Equal scores: clean five-character "sword" beats dirty one-character "4".
    expect(resultIndex(results, 'sword')).toBeLessThan(resultIndex(results, '4'))
    // Single-query results all take one step; fewer newly typed characters breaks this tie.
    expect(resultIndex(results, 'z')).toBeLessThan(resultIndex(results, 'ab'))
    // Equal score, junk, step count, and typing cost fall back to alphabetical query text.
    expect(resultIndex(results, 'cd')).toBeLessThan(resultIndex(results, 'ef'))
  })

  test('forwards original Unicode-safe match spans in explanations', () => {
    const result = optimizeSingle(fixture()).find((candidate) => candidate.query === 'x')

    expect(result?.explanations).toContainEqual(expect.objectContaining({
      itemId: 'minecraft:iron_sword',
      matchedSpan: { start: 20, end: 21, text: 'x' },
    }))
  })
})
