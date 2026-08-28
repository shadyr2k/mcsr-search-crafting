import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import type { CustomInventoryPreset, InventoryPreset, SearchItem } from '../domain/types'
import { InventoryPanel } from './InventoryPanel'

afterEach(cleanup)

const items = new Map<string, SearchItem>([
  ['minecraft:oak_log', { id: 'minecraft:oak_log', name: 'Oak Log', confidence: 'exact', searchLines: [] }],
  ['minecraft:oak_planks', { id: 'minecraft:oak_planks', name: 'Oak Planks', confidence: 'exact', searchLines: [] }],
])

function PanelHarness({ presets = [] }: { presets?: readonly InventoryPreset[] }) {
  const [inventory, setInventory] = useState<string[]>([])
  const [name, setName] = useState('My inventory')
  const [slots, setSlots] = useState<Array<CustomInventoryPreset | null>>([null, null, null])

  return <InventoryPanel
    items={items}
    inventoryItemIds={inventory}
    inventoryName={name}
    customSlots={slots}
    builtInPresets={presets}
    onInventoryItemIdsChange={setInventory}
    onInventoryNameChange={setName}
    onLoadPreset={(preset) => {
      setName(preset.name)
      setInventory([...preset.itemIds])
    }}
    onSaveCustomSlot={(index) => setSlots((current) => current.map((slot, slotIndex) =>
      slotIndex === index ? { name, itemIds: inventory } : slot,
    ))}
    onLoadCustomSlot={(index) => {
      const slot = slots[index]
      if (slot) {
        setName(slot.name)
        setInventory([...slot.itemIds])
      }
    }}
    onClearCustomSlot={(index) => setSlots((current) => current.map((slot, slotIndex) =>
      slotIndex === index ? null : slot,
    ))}
  />
}

describe('InventoryPanel', () => {
  test('searches and selects explicit item IDs without deriving oak planks from oak logs', () => {
    render(<PanelHarness />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search inventory items' }), {
      target: { value: 'oak log' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /oak log/i }))

    expect(within(screen.getByRole('list', { name: 'Selected inventory item IDs' })).getByText('minecraft:oak_log')).toBeTruthy()
    expect(screen.queryByText('minecraft:oak_planks')).toBeNull()
    expect(screen.getByText('1 selected item')).toBeTruthy()
  })

  test('loads a built-in preset into an editable inventory copy', () => {
    render(<PanelHarness presets={[{ id: 'wood', name: 'Wood start', itemIds: ['minecraft:oak_log'] }]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Load Wood start' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search inventory items' }), {
      target: { value: 'oak planks' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /oak planks/i }))

    expect(screen.getByText('2 selected items')).toBeTruthy()
  })

  test('names, saves, loads, and clears each custom slot', () => {
    render(<PanelHarness />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Inventory name' }), {
      target: { value: 'Logs only' },
    })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search inventory items' }), {
      target: { value: 'oak log' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /oak log/i }))

    for (const slot of [1, 2, 3]) {
      fireEvent.click(screen.getByRole('button', { name: `Save slot ${slot}` }))
      expect(screen.getByRole('button', { name: `Load slot ${slot}` })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: `Load slot ${slot}` }))
      fireEvent.click(screen.getByRole('button', { name: `Clear slot ${slot}` }))
      expect(screen.queryByRole('button', { name: `Load slot ${slot}` })).toBeNull()
    }
  })
})
