import type { CustomInventoryPreset, InventoryItem, InventoryPreset } from '../domain/types'
import { ItemPicker } from './ItemPicker'

interface InventoryPanelProps {
  items: ReadonlyMap<string, InventoryItem>
  inventoryItemIds: readonly string[]
  inventoryName: string
  builtInPresets: readonly InventoryPreset[]
  customSlots: ReadonlyArray<CustomInventoryPreset | null>
  onInventoryItemIdsChange: (itemIds: string[]) => void
  onInventoryNameChange: (name: string) => void
  onLoadPreset: (preset: Pick<InventoryPreset, 'name' | 'itemIds'>) => void
  onSaveCustomSlot: (index: number) => void
  onLoadCustomSlot: (index: number) => void
  onClearCustomSlot: (index: number) => void
}

export function InventoryPanel({
  items,
  inventoryItemIds,
  inventoryName,
  builtInPresets,
  customSlots,
  onInventoryItemIdsChange,
  onInventoryNameChange,
  onLoadPreset,
  onSaveCustomSlot,
  onLoadCustomSlot,
  onClearCustomSlot,
}: InventoryPanelProps) {
  return <section className="tool-panel inventory-panel" aria-labelledby="inventory-heading">
    <div className="tool-panel__heading">
      <p className="eyebrow">Infinite supply</p>
      <h2 id="inventory-heading">Inventory</h2>
      <p>Select exact item IDs. Items are never derived from one another.</p>
    </div>

    <label className="field-label">
      Inventory name
      <input value={inventoryName} onChange={(event) => onInventoryNameChange(event.target.value)} />
    </label>

    {builtInPresets.length > 0 && <div className="preset-row" aria-label="Built-in inventory presets">
      {builtInPresets.map((preset) => <button key={preset.id} type="button" onClick={() =>
        onLoadPreset({ name: preset.name, itemIds: [...preset.itemIds] })
      }>
        Load {preset.name}
      </button>)}
    </div>}

    <ItemPicker
      items={items}
      label="Search inventory items"
      selectedItemIds={inventoryItemIds}
      onSelectedItemIdsChange={onInventoryItemIdsChange}
    />

    <p className="selection-count">{inventoryItemIds.length} selected item{inventoryItemIds.length === 1 ? '' : 's'}</p>
    {inventoryItemIds.length > 0 && <ul className="selected-id-list" aria-label="Selected inventory item IDs">
      {inventoryItemIds.map((itemId) => <li key={itemId}><code>{itemId}</code></li>)}
    </ul>}

    <div className="custom-slots" aria-label="Custom inventory slots">
      <h3>Custom slots</h3>
      {customSlots.map((slot, index) => <div className="custom-slot" key={index}>
        <span>Slot {index + 1}{slot ? `: ${slot.name}` : ': empty'}</span>
        <div>
          <button type="button" onClick={() => onSaveCustomSlot(index)}>Save slot {index + 1}</button>
          {slot && <>
            <button type="button" onClick={() => onLoadCustomSlot(index)}>Load slot {index + 1}</button>
            <button type="button" onClick={() => onClearCustomSlot(index)}>Clear slot {index + 1}</button>
          </>}
        </div>
      </div>)}
    </div>
  </section>
}
