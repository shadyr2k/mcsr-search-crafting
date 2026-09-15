import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { parseIconManifest } from '../data/iconManifest'
import type { SearchItem } from '../domain/types'
import { CraftingSheet, type CraftingSheetProps } from './CraftingSheet'

afterEach(cleanup)

const items = new Map<string, SearchItem>([
  ['minecraft:iron_pickaxe', { id: 'minecraft:iron_pickaxe', name: 'Iron Pickaxe', confidence: 'exact', searchLines: [] }],
  ['minecraft:golden_helmet', { id: 'minecraft:golden_helmet', name: 'Golden Helmet', confidence: 'exact', searchLines: [] }],
  ['minecraft:golden_pickaxe', { id: 'minecraft:golden_pickaxe', name: 'Golden Pickaxe', confidence: 'exact', searchLines: [] }],
])

const icons = parseIconManifest({
  schema_version: 1,
  minecraft_version: '1.16.1',
  icon_width: 16,
  icon_height: 16,
  icons: {
    'minecraft:iron_pickaxe': 'minecraft/iron_pickaxe.png',
    'minecraft:golden_helmet': 'minecraft/golden_helmet.png',
    'minecraft:golden_pickaxe': 'minecraft/golden_pickaxe.png',
  },
})

function props(overrides: Partial<CraftingSheetProps> = {}): CraftingSheetProps {
  return {
    languageName: 'english',
    entries: [
      {
        id: 'pickaxe',
        itemIds: ['minecraft:iron_pickaxe'],
        label: 'iron pickaxe',
        queryLabel: 'nak',
        selectedOptionId: 'default',
        defaultOptionId: 'default',
        disabled: false,
        options: [
          { id: 'default', label: 'nak', isOptimal: true },
          { id: 'alternate', label: 'pick', isOptimal: false },
        ],
      },
      {
        id: 'gold',
        itemIds: ['minecraft:golden_helmet', 'minecraft:golden_pickaxe'],
        label: 'golden items',
        queryLabel: 'lj ← ak',
        selectedOptionId: 'default',
        defaultOptionId: 'default',
        disabled: false,
        options: [
          { id: 'default', label: 'lj ← ak', isOptimal: true },
          { id: 'alternate', label: 'gold', isOptimal: false },
        ],
      },
    ],
    disabledEntries: [],
    characterSet: ['n', 'k', 'l', 'j', 'a'],
    characterUsages: [
      {
        character: 'k',
        craftCount: 3,
        entryIds: ['pickaxe', 'gold'],
        occurrences: [
          { entryId: 'pickaxe', label: 'iron pickaxe', itemIds: ['minecraft:iron_pickaxe'], optionId: 'default', queryLabel: 'naK' },
          { entryId: 'gold', label: 'golden items', itemIds: ['minecraft:golden_helmet', 'minecraft:golden_pickaxe'], optionId: 'default', queryLabel: 'lj ← ak' },
        ],
      },
      {
        character: 'n',
        craftCount: 6,
        entryIds: ['pickaxe'],
        occurrences: [
          { entryId: 'pickaxe', label: 'iron pickaxe', itemIds: ['minecraft:iron_pickaxe'], optionId: 'default', queryLabel: 'nak' },
        ],
      },
    ],
    items,
    icons,
    onSelectCraft: vi.fn(),
    onSetEntryDisabled: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  }
}

