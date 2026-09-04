import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import { parseIconManifest } from '../data/iconManifest'
import type { RankedSearch, SearchItem } from '../domain/types'
import { ScoreBreakdownPopover } from './ScoreBreakdownPopover'

afterEach(cleanup)

const search: RankedSearch = {
  kind: 'single', queries: ['bed'], coveredTargetIds: [], totalJunkAppearances: 1, totalTypedCharacters: 3, totalScore: 4.5,
  steps: [{ query: 'bed', retainedPrefix: '', freeBackspaceCount: 0, typedSuffix: 'bed', coveredTargetIds: [], newTargetIds: [], junkItemIds: ['minecraft:stick'], explanations: [], score: { typingPenalty: 1, junkPresencePenalty: 2, junkCountPenalty: 0.5, total: 3.5 } }],
}
const items = new Map<string, SearchItem>()
const icons = parseIconManifest({ schema_version: 1, minecraft_version: '1.16.1', icon_width: 16, icon_height: 16, icons: {} })

describe('ScoreBreakdownPopover', () => {
  test('shows engine-provided step charges on hover and keeps them open on tap', () => {
    render(<ScoreBreakdownPopover search={search} items={items} icons={icons} />)
    const badge = screen.getByRole('button', { name: 'Score 4.5; show calculation' })
    fireEvent.pointerEnter(badge)
    expect(screen.getByText('bed: typing +1, junk present +2, 1 junk item +0.5')).toBeTruthy()
    fireEvent.click(badge)
    expect(badge.getAttribute('aria-expanded')).toBe('true')
  })
})
