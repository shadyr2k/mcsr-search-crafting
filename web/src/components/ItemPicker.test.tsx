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

  test('searches names and IDs but presents selectable icons with accessible names', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ItemPicker items={items} selectedIds={[]} manifest={icons} onChange={onChange} label="Inventory" />)

    await user.type(screen.getByRole('searchbox', { name: 'Search Inventory' }), 'oak lea')
    await user.click(screen.getByRole('checkbox', { name: 'Oak Leaves minecraft:oak_leaves' }))

    expect(onChange).toHaveBeenCalledWith(['minecraft:oak_leaves'])
    expect(screen.getByRole('img', { name: 'Oak Leaves' })).toBeTruthy()
  })
})
