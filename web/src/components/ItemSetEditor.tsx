import { useEffect, useRef, useState } from 'react'

import type { IconManifest } from '../data/iconManifest'
import type { CustomInventoryPreset, GeneratedData, ItemSetDraft } from '../domain/types'
import { applyInventoryPreset, normalizeDraftGrid, validateItemSetDraft } from '../workspace/entryDraft'
import { GridSizeSwitch } from './GridSizeSwitch'
import { ItemIcon } from './ItemIcon'
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
  pickerData?: Pick<GeneratedData, 'items' | 'inventoryItems'>
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

function presetIconId(presetId: string): string | undefined {
  if (presetId === 'overworld') return 'minecraft:chest'
  if (presetId === 'nether-bastion') return 'minecraft:gold_block'
  if (presetId === 'nether-fortress') return 'minecraft:blaze_rod'
  return undefined
}

export function ItemSetEditor({
  state,
  data,
  pickerData,
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
  const editorRef = useRef<HTMLElement>(null)
  const [customSlotNames, setCustomSlotNames] = useState(() => customSlots.map((slot) => slot?.name ?? ''))
  const [openPickers, setOpenPickers] = useState({ goals: false, inventory: false })
  const valid = validateItemSetDraft(draft, data.items, data.inventoryItems)
  const inventoryPresets = [
    ...[...data.presets.values()].sort((left, right) => left.name.localeCompare(right.name)).map((preset) => ({
      ...preset,
      iconItemId: presetIconId(preset.id),
    })),
    ...customSlots.flatMap((preset, index) => preset ? [{
      id: `custom-${index}`,
      name: preset.name || `custom inventory ${index + 1}`,
      itemIds: preset.itemIds,
      iconItemId: undefined,
    }] : []),
  ]

  useEffect(() => {
    function cancelOutsideEditor(event: PointerEvent) {
      if (event.target instanceof Node && !editorRef.current?.contains(event.target) && !openPickers.goals && !openPickers.inventory) onCancel()
    }

    document.addEventListener('pointerdown', cancelOutsideEditor)
    return () => document.removeEventListener('pointerdown', cancelOutsideEditor)
  }, [onCancel, openPickers.goals, openPickers.inventory])

  function updateDraft(update: ItemSetDraft) {
    onDraftChange(normalizeDraftGrid(update, data.recipes))
  }

  function setPickerOpen(picker: 'goals' | 'inventory', open: boolean) {
    setOpenPickers((current) => current[picker] === open ? current : { ...current, [picker]: open })
  }

  function saveCustomSlot(index: number) {
    const name = customSlotNames[index]?.trim() ?? ''
    onSaveCustomSlot(index, { name, itemIds: unique(draft.inventoryItemIds) })
  }

  function clearCustomSlot(index: number) {
    onClearCustomSlot(index)
    setCustomSlotNames((current) => current.map((name, nameIndex) => nameIndex === index ? '' : name))
  }

  function deleteEntry() {
    if (onDelete && window.confirm(`Delete item set ${entryNumber ?? ''}?`)) onDelete()
  }

  return <section ref={editorRef} className="item-set-editor" aria-label={state.kind === 'new' ? 'New item set' : 'Edit item set'}>
    <h2>{state.kind === 'new' ? 'New item set' : 'Edit item set'}</h2>
    <ItemPicker
      items={pickerData?.items ?? data.items}
      label="Goals"
      selectedIds={draft.targetIds}
      preserveSelectionOrder
      manifest={icons}
      onOpenChange={(open) => setPickerOpen('goals', open)}
      onChange={(targetIds) => updateDraft({ ...draft, targetIds })}
    />
    <GridSizeSwitch
      value={draft.gridSize}
      targetIds={draft.targetIds}
      recipes={data.recipes}
      onChange={(gridSize) => updateDraft({ ...draft, gridSize })}
    />
    <div className="craft-order-switch">
      <span className="craft-order-switch__title">retain item order</span>
      <span className="craft-order-switch__label">disabled</span>
      <button
        type="button"
        role="switch"
        className="craft-order-switch__control"
        aria-label="Retain item order"
        aria-checked={draft.retainCraftOrder === true}
        onClick={() => updateDraft({ ...draft, retainCraftOrder: draft.retainCraftOrder !== true })}
      >
        <span className="craft-order-switch__thumb" aria-hidden="true" />
      </button>
      <span className="craft-order-switch__label">enabled</span>
    </div>
    <div className="item-set-editor__presets" aria-label="Inventory presets">
      <span>Inventory preset</span>
      <div className="item-set-editor__preset-grid">
        {inventoryPresets.map((preset) => <button
          key={preset.id}
          type="button"
          aria-label={`Use inventory preset ${preset.name}`}
          onClick={() => updateDraft(applyInventoryPreset(draft, preset))}
        >
          {preset.iconItemId
            ? <ItemIcon itemId={preset.iconItemId} name={`${preset.name} preset icon`} manifest={icons} className="item-set-editor__preset-icon" />
            : <span className="item-set-editor__preset-icon item-set-editor__preset-icon--command-block" role="img" aria-label="Command block" title="Command block" />}
          <span>{preset.name}</span>
        </button>)}
      </div>
    </div>
    <ItemPicker
      items={pickerData?.inventoryItems ?? data.inventoryItems}
      label="Inventory"
      selectedIds={draft.inventoryItemIds}
      manifest={icons}
      onOpenChange={(open) => setPickerOpen('inventory', open)}
      onChange={(inventoryItemIds) => updateDraft({ ...draft, inventoryItemIds })}
    />
    <div className="custom-slots" aria-label="Custom inventory slots">
      {customSlots.map((_, index) => <div key={index} className="custom-slots__row">
        <input
          aria-label={`Custom inventory ${index + 1}`}
          placeholder={`custom inventory ${index + 1}`}
          value={customSlotNames[index] ?? ''}
          onChange={(event) => setCustomSlotNames((current) => current.map(
            (name, nameIndex) => nameIndex === index ? event.target.value : name,
          ))}
        />
        <button type="button" aria-label={`Save custom inventory ${index + 1}`} onClick={() => saveCustomSlot(index)}>Save</button>
        <button type="button" aria-label={`Clear custom inventory ${index + 1}`} onClick={() => clearCustomSlot(index)}>Clear</button>
      </div>)}
    </div>
    <div className="item-set-editor__actions">
      <button type="button" aria-label="Save item set" onClick={() => onSave({ draft })} disabled={!valid}>Save</button>
      <button type="button" onClick={onCancel}>Cancel</button>
      {state.kind === 'existing' && onDelete && <button type="button" aria-label="Delete item set" onClick={deleteEntry}>Delete</button>}
    </div>
  </section>
}
