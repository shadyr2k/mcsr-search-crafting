import { describe, expect, test } from 'vitest'

import type { SearchItem } from '../domain/types'
import { candidateQueries } from './candidates'

function target(id: string, lines: string[]): SearchItem {
  return {
    id,
    name: id,
    confidence: 'source_reproduced',
    searchLines: lines.map((text) => ({ source: 'name', text })),
  }
}

describe('candidateQueries', () => {
  test('returns unique normalized substrings from each target line in deterministic order', () => {
    expect(candidateQueries([
      target('minecraft:first', ['Ab+8']),
      target('minecraft:second', ['b c']),
    ], 2)).toEqual([
      ' ', ' c', '+', '+8', '8', 'a', 'ab', 'b', 'b ', 'b+', 'c',
    ])
  })

  test('does not derive candidates by joining target search lines', () => {
    expect(candidateQueries([
      target('minecraft:split', ['Iron', 'Sword']),
    ], 5)).not.toContain('ns')
  })

  test('limits candidates to the supported one-through-five character query length', () => {
    expect(candidateQueries([target('minecraft:long', ['abcdef'])], 10)).not.toContain('abcdef')
    expect(candidateQueries([target('minecraft:long', ['abcdef'])], 0)).toEqual([])
  })
})
