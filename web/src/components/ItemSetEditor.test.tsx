import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { parseIconManifest } from '../data/iconManifest'
import type { CustomInventoryPreset, GeneratedData, ItemSetDraft, SearchItem } from '../domain/types'
import { newItemSetDraft } from '../workspace/entryDraft'
import { ItemSetEditor } from './ItemSetEditor'

afterEach(cleanup)

const stick: SearchItem = { id: 'minecraft:stick', name: 'Stick', confidence: 'exact', searchLines: [] }
const data: GeneratedData = {
  schemaVersion: 3,
  items: new Map([['minecraft:stick', stick]]),
  inventoryItems: new Map([['minecraft:bucket', { id: 'minecraft:bucket', name: 'Bucket' }]]),
  recipes: [],
  collections: new Map(),
  presets: new Map([
    ['overworld', { id: 'overworld', name: 'Overworld', itemIds: ['minecraft:bucket'] }],
    ['nether-bastion', { id: 'nether-bastion', name: 'Nether (Bastion)', itemIds: ['minecraft:bucket'] }],
    ['nether-fortress', { id: 'nether-fortress', name: 'Nether (Fortress)', itemIds: ['minecraft:bucket'] }],
  ]),
}
const icons = parseIconManifest({
  schema_version: 1,
  minecraft_version: '1.16.1',
  icon_width: 16,
  icon_height: 16,
  icons: {
    'minecraft:bucket': 'minecraft/bucket.png',
    'minecraft:stick': 'minecraft/stick.png',
    'minecraft:chest': 'minecraft/chest.png',
    'minecraft:gold_block': 'minecraft/gold_block.png',
    'minecraft:blaze_rod': 'minecraft/blaze_rod.png',
  },
})

function renderEditor(draft: ItemSetDraft, onDraftChange = vi.fn(), onSave = vi.fn()) {
  const onSaveCustomSlot = vi.fn()
  const onCancel = vi.fn()
  return {
    onDraftChange,
    onSave,
    onSaveCustomSlot,
    onCancel,
    ...render(<ItemSetEditor
      state={{ kind: 'new', draft }}
      data={data}
      icons={icons}
      customSlots={[null, null, null]}
      onDraftChange={onDraftChange}
      onSave={onSave}
      onCancel={onCancel}
      onSaveCustomSlot={onSaveCustomSlot}
      onClearCustomSlot={vi.fn()}
    />),
  }
}

