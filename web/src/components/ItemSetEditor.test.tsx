import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { parseIconManifest } from '../data/iconManifest'
import type { GeneratedData, ItemSetDraft, SearchItem } from '../domain/types'
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

    expect(screen.getByPlaceholderText('custom inventory 1')).toBeTruthy()
    await user.type(screen.getByLabelText('Custom inventory 1'), 'Quick start')
    await user.click(screen.getByRole('button', { name: 'Save custom inventory 1' }))
    expect(onSaveCustomSlot).toHaveBeenCalledWith(0, { name: 'Quick start', itemIds: ['minecraft:bucket'] })
  })

  test('shows a Minecraft icon beside every built-in and custom preset name', () => {
    render(<ItemSetEditor
      state={{ kind: 'new', draft: newItemSetDraft() }}
      data={data}
      icons={icons}
      customSlots={[{ name: 'Fast route', itemIds: ['minecraft:bucket'] }, null, null]}
      onDraftChange={vi.fn()}
      onSave={vi.fn()}
      onCancel={vi.fn()}
      onSaveCustomSlot={vi.fn()}
      onClearCustomSlot={vi.fn()}
    />)

    expect(screen.getByRole('img', { name: 'Overworld preset icon' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Nether (Bastion) preset icon' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Nether (Fortress) preset icon' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Command block' })).toBeTruthy()
  })

  test('toggles retained craft order without changing the selected target order', () => {
    const draft = { ...newItemSetDraft(), targetIds: ['minecraft:stick'] }
    const { onDraftChange } = renderEditor(draft)

    fireEvent.click(screen.getByRole('switch', { name: 'Retain item order' }))

    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({
      targetIds: ['minecraft:stick'],
      retainCraftOrder: true,
    }))
  })

  test('labels the item-order switch and presents both states as chips', () => {
    renderEditor(newItemSetDraft())

    expect(screen.getByText('retain item order').className).toContain('craft-order-switch__title')
    expect(screen.getByText('disabled').className).toContain('craft-order-switch__label')
    expect(screen.getByText('enabled').className).toContain('craft-order-switch__label')
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

    await user.click(screen.getByRole('searchbox', { name: 'Search Inventory' }))
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('list', { name: 'Inventory results' })).toBeNull()
    expect(onCancel).not.toHaveBeenCalled()

    fireEvent.pointerDown(document.body)
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
