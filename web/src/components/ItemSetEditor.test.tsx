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
  presets: new Map([['overworld', { id: 'overworld', name: 'Overworld', itemIds: ['minecraft:bucket'] }]]),
}
const icons = parseIconManifest({
  schema_version: 1,
  minecraft_version: '1.16.1',
  icon_width: 16,
  icon_height: 16,
  icons: { 'minecraft:bucket': 'minecraft/bucket.png', 'minecraft:stick': 'minecraft/stick.png' },
})

function renderEditor(draft: ItemSetDraft, onDraftChange = vi.fn(), onSave = vi.fn()) {
  const onSaveCustomSlot = vi.fn()
  return {
    onDraftChange,
    onSave,
    onSaveCustomSlot,
    ...render(<ItemSetEditor
      state={{ kind: 'new', draft }}
      data={data}
      icons={icons}
      customSlots={[null, null, null]}
      onDraftChange={onDraftChange}
      onSave={onSave}
      onCancel={vi.fn()}
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

    await user.selectOptions(screen.getByLabelText('Inventory preset'), 'overworld')
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

    await user.clear(screen.getByLabelText('Custom slot 1 name'))
    await user.type(screen.getByLabelText('Custom slot 1 name'), 'Quick start')
    await user.click(screen.getByRole('button', { name: 'Save custom slot 1' }))
    expect(onSaveCustomSlot).toHaveBeenCalledWith(0, { name: 'Quick start', itemIds: ['minecraft:bucket'] })
  })
})