describe('ItemSetEditor', () => {
  test('applies a built-in preset as an editable copy and permits empty inventory', async () => {
    const user = userEvent.setup()
    const draft = { ...newItemSetDraft(), targetIds: ['minecraft:stick'] }
    const { onDraftChange } = renderEditor(draft)

    await user.click(screen.getByRole('button', { name: 'Use inventory preset Overworld' }))
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ inventoryItemIds: ['minecraft:bucket'] }))
    expect(data.presets.get('overworld')?.itemIds).toEqual(['minecraft:bucket'])
    expect((screen.getByRole('button', { name: 'Save item set' }) as HTMLButtonElement).disabled).toBe(false)
  })

  test('does not offer Save until the draft has a valid goal', () => {
    renderEditor(newItemSetDraft())
    expect((screen.getByRole('button', { name: 'Save item set' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('commits only when Save is pressed', () => {
    const draft = { ...newItemSetDraft(), targetIds: ['minecraft:stick'] }
    const { onSave } = renderEditor(draft)
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save item set' }))
    expect(onSave).toHaveBeenCalledWith({ draft })
  })

  test('saves a custom preset with its controlled name', async () => {
    const user = userEvent.setup()
    const draft = { ...newItemSetDraft(), targetIds: ['minecraft:stick'], inventoryItemIds: ['minecraft:bucket'] }
    const { onSaveCustomSlot } = renderEditor(draft)

    expect(screen.queryByRole('textbox', { name: 'New inventory name' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Manage saved inventories' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save as new' }))
    await user.type(screen.getByRole('textbox', { name: 'New inventory name' }), 'Quick start')
    await user.click(screen.getByRole('button', { name: 'Create saved inventory' }))
    expect(onSaveCustomSlot).toHaveBeenCalledWith(0, { name: 'Quick start', itemIds: ['minecraft:bucket'] })
  })

  test('shows Minecraft preset icons and loads saved inventories from a compact selector', () => {
    const onDraftChange = vi.fn()
    render(<ItemSetEditor
      state={{ kind: 'new', draft: newItemSetDraft() }}
      data={data}
      icons={icons}
      customSlots={[{ name: 'Fast route', itemIds: ['minecraft:bucket'] }, null, null]}
      onDraftChange={onDraftChange}
      onSave={vi.fn()}
      onCancel={vi.fn()}
      onSaveCustomSlot={vi.fn()}
      onClearCustomSlot={vi.fn()}
    />)

    expect(screen.getByRole('img', { name: 'Overworld preset icon' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Nether (Bastion) preset icon' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Nether (Fortress) preset icon' })).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'Saved inventory' }), { target: { value: '0' } })
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ inventoryItemIds: ['minecraft:bucket'] }))
    expect(screen.queryByRole('button', { name: 'Use inventory preset Fast route' })).toBeNull()
  })

  test('toggles retained craft order without changing the selected target order', () => {
    const draft = { ...newItemSetDraft(), targetIds: ['minecraft:stick'] }
    const { onDraftChange } = renderEditor(draft)

    fireEvent.click(within(screen.getByRole('group', { name: 'Retain item order' })).getByRole('button', { name: 'enabled' }))

    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({
      targetIds: ['minecraft:stick'],
      retainCraftOrder: true,
    }))
  })

  test('renames, updates and deletes every saved slot inline without changing its items during rename', async () => {
    const user = userEvent.setup()
    const onSaveCustomSlot = vi.fn()
    const onClearCustomSlot = vi.fn()
    function SavedEditor() {
      const [slots, setSlots] = useState<Array<CustomInventoryPreset | null>>([
        { name: 'First', itemIds: ['minecraft:bucket'] },
        { name: 'Second', itemIds: ['minecraft:bucket'] },
        { name: 'Third', itemIds: ['minecraft:bucket'] },
      ])
      return <ItemSetEditor
        state={{ kind: 'new', draft: { ...newItemSetDraft(), inventoryItemIds: [] } }}
        data={data}
        icons={icons}
        customSlots={slots}
        onDraftChange={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onSaveCustomSlot={(index, preset) => {
          onSaveCustomSlot(index, preset)
          setSlots((current) => current.map((slot, slotIndex) => slotIndex === index ? preset : slot))
        }}
        onClearCustomSlot={(index) => {
          onClearCustomSlot(index)
          setSlots((current) => current.map((slot, slotIndex) => slotIndex === index ? null : slot))
        }}
      />
    }
    render(<SavedEditor />)

    expect((screen.getByRole('button', { name: 'Save as new' }) as HTMLButtonElement).disabled).toBe(true)
    for (let index = 0; index < 3; index++) {
      await user.selectOptions(screen.getByRole('combobox', { name: 'Saved inventory' }), String(index))
      await user.click(screen.getByRole('button', { name: 'Rename saved inventory' }))
      const input = screen.getByRole('textbox', { name: 'Saved inventory name' })
      await user.clear(input)
      await user.type(input, `Route ${index + 1}`)
      await user.click(screen.getByRole('button', { name: 'Save inventory name' }))
      expect(onSaveCustomSlot).toHaveBeenLastCalledWith(index, { name: `Route ${index + 1}`, itemIds: ['minecraft:bucket'] })
      await user.click(screen.getByRole('button', { name: 'Update saved inventory items' }))
      expect(onSaveCustomSlot).toHaveBeenLastCalledWith(index, { name: `Route ${index + 1}`, itemIds: [] })
      await user.click(screen.getByRole('button', { name: 'Delete saved inventory' }))
      expect(onClearCustomSlot).toHaveBeenLastCalledWith(index)
    }
  })

  test('groups grid size and item order into Rules with reusable segmented controls', () => {
    renderEditor(newItemSetDraft())

    expect(screen.getByText('retain item order').className).toContain('craft-order-switch__title')
    const rules = screen.getByRole('region', { name: 'Rules' })
    expect(within(rules).getByRole('group', { name: 'Retain item order' }).className).toBe('segmented-control')
    expect(within(rules).getByRole('group', { name: 'Crafting grid size' }).className).toBe('segmented-control')
  })

  test('uses selected options instead of sliders in compact layout', () => {
    const onDraftChange = vi.fn()
    render(<ItemSetEditor
      compactLayout
      state={{ kind: 'new', draft: newItemSetDraft() }}
      data={data}
      icons={icons}
      customSlots={[null, null, null]}
      onDraftChange={onDraftChange}
      onSave={vi.fn()}
      onCancel={vi.fn()}
      onSaveCustomSlot={vi.fn()}
      onClearCustomSlot={vi.fn()}
    />)

    expect(screen.queryByRole('switch', { name: 'Retain item order' })).toBeNull()
    expect(screen.getByRole('button', { name: 'disabled' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'enabled' }))
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ retainCraftOrder: true }))
  })

  test('cancels when a pointer press lands outside the editor', () => {
    const { onCancel } = renderEditor(newItemSetDraft())

    fireEvent.pointerDown(document.body)

    expect(onCancel).toHaveBeenCalledOnce()
  })

  test('keeps the stacked editor open until Cancel or its close button is used', () => {
    const originalMatchMedia = window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: true }),
    })
    const { onCancel } = renderEditor(newItemSetDraft())

    fireEvent.pointerDown(document.body)
    expect(onCancel).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close item set editor' }))
    expect(onCancel).toHaveBeenCalledOnce()

    Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia })
  })

  test('closes an open picker before cancelling the editor on a later outside press', async () => {
    const user = userEvent.setup()
    const { onCancel } = renderEditor(newItemSetDraft())

    await user.click(screen.getByRole('button', { name: 'Add inventory items' }))
    fireEvent.pointerDown(document.body)
    fireEvent.click(document.body)
    expect(screen.queryByRole('list', { name: 'Inventory results' })).toBeNull()
    expect(onCancel).not.toHaveBeenCalled()

    fireEvent.pointerDown(document.body)
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
