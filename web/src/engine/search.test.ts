import { describe, expect, test } from 'vitest'

import type { SearchItem } from '../domain/types'
import { matchItem } from './search'

const item: SearchItem = {
  id: 'minecraft:diamond_sword',
  name: 'Diamond Sword',
  confidence: 'source_reproduced',
  searchLines: [
    { source: 'name', text: 'Diamond Sword' },
    { source: 'attribute', text: '+8 Attack Damage!' },
  ],
}

describe('matchItem', () => {
  test('reports the original line, source, and span for a case-insensitive match', () => {
    expect(matchItem(item, 'SWO')).toEqual([{
      itemId: 'minecraft:diamond_sword',
      source: 'name',
      line: 'Diamond Sword',
      matchedSpan: { start: 8, end: 11, text: 'Swo' },
    }])
  })

  test('matches searchable punctuation, spaces, digits, and plus signs', () => {
    expect(matchItem(item, '+8 A')).toEqual([{
      itemId: 'minecraft:diamond_sword',
      source: 'attribute',
      line: '+8 Attack Damage!',
      matchedSpan: { start: 0, end: 4, text: '+8 A' },
    }])
  })

  test('does not match a query formed by adjacent search lines', () => {
    const splitItem: SearchItem = {
      ...item,
      searchLines: [
        { source: 'name', text: 'Stone' },
        { source: 'attribute', text: 'Sword' },
      ],
    }

    expect(matchItem(splitItem, 'eS')).toEqual([])
  })

  test('rejects empty and over-five-character queries', () => {
    expect(matchItem(item, '')).toEqual([])
    expect(matchItem(item, 'Sword!')).toEqual([])
  })

  test('maps a match after an expanded lowercase character to the original span', () => {
    const expandedItem: SearchItem = {
      ...item,
      searchLines: [{ source: 'name', text: 'İx' }],
    }

    expect(matchItem(expandedItem, 'x')).toEqual([{
      itemId: 'minecraft:diamond_sword',
      source: 'name',
      line: 'İx',
      matchedSpan: { start: 1, end: 2, text: 'x' },
    }])
  })

  test('matches Unicode localized text without an English-only normalization assumption', () => {
    const japaneseItem: SearchItem = {
      ...item,
      searchLines: [{ source: 'name', text: 'ダイヤモンドの剣' }],
    }

    expect(matchItem(japaneseItem, 'モンド')).toEqual([{
      itemId: 'minecraft:diamond_sword',
      source: 'name',
      line: 'ダイヤモンドの剣',
      matchedSpan: { start: 3, end: 6, text: 'モンド' },
    }])
  })
})
