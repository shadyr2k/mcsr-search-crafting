import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { parseIconManifest } from '../data/iconManifest'
import type { SearchItem, TargetWorkspaceEntry } from '../domain/types'
import { createItemSetWorkspaceShareCode } from '../workspace/itemSetShare'
import { ItemSetWorkspace } from './ItemSetWorkspace'

afterEach(cleanup)

const items = new Map<string, SearchItem>([
  ['minecraft:stick', { id: 'minecraft:stick', name: 'Stick', confidence: 'exact', searchLines: [] }],
])
const inventoryItems = new Map([
  ['minecraft:oak_planks', { id: 'minecraft:oak_planks', name: 'Oak Planks' }],
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
      inventoryItems={inventoryItems}
      icons={icons}
      onWorkspaceChange={onWorkspaceChange}
      onImport={vi.fn()}
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
      inventoryItems={inventoryItems}
      icons={icons}
      onWorkspaceChange={vi.fn()}
      onImport={vi.fn()}
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
      inventoryItems={inventoryItems}
      icons={icons}
      onWorkspaceChange={onWorkspaceChange}
      onImport={vi.fn()}
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

  test('exports and imports the complete ordered item-set column from its header', () => {
    const onImport = vi.fn()
    render(<ItemSetWorkspace
      entries={[entry, { ...secondEntry, enabled: false, gridSize: 3, retainCraftOrder: true, inventoryItemIds: ['minecraft:oak_planks'] }]}
      items={items}
      inventoryItems={inventoryItems}
      icons={icons}
      onWorkspaceChange={vi.fn()}
      onImport={onImport}
      onEdit={vi.fn()}
      onAdd={vi.fn()}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'share' }))
    fireEvent.click(screen.getByRole('button', { name: 'export' }))
    expect((screen.getByLabelText('Item set collection share code') as HTMLTextAreaElement).value).toMatch(/^mcsr-item-sets-v1\./)

    const code = createItemSetWorkspaceShareCode([{
      targetIds: ['minecraft:stick'],
      inventoryItemIds: ['minecraft:oak_planks'],
      enabled: false,
      gridSize: 3,
      retainCraftOrder: true,
    }])
    fireEvent.change(screen.getByLabelText('Import item set collection code'), { target: { value: code } })
    fireEvent.click(screen.getByRole('button', { name: 'replace' }))

    expect(onImport).toHaveBeenCalledWith([{
      targetIds: ['minecraft:stick'],
      inventoryItemIds: ['minecraft:oak_planks'],
      enabled: false,
      gridSize: 3,
      retainCraftOrder: true,
    }])
    expect(screen.getByRole('status').textContent).toContain('Replaced the column with 1 item set.')
  })
})
