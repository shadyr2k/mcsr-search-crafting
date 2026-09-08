import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { parseIconManifest } from '../data/iconManifest'
import type { SearchItem, TargetWorkspaceEntry } from '../domain/types'
import { ItemSetWorkspace } from './ItemSetWorkspace'

afterEach(cleanup)

const items = new Map<string, SearchItem>([
  ['minecraft:stick', { id: 'minecraft:stick', name: 'Stick', confidence: 'exact', searchLines: [] }],
])
const icons = parseIconManifest({
  schema_version: 1,
  minecraft_version: '1.16.1',
  icon_width: 16,
  icon_height: 16,
  icons: { 'minecraft:stick': 'minecraft/stick.png' },
})
const entry: TargetWorkspaceEntry = {
  id: 'saved', targetIds: ['minecraft:stick'], inventoryItemIds: [], enabled: true, gridSize: 2, order: 0,
}

describe('ItemSetWorkspace', () => {
  test('emits enabled changes immediately while edits remain explicit', () => {
    const onWorkspaceChange = vi.fn()
    const onEdit = vi.fn()
    render(<ItemSetWorkspace
      entries={[entry]}
      items={items}
      icons={icons}
      onWorkspaceChange={onWorkspaceChange}
      onEdit={onEdit}
      onAdd={vi.fn()}
    />)

    const enableButton = screen.getByRole('button', { name: 'Enable item set 1' })
    expect(enableButton.getAttribute('aria-pressed')).toBe('true')
    expect(enableButton.textContent).toBe('enabled')
    fireEvent.click(enableButton)
    expect(onWorkspaceChange).toHaveBeenCalledWith({ entries: [expect.objectContaining({ enabled: false })] })
    fireEvent.click(screen.getByRole('button', { name: 'Edit item set 1' }))
    expect(onEdit).toHaveBeenCalledWith('saved')
  })

  test('uses a compact add control without changing its accessible name', () => {
    const onAdd = vi.fn()
    render(<ItemSetWorkspace
      entries={[]}
      items={items}
      icons={icons}
      onWorkspaceChange={vi.fn()}
      onEdit={vi.fn()}
      onAdd={onAdd}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Add item set' }))
    expect(onAdd).toHaveBeenCalledOnce()
  })
})