describe('CraftingSheet', () => {
  test('starts compact, then shows a sorted character set and usage chart', () => {
    const { container } = render(<CraftingSheet {...props()} />)

    const toggle = screen.getByRole('button', { name: 'english search crafts' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('heading', { name: 'english search crafts' }).tagName).toBe('H2')
    expect(screen.getByText('crafting sheet')).toBeTruthy()
    expect(container.querySelector('.crafting-sheet__disclosure .arrow-sprite--down')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'characters used' })).toBeNull()

    fireEvent.click(toggle)

    expect(container.querySelector('.crafting-sheet__disclosure .arrow-sprite--up')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'character set' })).toBeTruthy()
    expect(screen.getByLabelText('Selected characters').textContent).toBe('nklja')
    const usageList = screen.getByRole('heading', { name: 'characters used' }).parentElement!
    const characterToggles = within(usageList).getAllByRole('button')
    expect(characterToggles[0].textContent).toContain('n–6 crafts')
    expect(characterToggles[1].textContent).toContain('k–3 crafts')

    const chart = screen.getByLabelText('Character occurrence bar chart')
    expect(within(chart).getByText('n')).toBeTruthy()
    expect(within(chart).getByText('6')).toBeTruthy()
    expect(chart.querySelector<HTMLElement>('.crafting-sheet__bar')?.getAttribute('style')).toContain('--crafting-sheet-bar-width: 100%')
  })

  test('expands a character into image-backed, highlighted craft occurrences', () => {
    render(<CraftingSheet {...props({ defaultOpen: true })} />)

    fireEvent.click(screen.getByRole('button', { name: /k.*3 crafts/i }))

    const crafts = screen.getByLabelText('k crafts')
    expect(within(crafts).getByRole('img', { name: 'Iron Pickaxe' })).toBeTruthy()
    expect(within(crafts).getByRole('img', { name: 'Golden Helmet' })).toBeTruthy()
    expect(within(crafts).getByRole('img', { name: 'Golden Pickaxe' })).toBeTruthy()
    expect(within(crafts).getAllByText('K', { selector: 'mark' })).toHaveLength(1)
    expect(within(crafts).getAllByText('k', { selector: 'mark' })).toHaveLength(1)
  })

  test('offers text-only replacement crafts and reports changes, disabling, and reset', () => {
    const onSelectCraft = vi.fn()
    const onSetEntryDisabled = vi.fn()
    const onReset = vi.fn()
    render(<CraftingSheet {...props({ defaultOpen: true, onSelectCraft, onSetEntryDisabled, onReset })} />)

    fireEvent.click(screen.getByRole('button', { name: /k.*3 crafts/i }))
    const crafts = screen.getByLabelText('k crafts')
    fireEvent.click(within(crafts).getAllByRole('button', { name: /choose craft/i })[0])
    const choices = screen.getByLabelText('Calculated crafts for iron pickaxe')
    expect(within(choices).queryByRole('img')).toBeNull()
    fireEvent.click(within(choices).getByRole('button', { name: 'pick' }))
    expect(onSelectCraft).toHaveBeenCalledWith('pickaxe', 'alternate')

    fireEvent.click(within(crafts).getAllByRole('button', { name: 'disable craft' })[0])
    expect(onSetEntryDisabled).toHaveBeenCalledWith('pickaxe', true)
    fireEvent.click(screen.getByRole('button', { name: 'reset character set' }))
    expect(onReset).toHaveBeenCalledOnce()
  })

  test('announces calculation state and warnings in the open sheet', () => {
    render(<CraftingSheet {...props({ defaultOpen: true, isCalculating: true, warning: 'One craft is no longer available.' })} />)

    expect(screen.getByText('Updating character set…').getAttribute('role')).toBe('status')
    expect(screen.getByText('One craft is no longer available.').getAttribute('role')).toBe('status')
  })

  test('keeps disabled crafts reachable so they can be included again', () => {
    const onSetEntryDisabled = vi.fn()
    const base = props({ defaultOpen: true, onSetEntryDisabled })
    const disabledEntry = { ...base.entries[0], disabled: true }
    render(<CraftingSheet {...base} entries={[disabledEntry]} disabledEntries={[disabledEntry]} characterSet={[]} characterUsages={[]} />)

    const disabledCrafts = screen.getByRole('region', { name: 'disabled crafts' })
    expect(within(disabledCrafts).getByRole('img', { name: 'Iron Pickaxe' })).toBeTruthy()
    fireEvent.click(within(disabledCrafts).getByRole('button', { name: 'include craft' }))
    expect(onSetEntryDisabled).toHaveBeenCalledWith('pickaxe', false)
  })
})
