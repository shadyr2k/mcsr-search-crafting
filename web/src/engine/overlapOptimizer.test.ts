import { describe, expect, test } from 'vitest'

import type { SearchItem } from '../domain/types'
import { optimizeOverlap, type OverlapResult } from './overlapOptimizer'
import type { OptimizeInput } from './singleOptimizer'

function item(id: string, text: string): SearchItem {
  return {
    id,
    name: id,
    confidence: 'source_reproduced',
    searchLines: [{ source: 'name', text }],
  }
}

function fixture(targets: SearchItem[], junk: SearchItem[] = []): OptimizeInput {
  const visibleItems = [...targets, ...junk]

  return {
    targetIds: new Set(targets.map(({ id }) => id)),
    visibleItemIds: new Set(visibleItems.map(({ id }) => id)),
    items: new Map(visibleItems.map((searchItem) => [searchItem.id, searchItem])),
  }
}

function sequence(result: OverlapResult): string[] {
  return result.steps.map(({ query }) => query)
}

function findSequence(results: OverlapResult[], queries: string[]): OverlapResult {
  const result = results.find((candidate) => sequence(candidate).join('\0') === queries.join('\0'))
  expect(result, `missing sequence ${queries.join(' -> ')}`).toBeDefined()
  return result!
}

describe('optimizeOverlap', () => {
  test('reports retained prefixes, free backspaces, typed suffixes, and match explanations', () => {
    const targets = [item('target:bed', 'bed'), item('target:bow', 'bow')]
    const shortBedJunk = item('junk:bed-parts', 'b be e ed d')
    const shortBowJunk = item('junk:bow-parts', 'b bo o ow w')

    const result = findSequence(
      optimizeOverlap(fixture(targets, [shortBedJunk, shortBowJunk])),
      ['bed', 'bow'],
    )

    expect(result.steps[0]).toMatchObject({
      query: 'bed',
      newTargetIds: ['target:bed'],
      retainedPrefix: '',
      freeBackspaceCount: 0,
      typedSuffix: 'bed',
      junkItemIds: [],
    })
    expect(result.steps[1]).toMatchObject({
      query: 'bow',
      newTargetIds: ['target:bow'],
      retainedPrefix: 'b',
      freeBackspaceCount: 2,
      typedSuffix: 'ow',
      junkItemIds: [],
    })
    expect(result.steps[1].explanations).toContainEqual(expect.objectContaining({
      itemId: 'target:bow',
      line: 'bow',
      matchedSpan: { start: 0, end: 3, text: 'bow' },
    }))
    expect(result.score).toEqual({
      initialLengthPenalty: 1,
      transitionTypingPenalty: 2,
      junkPresencePenalty: 0,
      junkCountPenalty: 0,
      total: 3,
    })
  })

  test('ranks directional edit order using only the newly typed suffix after the first step', () => {
    const targets = [item('target:a', 'a'), item('target:bow', 'bow')]
    const shortBowJunk = item('junk:bow-parts', 'b bo o ow w')
    const results = optimizeOverlap(fixture(targets, [shortBowJunk]))
    const bowThenA = findSequence(results, ['bow', 'a'])
    const aThenBow = findSequence(results, ['a', 'bow'])

    expect(bowThenA.steps[1]).toMatchObject({
      retainedPrefix: '',
      freeBackspaceCount: 3,
      typedSuffix: 'a',
    })
    expect(bowThenA.score.total).toBe(2)
    expect(aThenBow.score.total).toBe(3)
    expect(results.indexOf(bowThenA)).toBeLessThan(results.indexOf(aThenBow))
  })

  test('charges repeated junk independently at every step but combines it once for context', () => {
    const targets = [item('target:ax', 'ax'), item('target:by', 'by')]
    const sharedJunk = item('junk:shared', 'ax by')
    const result = optimizeOverlap(fixture(targets, [sharedJunk]))[0]

    expect(result.steps).toHaveLength(2)
    expect(result.steps.map(({ junkItemIds }) => junkItemIds)).toEqual([
      ['junk:shared'],
      ['junk:shared'],
    ])
    expect(result.junkItemIds).toEqual(['junk:shared'])
    expect(result.totalJunkAppearances).toBe(2)
    expect(result.score.junkPresencePenalty).toBe(4)
    expect(result.score.junkCountPenalty).toBe(1)
    expect(result.steps.flatMap(({ junkItemIds }) => junkItemIds)).not.toContain('target:ax')
    expect(result.steps.flatMap(({ junkItemIds }) => junkItemIds)).not.toContain('target:by')
  })

  test('allows one step to add multiple targets and never keeps a step that adds no target', () => {
    const targets = [item('target:red-bed', 'red bed'), item('target:blue-bed', 'blue bed')]
    const results = optimizeOverlap(fixture(targets))
    const shared = findSequence(results, ['bed'])

    expect(shared.steps[0].coveredTargetIds).toEqual(['target:blue-bed', 'target:red-bed'])
    expect(shared.steps[0].newTargetIds).toEqual(['target:blue-bed', 'target:red-bed'])
    expect(shared.steps[0].junkItemIds).toEqual([])
    expect(results.every((result) => result.steps.length <= targets.length)).toBe(true)
    expect(results.every((result) => result.steps.every(({ newTargetIds }) => newTargetIds.length > 0))).toBe(true)
  })

  test('uses deterministic tie metrics when replacing states and ranking complete results', () => {
    const results = optimizeOverlap(fixture([item('target:ab', 'ab'), item('target:cd', 'cd')]))

    expect(results.slice(0, 4).map(sequence)).toEqual([
      ['a', 'c'],
      ['a', 'd'],
      ['c', 'a'],
      ['c', 'b'],
    ])
    expect(results.find((result) => result.steps.at(-1)?.query === 'a')?.steps[0].query).toBe('c')
  })
})
