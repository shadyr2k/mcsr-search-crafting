import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import App from './App'

const workspaceKey = 'mcsr.target-workspace.v1'

function stubData(icons: Record<string, string> = { 'minecraft:stick': 'minecraft/stick.png', 'minecraft:bucket': 'minecraft/bucket.png' }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => {
    if (url.includes('manifest')) return { schema_version: 1, minecraft_version: '1.16.1', icon_width: 16, icon_height: 16, icons }
    if (url.includes('search-items')) return { schema_version: 3, items: { 'minecraft:stick': { name: 'Stick', confidence: 'exact', search_lines: [{ source: 'name', text: 'Stick' }] } } }
    if (url.includes('inventory-items')) return { schema_version: 3, items: { 'minecraft:bucket': { name: 'Bucket' } } }
    if (url.includes('inventory-presets')) return { schema_version: 3, presets: [] }
    if (url.includes('crafting-recipes')) return { schema_version: 3, recipes: [] }
    return { schema_version: 3, collections: [] }
  } })))
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

describe('App workspace composition', () => {
  test('opens a draft editor and persists a new set only after Save', async () => {
    stubData()
    render(<App />)
    await screen.findByRole('button', { name: 'Add item set' })
    fireEvent.click(screen.getByRole('button', { name: 'Add item set' }))
    expect(screen.getAllByRole('region', { name: 'New item set' })).toHaveLength(2)
    expect(JSON.parse(localStorage.getItem(workspaceKey) ?? '{"entries":[]}').entries).toEqual([])
    fireEvent.click(screen.getByRole('searchbox', { name: 'Search Goals' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Stick minecraft:stick' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save item set' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem(workspaceKey)!).entries).toEqual([
      expect.objectContaining({ targetIds: ['minecraft:stick'], inventoryItemIds: [] }),
    ]))
  })

  test('reports an icon manifest coverage error as blocking', async () => {
    stubData({})
    render(<App />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/icon manifest/i)
  })

  test('saves an edited inventory without persisting the draft-only source entry ID', async () => {
    localStorage.setItem(workspaceKey, JSON.stringify({
      schemaVersion: 2,
      entries: [{
        id: 'saved', targetIds: ['minecraft:stick'], inventoryItemIds: [], enabled: true, gridSize: 3, order: 0,
      }],
    }))
    stubData()
    render(<App />)
    await screen.findByRole('button', { name: 'Edit item set 1' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit item set 1' }))
    fireEvent.click(screen.getByRole('searchbox', { name: 'Search Inventory' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bucket minecraft:bucket' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save item set' }))

    await waitFor(() => expect(JSON.parse(localStorage.getItem(workspaceKey)!).entries).toEqual([
      expect.objectContaining({ id: 'saved', inventoryItemIds: ['minecraft:bucket'] }),
    ]))
    expect(JSON.parse(localStorage.getItem(workspaceKey)!).entries[0]).not.toHaveProperty('sourceEntryId')
    expect(screen.getByRole('region', { name: 'Calculated searches' })).toBeTruthy()
  })
})
