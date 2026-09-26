import { describe, expect, test } from 'vitest'

import type { SearchItem } from '../domain/types'
import { matchItem, normalizeSearchText } from './search'

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

  test('combines item ID and tooltip matches for enabled colon-prefixed searches', () => {
    const ironSword = { ...item, id: 'minecraft:iron_sword' }
    expect(matchItem(ironSword, ':on_sw', { itemIdSearch: true })).toEqual([{
      itemId: 'minecraft:iron_sword',
      source: 'item_id',
      line: 'iron_sword',
      matchedSpan: { start: 2, end: 7, text: 'on_sw' },
    }])
    expect(matchItem(ironSword, ':att', { itemIdSearch: true })).toEqual([{
      itemId: 'minecraft:iron_sword',
      source: 'attribute',
      line: '+8 Attack Damage!',
      matchedSpan: { start: 3, end: 6, text: 'Att' },
    }])
    expect(matchItem(ironSword, ':on_s')).toEqual([])
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

  test('maps a match after a keyboard-normalized character to the original span', () => {
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
    expect(normalizeSearchText('İx')).toBe('ix')
  })

  test('matches Latin keyboard approximations for accents, ligatures, and eth', () => {
    const localizedItem: SearchItem = {
      ...item,
      searchLines: [{ source: 'name', text: 'Wä æð' }],
    }

    expect(matchItem(localizedItem, 'wa')).toEqual([{
      itemId: item.id,
      source: 'name',
      line: 'Wä æð',
      matchedSpan: { start: 0, end: 2, text: 'Wä' },
    }])
    expect(matchItem(localizedItem, 'e')).toEqual([{
      itemId: item.id,
      source: 'name',
      line: 'Wä æð',
      matchedSpan: { start: 3, end: 4, text: 'æ' },
    }])
    expect(matchItem(localizedItem, 'th')).toEqual([{
      itemId: item.id,
      source: 'name',
      line: 'Wä æð',
      matchedSpan: { start: 4, end: 5, text: 'ð' },
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
