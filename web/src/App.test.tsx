import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import App from './App'

const inventorySlotsKey = 'mcsr.inventory-slots.v1'
const targetWorkspaceKey = 'mcsr.target-workspace.v1'

const itemsPayload = {
  schema_version: 1,
  items: {
    'minecraft:stick': { name: 'Stick', confidence: 'exact', search_lines: [{ source: 'name', text: 'Stick' }] },
    'minecraft:iron_sword': { name: 'Iron Sword', confidence: 'exact', search_lines: [{ source: 'name', text: 'Iron Sword' }] },
  },
}

const recipesPayload = {
  schema_version: 1,
  recipes: [
    {
      id: 'stick', output_item_id: 'minecraft:stick', output_count: 4,
      ingredient_slots: [{ accepted_items: ['minecraft:oak_planks'] }], fits_2x2: true, fits_3x3: true,
    },
    {
      id: 'sword', output_item_id: 'minecraft:iron_sword', output_count: 1,
      ingredient_slots: [{ accepted_items: ['minecraft:iron_ingot'] }], fits_2x2: false, fits_3x3: true,
    },
  ],
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('App persistence', () => {
  test('normalizes an incompatible saved 2x2 workspace before autosaving without changing inventory slots', async () => {
    const inventorySlots = JSON.stringify({
      schemaVersion: 1,
      slots: [{ name: 'Keep me', itemIds: ['minecraft:oak_log'] }, null, null],
    })
    localStorage.setItem(inventorySlotsKey, inventorySlots)
    localStorage.setItem(targetWorkspaceKey, JSON.stringify({
      schemaVersion: 1,
      entries: [{
        id: 'saved-set', targetIds: ['minecraft:iron_sword'], enabled: true, gridSize: 2, order: 0,
      }],
    }))
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.includes('search-items') ? itemsPayload : recipesPayload,
    })))

    render(<App />)

    await screen.findByRole('heading', { name: 'Target sets' })
    await waitFor(() => expect(JSON.parse(localStorage.getItem(targetWorkspaceKey)!).entries[0].gridSize).toBe(3))

    expect(localStorage.getItem(inventorySlotsKey)).toBe(inventorySlots)
    expect(screen.getByRole('radio', { name: '3x3 grid' })).toHaveProperty('checked', true)
  })

  test('shows both inventory and target workspace persistence warnings', async () => {
    localStorage.setItem(inventorySlotsKey, '{invalid')
    localStorage.setItem(targetWorkspaceKey, '{invalid')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.includes('search-items') ? itemsPayload : recipesPayload,
    })))

    render(<App />)

    const warning = await screen.findByRole('alert')
    expect(warning.textContent).toMatch(/inventory-slots/i)
    expect(warning.textContent).toMatch(/target-workspace/i)
  })
})
