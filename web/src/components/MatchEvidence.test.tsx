import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import { parseIconManifest } from '../data/iconManifest'
import type { SearchItem } from '../domain/types'
import type { CollectionMatchExplanation } from '../engine/search'
import { MatchEvidence } from './MatchEvidence'

afterEach(cleanup)

const explanation: CollectionMatchExplanation = {
  query: 'wn', collectionId: 'beds', recipeGroup: null, matchedMemberItemId: 'minecraft:white_bed', matchedMemberName: 'White Bed', visibleOutputItemId: 'minecraft:brown_bed', visibleOutputName: 'Brown Bed', source: 'name', line: 'Brown Bed', matchedSpan: { start: 3, end: 5, text: 'wn' },
}
const items = new Map<string, SearchItem>()
const icons = parseIconManifest({ schema_version: 1, minecraft_version: '1.16.1', icon_width: 16, icon_height: 16, icons: { 'minecraft:brown_bed': 'minecraft/brown_bed.png', 'minecraft:white_bed': 'minecraft/white_bed.png' } })

describe('MatchEvidence', () => {
  test('identifies an alias member separately and highlights the matched span', () => {
    render(<MatchEvidence explanation={explanation} items={items} icons={icons} />)
    expect(screen.getByRole('img', { name: 'Brown Bed' })).toBeTruthy()
    expect(screen.getByLabelText('matches craftable White Bed')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'White Bed' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Fast forward' })).toBeTruthy()
    expect(screen.getByText('wn', { selector: 'mark' })).toBeTruthy()
  })
})
