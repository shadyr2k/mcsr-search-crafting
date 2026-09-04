import { useState } from 'react'

import type { IconManifest } from '../data/iconManifest'
import type { CustomInventoryPreset, GeneratedData, ItemSetDraft } from '../domain/types'
import { applyInventoryPreset, normalizeDraftGrid, validateItemSetDraft } from '../workspace/entryDraft'
import { GridSizeSwitch } from './GridSizeSwitch'
import { ItemPicker } from './ItemPicker'

export type ItemSetEditorState = {
  kind: 'new' | 'existing'
  draft: ItemSetDraft
}

export interface ItemSetEditorCommit {
  draft: ItemSetDraft
}

interface ItemSetEditorProps {
  state: ItemSetEditorState
  data: GeneratedData
  icons: IconManifest
  customSlots: Array<CustomInventoryPreset | null>
  onDraftChange: (draft: ItemSetDraft) => void
  onSave: (commit: ItemSetEditorCommit) => void
  onCancel: () => void
  onDelete?: () => void
  onSaveCustomSlot: (index: number, preset: CustomInventoryPreset) => void
  onClearCustomSlot: (index: number) => void
  entryNumber?: number
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort()
}

export function ItemSetEditor({
  state,
  data,
  icons,
  customSlots,
  onDraftChange,
  onSave,
  onCancel,
  onDelete,
  onSaveCustomSlot,
  onClearCustomSlot,
  entryNumber,
}: ItemSetEditorProps) {
  const { draft } = state
  const [customSlotNames, setCustomSlotNames] = useState(() => customSlots.map(
    (slot, index) => slot?.name ?? `Custom ${index + 1}`,
  ))
  const valid = validateItemSetDraft(draft, data.items, data.inventoryItems)
  const inventoryPresets = [
    ...[...data.presets.values()].sort((left, right) => left.name.localeCompare(right.name)),
    ...customSlots.flatMap((preset, index) => preset ? [{ id: `custom-${index}`, name: preset.name, itemIds: preset.itemIds }] : []),
  ]

  function updateDraft(update: ItemSetDraft) {
    onDraftChange(normalizeDraftGrid(update, data.recipes))
  }

  function saveCustomSlot(index: number) {
    const fallbackName = customSlots[index]?.name ?? `Custom ${index + 1}`
    const name = customSlotNames[index]?.trim() || fallbackName
    onSaveCustomSlot(index, { name, itemIds: unique(draft.inventoryItemIds) })
  }

  function deleteEntry() {
    if (onDelete && window.confirm(`Delete item set ${entryNumber ?? ''}?`)) onDelete()
  }

  return <section className="item-set-editor" aria-label={state.kind === 'new' ? 'New item set' : 'Edit item set'}>
    <h2>{state.kind === 'new' ? 'New item set' : 'Edit item set'}</h2>
    <ItemPicker
      items={data.items}
      label="Goals"
      selectedIds={draft.targetIds}
      manifest={icons}
      onChange={(targetIds) => updateDraft({ ...draft, targetIds })}
    />
    <GridSizeSwitch
      value={draft.gridSize}
      targetIds={draft.targetIds}
      recipes={data.recipes}
      onChange={(gridSize) => updateDraft({ ...draft, gridSize })}
    />
    <label>
      Inventory preset
      <select
        aria-label="Inventory preset"
        defaultValue=""
        onChange={(event) => {
          const preset = inventoryPresets.find((candidate) => candidate.id === event.target.value)
          if (preset) updateDraft(applyInventoryPreset(draft, preset))
        }}
      >
        <option value="">Choose a preset</option>
        {inventoryPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
      </select>
    </label>
    <ItemPicker
      items={data.inventoryItems}
      label="Inventory"
      selectedIds={draft.inventoryItemIds}
      manifest={icons}
      onChange={(inventoryItemIds) => updateDraft({ ...draft, inventoryItemIds })}
    />
    <div className="custom-slots" aria-label="Custom inventory slots">
      {customSlots.map((slot, index) => <div key={index}>
        <label>
          Custom slot {index + 1} name
          <input
            value={customSlotNames[index] ?? ''}
            onChange={(event) => setCustomSlotNames((current) => current.map(
              (name, nameIndex) => nameIndex === index ? event.target.value : name,
            ))}
          />
        </label>
        <button type="button" onClick={() => saveCustomSlot(index)}>Save custom slot {index + 1}</button>
        {slot && <button type="button" onClick={() => onClearCustomSlot(index)}>Clear custom slot {index + 1}</button>}
      </div>)}
    </div>
    <div>
      <button type="button" onClick={() => onSave({ draft })} disabled={!valid}>Save item set</button>
      <button type="button" onClick={onCancel}>Cancel</button>
      {state.kind === 'existing' && onDelete && <button type="button" onClick={deleteEntry}>Delete item set</button>}
    </div>
  </section>
}
