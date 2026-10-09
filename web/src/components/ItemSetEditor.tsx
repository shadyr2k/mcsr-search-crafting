import { useEffect, useRef, useState } from 'react'

import type { IconManifest } from '../data/iconManifest'
import type { CustomInventoryPreset, GeneratedData, ItemSetDraft } from '../domain/types'
import { applyInventoryPreset, normalizeDraftGrid, validateItemSetDraft } from '../workspace/entryDraft'
import { GridSizeSwitch } from './GridSizeSwitch'
import { ItemIcon } from './ItemIcon'
import { ItemPicker } from './ItemPicker'
import { SavedInventories } from './SavedInventories'
import { SegmentedControl } from './SegmentedControl'
import { isScrollbarPointer } from './outsidePointer'
import './ItemSetEditor.css'

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
  title?: string
  saveLabel?: string
  saveAriaLabel?: string
  cancelLabel?: string
  showDismiss?: boolean
  cancelOnOutsidePointer?: boolean
  saveNextToGoals?: boolean
  compactLayout?: boolean
  hidePresetIcons?: boolean
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
  title,
  saveLabel,
  saveAriaLabel,
  cancelLabel,
  showDismiss = true,
  cancelOnOutsidePointer = true,
  saveNextToGoals = false,
  compactLayout = false,
  hidePresetIcons = false,
}: ItemSetEditorProps) {
  const { draft } = state
  const editorRef = useRef<HTMLElement>(null)
  const [openPickers, setOpenPickers] = useState({ goals: false, inventory: false })
  const valid = validateItemSetDraft(draft, data.items, data.inventoryItems)
  const inventoryPresets = [
    ...[...data.presets.values()].sort((left, right) => left.name.localeCompare(right.name)).map((preset) => ({
      ...preset,
      iconItemId: presetIconId(preset.id),
    })),
  ]

  useEffect(() => {
    function cancelOutsideEditor(event: PointerEvent) {
      if (!cancelOnOutsidePointer) return
      if (window.matchMedia?.('(max-width: 72rem)').matches) return
      if (isScrollbarPointer(event)) return
      if (event.target instanceof Node && !editorRef.current?.contains(event.target) && !openPickers.goals && !openPickers.inventory) onCancel()
    }

    document.addEventListener('pointerdown', cancelOutsideEditor)
    return () => document.removeEventListener('pointerdown', cancelOutsideEditor)
  }, [cancelOnOutsidePointer, onCancel, openPickers.goals, openPickers.inventory])

  function updateDraft(update: ItemSetDraft) {
    onDraftChange(normalizeDraftGrid(update, data.recipes))
  }

  function setPickerOpen(picker: 'goals' | 'inventory', open: boolean) {
    setOpenPickers((current) => current[picker] === open ? current : { ...current, [picker]: open })
  }

  function deleteEntry() {
    if (onDelete && window.confirm(`Delete item set ${entryNumber ?? ''}?`)) onDelete()
  }

  const editorTitle = title ?? (state.kind === 'new' ? 'New item set' : 'Edit item set')
  const resolvedSaveLabel = saveLabel ?? 'Save'
  const saveButtonLabel = saveAriaLabel ?? saveLabel ?? 'Save item set'
  const resolvedCancelLabel = cancelLabel ?? 'Cancel'
  const saveAction = <button
    type="button"
    className={"item-set-editor__primary" + (saveNextToGoals ? ' item-set-editor__save-next-to-goals' : '')}
    aria-label={saveButtonLabel}
    onClick={() => onSave({ draft })}
    disabled={!valid}
  >{resolvedSaveLabel}</button>

  return <section ref={editorRef} className={`item-set-editor${saveNextToGoals ? ' item-set-editor--save-next-to-goals' : ''}${compactLayout ? ' item-set-editor--compact' : ''}${hidePresetIcons ? ' item-set-editor--hide-preset-icons' : ''}`} aria-label={title ?? (state.kind === 'new' ? 'New item set' : 'Edit item set')}>
    {showDismiss && <button type="button" className="item-set-editor__dismiss" aria-label="Close item set editor" onClick={onCancel}>×</button>}
    <h2>{editorTitle}</h2>
    <ItemPicker
      items={pickerData?.items ?? data.items}
      label="Goals"
      displayLabel="Target items"
      revealOnAdd
      selectedIds={draft.targetIds}
      preserveSelectionOrder
      manifest={icons}
      className={`item-set-editor__goals${saveNextToGoals ? ' item-picker--main-goals' : ''}`}
      trailingAction={saveNextToGoals ? saveAction : undefined}
      onOpenChange={(open) => setPickerOpen('goals', open)}
      onChange={(targetIds) => updateDraft({ ...draft, targetIds })}
    />
    <section className="item-set-editor__rules" aria-label="Rules">
      <h3>Rules</h3>
      <GridSizeSwitch
        value={draft.gridSize}
        targetIds={draft.targetIds}
        recipes={data.recipes}
        compactLayout={compactLayout}
        segmented
        onChange={(gridSize) => updateDraft({ ...draft, gridSize })}
      />
      <div className="craft-order-switch craft-order-switch--segmented">
        <span className="craft-order-switch__title">retain item order</span>
        <SegmentedControl
          label="Retain item order"
          value={draft.retainCraftOrder === true ? 'enabled' : 'disabled'}
          options={[{ value: 'disabled', label: 'disabled' }, { value: 'enabled', label: 'enabled' }]}
          onChange={(value) => updateDraft({ ...draft, retainCraftOrder: value === 'enabled' })}
        />
      </div>
    </section>
    <div className="item-set-editor__presets" aria-label="Inventory presets">
      <h3>Inventory presets</h3>
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
      displayLabel="Inventory items"
      revealOnAdd
      className="item-set-editor__inventory"
      selectedIds={draft.inventoryItemIds}
      manifest={icons}
      onOpenChange={(open) => setPickerOpen('inventory', open)}
      onChange={(inventoryItemIds) => updateDraft({ ...draft, inventoryItemIds })}
    />
    <SavedInventories
      customSlots={customSlots}
      inventoryItemIds={draft.inventoryItemIds}
      onLoad={(preset) => updateDraft(applyInventoryPreset(draft, preset))}
      onSave={onSaveCustomSlot}
      onDelete={onClearCustomSlot}
    />
    <div className="item-set-editor__actions">
      <div className="item-set-editor__commit-actions">
        {!saveNextToGoals && saveAction}
        <button type="button" onClick={onCancel}>{resolvedCancelLabel}</button>
      </div>
      {state.kind === 'existing' && onDelete && <button type="button" className="item-set-editor__delete" aria-label="Delete item set" onClick={deleteEntry}>Delete</button>}
    </div>
  </section>
}
