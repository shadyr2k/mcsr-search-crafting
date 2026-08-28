import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { CraftingRecipe, SearchItem, TargetWorkspace } from '../domain/types'
import { TargetSetList } from './TargetSetList'

afterEach(cleanup)

const items = new Map<string, SearchItem>([
  ['minecraft:stick', { id: 'minecraft:stick', name: 'Stick', confidence: 'exact', searchLines: [] }],
  ['minecraft:crafting_table', { id: 'minecraft:crafting_table', name: 'Crafting Table', confidence: 'exact', searchLines: [] }],
  ['minecraft:iron_sword', { id: 'minecraft:iron_sword', name: 'Iron Sword', confidence: 'exact', searchLines: [] }],
])

const recipes: CraftingRecipe[] = [
  { id: 'stick', outputItemId: 'minecraft:stick', outputCount: 4, ingredientSlots: [{ acceptedItems: ['minecraft:oak_planks'] }], fits2x2: true, fits3x3: true },
  { id: 'table', outputItemId: 'minecraft:crafting_table', outputCount: 1, ingredientSlots: [{ acceptedItems: ['minecraft:oak_planks'] }], fits2x2: true, fits3x3: true },
  { id: 'sword', outputItemId: 'minecraft:iron_sword', outputCount: 1, ingredientSlots: [{ acceptedItems: ['minecraft:iron_ingot'] }], fits2x2: false, fits3x3: true },
]

function ListHarness({ onPersist = vi.fn() }: { onPersist?: (workspace: TargetWorkspace) => void }) {
  const [workspace, setWorkspace] = useState<TargetWorkspace>({ entries: [] })
  const onWorkspaceChange = (next: TargetWorkspace) => {
    setWorkspace(next)
    onPersist(next)
  }

  return <TargetSetList items={items} recipes={recipes} workspace={workspace} onWorkspaceChange={onWorkspaceChange} />
}

describe('TargetSetList', () => {
  test('adds targets to a new enabled 3x3 target set and autosaves the workspace', () => {
    const onPersist = vi.fn()
    render(<ListHarness onPersist={onPersist} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add target set' }))
    expect(screen.getByRole('radio', { name: '3x3 grid' })).toHaveProperty('checked', true)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search targets for set 1' }), {
      target: { value: 'stick' },
    })
    fireEvent.click(within(screen.getByRole('article', { name: 'Target set 1' })).getByRole('button', { name: 'Add Stick' }))
    fireEvent.click(screen.getByRole('radio', { name: '2x2 grid' }))

    expect(screen.getByRole('radio', { name: '2x2 grid' })).toHaveProperty('checked', true)
    expect(screen.getByText('Stick')).toBeTruthy()
    expect(onPersist).toHaveBeenLastCalledWith(expect.objectContaining({
      entries: [expect.objectContaining({ targetIds: ['minecraft:stick'], enabled: true, gridSize: 2 })],
    }))
  })

  test('only enables 2x2 when every target supports it and explains incompatible targets', () => {
    render(<ListHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'Add target set' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search targets for set 1' }), {
      target: { value: 'iron sword' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Iron Sword' }))

    expect(screen.getByRole('radio', { name: '2x2 grid' })).toHaveProperty('disabled', true)
    expect(screen.getByText(/Iron Sword cannot be crafted in a 2x2 grid/i)).toBeTruthy()
  })

  test('removes targets, toggles entries, and reorders entries', () => {
    render(<ListHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'Add target set' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add target set' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search targets for set 1' }), { target: { value: 'stick' } })
    fireEvent.click(within(screen.getByRole('article', { name: 'Target set 1' })).getByRole('button', { name: 'Add Stick' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable set 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move set 2 up' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Stick from set 1' }))

    expect(screen.getByRole('checkbox', { name: 'Enable set 1' })).toHaveProperty('checked', false)
    expect(within(screen.getByRole('article', { name: 'Target set 1' })).getByText('No targets yet.')).toBeTruthy()
    expect(screen.getByText('Target set 2')).toBeTruthy()
  })
})
