import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

import type { CustomInventoryPreset } from '../domain/types'
import { SavedInventories } from './SavedInventories'

afterEach(cleanup)

const oldSave = { name: 'Overworld run', itemIds: ['minecraft:stone'] }
const currentItems = ['minecraft:stick', 'minecraft:bucket', 'minecraft:stick']

function setup(initialSlots: Array<CustomInventoryPreset | null> = [oldSave, null, null]) {
  const onSave = vi.fn()
  const onDelete = vi.fn()
  const onLoad = vi.fn()
  function Harness() {
    const [slots, setSlots] = useState(initialSlots)
    return <SavedInventories
      customSlots={slots}
      inventoryItemIds={currentItems}
      onLoad={onLoad}
      onSave={(index, preset) => {
        onSave(index, preset)
        setSlots((current) => current.map((slot, slotIndex) => slotIndex === index ? preset : slot))
      }}
      onDelete={(index) => {
        onDelete(index)
        setSlots((current) => current.map((slot, slotIndex) => slotIndex === index ? null : slot))
      }}
    />
  }
  render(<Harness />)
  return { user: userEvent.setup(), onSave, onDelete, onLoad }
}

describe('SavedInventories', () => {
  test('loads from the selector and keeps management beside the selected save', async () => {
    const { user, onLoad } = setup()
    expect(screen.queryByRole('button', { name: 'Rename saved inventory' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Manage/ })).toBeNull()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Saved inventory' }), '0')
    expect(onLoad).toHaveBeenCalledWith(oldSave)
    expect(screen.getByRole('button', { name: 'Rename saved inventory' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Delete saved inventory' })).toBeVisible()
  })

  test('creates a distinctly named save in an empty slot without overwriting the selection', async () => {
    const { user, onSave } = setup()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Saved inventory' }), '0')
    await user.click(screen.getByRole('button', { name: 'Save as new' }))
    const input = screen.getByRole('textbox', { name: 'New inventory name' })
    expect(screen.getByRole('button', { name: 'Create saved inventory' })).toBeDisabled()
    await user.type(input, ' OVERWORLD RUN ')
    expect(screen.getByRole('button', { name: 'Create saved inventory' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('already uses this name')
    await user.clear(input)
    await user.type(input, ' New route ')
    await user.click(screen.getByRole('button', { name: 'Create saved inventory' }))
    expect(onSave).toHaveBeenCalledExactlyOnceWith(1, {
      name: 'New route', itemIds: ['minecraft:bucket', 'minecraft:stick'],
    })
    expect(screen.getByRole('option', { name: 'Overworld run' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Saved inventory' })).toHaveValue('1')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  test('renames inline without replacing the saved items with the current inventory', async () => {
    const { user, onSave } = setup()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Saved inventory' }), '0')
    await user.click(screen.getByRole('button', { name: 'Rename saved inventory' }))
    const input = screen.getByRole('textbox', { name: 'Saved inventory name' })
    await user.clear(input)
    await user.type(input, 'Renamed run{Enter}')
    expect(onSave).toHaveBeenCalledExactlyOnceWith(0, { ...oldSave, name: 'Renamed run' })
    expect(screen.getByRole('option', { name: 'Renamed run' })).toBeInTheDocument()
  })

  test('updates items explicitly and deletes the selected save without deleting the current inventory', async () => {
    const { user, onSave, onDelete, onLoad } = setup()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Saved inventory' }), '0')
    await user.click(screen.getByRole('button', { name: 'Update saved inventory items' }))
    expect(onSave).toHaveBeenCalledExactlyOnceWith(0, {
      name: oldSave.name, itemIds: ['minecraft:bucket', 'minecraft:stick'],
    })
    expect(screen.getByRole('button', { name: 'Update saved inventory items' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Delete saved inventory' }))
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(0)
    expect(onLoad).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Rename saved inventory' })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Saved inventory' })).toHaveValue('')
  })

  test('explains full slots and enables creating a new save after a deletion', async () => {
    const { user } = setup([oldSave, { ...oldSave, name: 'Two' }, { ...oldSave, name: 'Three' }])
    expect(screen.getByRole('button', { name: 'Save as new' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('All 3 saved inventory slots are in use')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Saved inventory' }), '1')
    await user.click(screen.getByRole('button', { name: 'Delete saved inventory' }))
    expect(screen.getByRole('button', { name: 'Save as new' })).toBeEnabled()
  })

  test('canceling an inline name edit leaves the save untouched', async () => {
    const { user, onSave } = setup()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Saved inventory' }), '0')
    await user.click(screen.getByRole('button', { name: 'Rename saved inventory' }))
    await user.type(screen.getByRole('textbox', { name: 'Saved inventory name' }), 'edited{Escape}')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('option', { name: 'Overworld run' })).toBeInTheDocument()
  })
})
