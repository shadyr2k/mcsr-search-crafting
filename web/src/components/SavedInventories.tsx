import { useId, useRef, useState } from 'react'

import type { CustomInventoryPreset } from '../domain/types'
import './SavedInventories.css'

interface SavedInventoriesProps {
  customSlots: Array<CustomInventoryPreset | null>
  inventoryItemIds: readonly string[]
  onLoad: (preset: CustomInventoryPreset) => void
  onSave: (index: number, preset: CustomInventoryPreset) => void
  onDelete: (index: number) => void
}

function normalizedIds(ids: readonly string[]) {
  return [...new Set(ids)].sort()
}

export function SavedInventories({ customSlots, inventoryItemIds, onLoad, onSave, onDelete }: SavedInventoriesProps) {
  const [selectedSlot, setSelectedSlot] = useState<number | undefined>()
  const [editing, setEditing] = useState<'new' | 'rename' | null>(null)
  const [name, setName] = useState('')
  const newButtonRef = useRef<HTMLButtonElement>(null)
  const renameButtonRef = useRef<HTMLButtonElement>(null)
  const nameHelpId = useId()
  const selectedPreset = selectedSlot === undefined ? null : customSlots[selectedSlot]
  const firstEmptySlot = customSlots.findIndex((slot) => slot === null)
  const trimmedName = name.trim()
  const duplicateName = customSlots.some((slot, index) => slot
    && !(editing === 'rename' && index === selectedSlot)
    && slot.name.trim().toLocaleLowerCase() === trimmedName.toLocaleLowerCase())
  const validName = trimmedName.length > 0 && !duplicateName
  const canSubmit = validName && (editing === 'new' ? firstEmptySlot >= 0 : !!selectedPreset)
  const currentIds = normalizedIds(inventoryItemIds)
  const itemsChanged = !!selectedPreset
    && JSON.stringify(normalizedIds(selectedPreset.itemIds)) !== JSON.stringify(currentIds)

  function dismissNameEditor() {
    if (editing === 'new') newButtonRef.current?.focus()
    else renameButtonRef.current?.focus()
    setEditing(null)
  }

  function saveName() {
    if (!canSubmit) return
    if (editing === 'new') {
      onSave(firstEmptySlot, { name: trimmedName, itemIds: currentIds })
      setSelectedSlot(firstEmptySlot)
    } else if (selectedSlot !== undefined && selectedPreset) {
      onSave(selectedSlot, { ...selectedPreset, name: trimmedName })
    }
    dismissNameEditor()
  }

  return <section className="custom-slots item-set-editor__saved saved-inventories" aria-label="Custom inventory slots">
    <h3>Saved inventories</h3>
    <div className="saved-inventories__controls">
      <select aria-label="Saved inventory" value={selectedPreset ? selectedSlot : ''} onChange={(event) => {
        const index = Number(event.target.value)
        const preset = customSlots[index]
        setSelectedSlot(index)
        setEditing(null)
        if (preset) onLoad(preset)
      }}>
        <option value="" disabled>Choose a saved inventory</option>
        {customSlots.map((preset, index) => preset && <option key={index} value={index}>
          {preset.name || `custom inventory ${index + 1}`}
        </option>)}
      </select>
      {selectedPreset && <>
        <button ref={renameButtonRef} type="button" aria-label="Rename saved inventory" aria-expanded={editing === 'rename'} onClick={() => {
          setName(selectedPreset.name)
          setEditing('rename')
        }}>Rename</button>
        <button type="button" className="saved-inventories__delete" aria-label="Delete saved inventory" onClick={() => {
          if (selectedSlot !== undefined) onDelete(selectedSlot)
          setSelectedSlot(undefined)
          setEditing(null)
        }}>Delete</button>
      </>}
    </div>
    <div className="saved-inventories__actions">
      <button ref={newButtonRef} type="button" disabled={firstEmptySlot < 0} aria-expanded={editing === 'new'} onClick={() => {
        setName('')
        setEditing('new')
      }}>Save as new</button>
      {selectedPreset && <button type="button" aria-label="Update saved inventory items" disabled={!itemsChanged} onClick={() => {
        if (selectedSlot !== undefined) onSave(selectedSlot, { ...selectedPreset, itemIds: currentIds })
      }}>Update items</button>}
    </div>
    {editing && <form className="saved-inventories__name-editor" onSubmit={(event) => {
      event.preventDefault()
      saveName()
    }} onKeyDown={(event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        dismissNameEditor()
      }
    }}>
      <input
        key={editing}
        autoFocus
        aria-label={editing === 'new' ? 'New inventory name' : 'Saved inventory name'}
        aria-describedby={nameHelpId}
        aria-invalid={trimmedName.length > 0 && duplicateName}
        placeholder="Inventory name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" aria-label={editing === 'new' ? 'Create saved inventory' : 'Save inventory name'} disabled={!canSubmit}>
        {editing === 'new' ? 'Create' : 'Save name'}
      </button>
      <button type="button" aria-label="Cancel inventory name edit" onClick={dismissNameEditor}>Cancel</button>
      <p id={nameHelpId} className="saved-inventories__hint" role="status">
        {trimmedName && duplicateName ? 'A saved inventory already uses this name.' : 'Enter a name for this saved inventory.'}
      </p>
    </form>}
    {firstEmptySlot < 0 && <p className="saved-inventories__hint" role="status">
      All {customSlots.length} saved inventory slots are in use. Delete a save to create another.
    </p>}
  </section>
}
