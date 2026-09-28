import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { parseIconManifest } from '../data/iconManifest'
import type { SearchItem } from '../domain/types'
import { ItemPicker } from './ItemPicker'

afterEach(cleanup)

const items = new Map<string, SearchItem>([
  ['minecraft:oak_leaves', { id: 'minecraft:oak_leaves', name: 'Oak Leaves', confidence: 'exact', searchLines: [] }],
  ['minecraft:stick', { id: 'minecraft:stick', name: 'Stick', confidence: 'exact', searchLines: [] }],
])
const icons = parseIconManifest({
  schema_version: 1,
  minecraft_version: '1.16.1',
  icon_width: 16,
  icon_height: 16,
  icons: {
    'minecraft:oak_leaves': 'minecraft/oak_leaves.png',
    'minecraft:stick': 'minecraft/stick.png',
  },
})

describe('ItemPicker', () => {
  test('keeps suggestions closed until the search field receives focus', async () => {
    const user = userEvent.setup()
    render(<ItemPicker items={items} selectedIds={[]} manifest={icons} onChange={vi.fn()} label="Inventory" />)

    expect(screen.queryByRole('list', { name: 'Inventory results' })).toBeNull()
    await user.click(screen.getByRole('searchbox', { name: 'Search Inventory' }))
    expect(screen.getByRole('list', { name: 'Inventory results' })).toBeTruthy()
  })

  test('searches names and IDs but presents selectable item buttons', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ItemPicker items={items} selectedIds={[]} manifest={icons} onChange={onChange} label="Inventory" />)

    await user.type(screen.getByRole('searchbox', { name: 'Search Inventory' }), 'oak lea')
    await user.click(screen.getByRole('button', { name: 'Oak Leaves' }))

    expect(onChange).toHaveBeenCalledWith(['minecraft:oak_leaves'])
    expect(screen.getByRole('img', { name: 'Oak Leaves' })).toBeTruthy()
  })

  test('keeps localized item matching literal outside craft query fields', async () => {
    const user = userEvent.setup()
    const localizedItems = new Map<string, SearchItem>([
      ['minecraft:stick', { id: 'minecraft:stick', name: 'Bâton', confidence: 'exact', searchLines: [] }],
    ])
    render(<ItemPicker items={localizedItems} selectedIds={[]} onChange={vi.fn()} label="Goals" />)

    const search = screen.getByRole('searchbox', { name: 'Search Goals' })
    await user.type(search, 'ba')
    expect(screen.queryByRole('button', { name: 'Bâton' })).toBeNull()
    await user.clear(search)
    await user.type(search, 'bâ')
    expect(screen.getByRole('button', { name: 'Bâton' })).toBeTruthy()
  })

  test('closes after an item is selected and the user clicks outside the dropdown', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<><ItemPicker items={items} selectedIds={[]} manifest={icons} onChange={onChange} label="Inventory" /><button type="button">Outside</button></>)

    await user.click(screen.getByRole('searchbox', { name: 'Search Inventory' }))
    await user.click(screen.getByRole('button', { name: 'Oak Leaves' }))
    expect(screen.getByRole('list', { name: 'Inventory results' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('list', { name: 'Inventory results' })).toBeNull()
  })

  test('keeps search focus while pressing a suggestion so blur cannot dismiss it before selection', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ItemPicker items={items} selectedIds={[]} manifest={icons} onChange={onChange} label="Goals" />)
    const search = screen.getByRole('searchbox', { name: 'Search Goals' })
    await user.click(search)
    await user.pointer({ keys: '[MouseLeft>]', target: screen.getByRole('button', { name: 'Stick' }) })
    expect(document.activeElement).toBe(search)
    await user.pointer({ keys: '[/MouseLeft]' })
    expect(onChange).toHaveBeenCalledWith(['minecraft:stick'])
  })

  test('keeps selected items in a separate row and out of the suggestions', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ItemPicker
      items={items}
      selectedIds={['minecraft:stick']}
      manifest={icons}
      onChange={onChange}
      label="Goals"
    />)

    expect(screen.getByRole('button', { name: 'Remove Stick' })).toBeTruthy()
    await user.click(screen.getByRole('searchbox', { name: 'Search Goals' }))
    expect(screen.getByRole('list', { name: 'Goals results' }).textContent).not.toContain('Stick')

    await user.click(screen.getByRole('button', { name: 'Remove Stick' }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  test('appends ordered goal selections to the right', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<ItemPicker
      items={items}
      selectedIds={[]}
      manifest={icons}
      onChange={onChange}
      label="Goals"
      preserveSelectionOrder
    />)

    await user.click(screen.getByRole('searchbox', { name: 'Search Goals' }))
    await user.click(screen.getByRole('button', { name: 'Stick' }))
    expect(onChange).toHaveBeenLastCalledWith(['minecraft:stick'])

    rerender(<ItemPicker
      items={items}
      selectedIds={['minecraft:stick']}
      manifest={icons}
      onChange={onChange}
      label="Goals"
      preserveSelectionOrder
    />)
    await user.click(screen.getByRole('button', { name: 'Oak Leaves' }))
    expect(onChange).toHaveBeenLastCalledWith(['minecraft:stick', 'minecraft:oak_leaves'])

    rerender(<ItemPicker
      items={items}
      selectedIds={['minecraft:stick', 'minecraft:oak_leaves']}
      manifest={icons}
      onChange={onChange}
      label="Goals"
      preserveSelectionOrder
    />)
    expect(screen.getAllByRole('button', { name: /Remove/ }).map((button) => button.getAttribute('aria-label')))
      .toEqual(['Remove Stick', 'Remove Oak Leaves'])
  })
})
