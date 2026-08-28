import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { WorkspaceResult } from './engine/optimizeWorkspace'

const optimizerControl = vi.hoisted(() => ({
  implementation: undefined as undefined | (() => Promise<WorkspaceResult>),
}))

vi.mock('./engine/optimizeWorkspace', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./engine/optimizeWorkspace')>()
  return {
    ...actual,
    optimizeWorkspace: (...args: Parameters<typeof actual.optimizeWorkspace>) =>
      optimizerControl.implementation?.() ?? actual.optimizeWorkspace(...args),
  }
})

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
  optimizerControl.implementation = undefined
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

  test('re-optimizes the persisted workspace when the controlled inventory changes', async () => {
    localStorage.setItem(targetWorkspaceKey, JSON.stringify({
      schemaVersion: 1,
      entries: [{
        id: 'saved-set', targetIds: ['minecraft:stick'], enabled: true, gridSize: 3, order: 0,
      }],
    }))
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.includes('search-items') ? itemsPayload : {
        ...recipesPayload,
        recipes: [{
          ...recipesPayload.recipes[0],
          ingredient_slots: [{ accepted_items: ['minecraft:stick'] }],
        }],
      },
    })))

    render(<App />)

    expect(await screen.findByText(/Maximum failure score:/)).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search inventory items' }), {
      target: { value: 'stick' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /stick/i }))

    await waitFor(() => expect(screen.getByText('Aggregate score: 0')).toBeTruthy())
    expect(screen.getByRole('region', { name: 'Single-query results for set 1' })).toBeTruthy()
  })

  test('renumbers result labels with the target list after deleting an earlier set', async () => {
    localStorage.setItem(targetWorkspaceKey, JSON.stringify({
      schemaVersion: 1,
      entries: [
        { id: 'first-set', targetIds: ['minecraft:stick'], enabled: true, gridSize: 3, order: 0 },
        { id: 'second-set', targetIds: ['minecraft:stick'], enabled: true, gridSize: 3, order: 1 },
      ],
    }))
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.includes('search-items') ? itemsPayload : recipesPayload,
    })))

    render(<App />)

    expect(await screen.findByRole('region', { name: 'Incomplete result for set 2' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove set 1' }))

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Incomplete result for set 1' })).toBeTruthy()
      expect(screen.queryByRole('region', { name: 'Incomplete result for set 2' })).toBeNull()
    })
    expect(screen.getAllByRole('heading', { name: 'Target set 1' })).toHaveLength(2)
  })

  test('does not publish a stale optimization after a newer inventory result', async () => {
    localStorage.setItem(targetWorkspaceKey, JSON.stringify({
      schemaVersion: 1,
      entries: [{
        id: 'saved-set', targetIds: ['minecraft:stick'], enabled: true, gridSize: 3, order: 0,
      }],
    }))
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.includes('search-items') ? itemsPayload : recipesPayload,
    })))

    const stale: WorkspaceResult = {
      aggregateScore: 10,
      entries: [{
        entryId: 'saved-set', displayIndex: 0, targetIds: ['minecraft:stick'], gridSize: 3,
        visibleItemIds: [], single: [], overlap: [], availableCompleteMethod: null, bestScore: 10,
        incomplete: { matchedTargetIds: [], unmatchedTargetIds: ['minecraft:stick'], score: 10 },
      }],
    }
    const fresh: WorkspaceResult = {
      aggregateScore: 0,
      entries: [{
        entryId: 'saved-set', displayIndex: 0, targetIds: ['minecraft:stick'], gridSize: 3,
        visibleItemIds: ['minecraft:stick'], overlap: [], availableCompleteMethod: 'single', bestScore: 0,
        incomplete: null,
        single: [{
          query: 's', coveredTargetIds: ['minecraft:stick'], junkItemIds: [],
          explanations: [{
            itemId: 'minecraft:stick', source: 'name', line: 'Stick',
            matchedSpan: { start: 0, end: 1, text: 'S' },
          }],
          score: { lengthPenalty: 0, junkPresencePenalty: 0, junkCountPenalty: 0, total: 0 },
        }],
      }],
    }
    let resolveStale!: (result: WorkspaceResult) => void
    let markFirstStarted!: () => void
    const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve })
    const stalePromise = new Promise<WorkspaceResult>((resolve) => { resolveStale = resolve })
    let invocation = 0
    optimizerControl.implementation = () => {
      invocation += 1
      if (invocation === 1) {
        markFirstStarted()
        return stalePromise
      }
      return Promise.resolve(fresh)
    }

    render(<App />)
    await firstStarted
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search inventory items' }), {
      target: { value: 'stick' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /stick/i }))
    expect(await screen.findByText('Aggregate score: 0')).toBeTruthy()

    await act(async () => {
      resolveStale(stale)
      await stalePromise
    })

    expect(screen.getByText('Aggregate score: 0')).toBeTruthy()
    expect(screen.queryByText('Aggregate score: 10')).toBeNull()
  })
})
