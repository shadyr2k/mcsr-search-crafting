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
const secondEntry: TargetWorkspaceEntry = {
  ...entry, id: 'second', order: 1,
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

  test('reorders rows from the drag handle without rendering move-arrow buttons', () => {
    const onWorkspaceChange = vi.fn()
    render(<ItemSetWorkspace
      entries={[entry, secondEntry]}
      items={items}
      icons={icons}
      onWorkspaceChange={onWorkspaceChange}
      onEdit={vi.fn()}
      onAdd={vi.fn()}
    />)

    const secondRow = screen.getByRole('article', { name: 'Item set 2' })
    const firstHandle = screen.getByRole('button', { name: /Reorder item set 1/i })
    const originalElementFromPoint = document.elementFromPoint
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => secondRow })

    fireEvent.pointerDown(firstHandle, { pointerId: 1 })
    fireEvent.pointerMove(firstHandle, { pointerId: 1, clientX: 4, clientY: 4 })
    fireEvent.pointerUp(firstHandle, { pointerId: 1 })

    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: originalElementFromPoint })
    expect(onWorkspaceChange).toHaveBeenCalledWith({ entries: [
      expect.objectContaining({ id: 'second', order: 0 }),
      expect.objectContaining({ id: 'saved', order: 1 }),
    ] })
    expect(screen.queryByRole('button', { name: /Move item set/i })).toBeNull()
  })
})
