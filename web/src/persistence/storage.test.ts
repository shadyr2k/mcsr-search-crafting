import { describe, expect, test } from 'vitest'

import {
  clearCustomInventorySlot,
  loadCustomInventorySlots,
  loadTargetWorkspace,
  saveCustomInventorySlot,
  saveTargetWorkspace,
} from './storage'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

function inventory(name: string, itemIds: string[]) {
  return { name, itemIds }
}

function workspace() {
  return {
    entries: [
      {
        id: 'tools',
        targetIds: ['minecraft:stick', 'minecraft:crafting_table'],
        enabled: false,
        gridSize: 2 as const,
        order: 4,
      },
      {
        id: 'weapons',
        targetIds: ['minecraft:iron_sword'],
        enabled: true,
        gridSize: 3 as const,
        order: 9,
      },
    ],
  }
}

describe('custom inventory slot persistence', () => {
  test('round trips exactly three name-and-item-only slots', () => {
    const storage = new MemoryStorage()

    saveCustomInventorySlot(0, inventory('wood', ['minecraft:oak_log']), storage)
    saveCustomInventorySlot(1, inventory('stone', ['minecraft:cobblestone']), storage)
    saveCustomInventorySlot(2, inventory('iron', ['minecraft:iron_ingot']), storage)

    expect(loadCustomInventorySlots(storage)).toEqual({
      value: [
        inventory('wood', ['minecraft:oak_log']),
        inventory('stone', ['minecraft:cobblestone']),
        inventory('iron', ['minecraft:iron_ingot']),
      ],
      warning: undefined,
    })
    expect(JSON.parse(storage.getItem('mcsr.inventory-slots.v1')!)).toEqual({
      schemaVersion: 1,
      slots: [
        inventory('wood', ['minecraft:oak_log']),
        inventory('stone', ['minecraft:cobblestone']),
        inventory('iron', ['minecraft:iron_ingot']),
      ],
    })
  })

  test('rejects custom inventory slot indexes outside 0 through 2', () => {
    const storage = new MemoryStorage()

    expect(() => saveCustomInventorySlot(-1, inventory('wood', []), storage)).toThrow('0 through 2')
    expect(() => saveCustomInventorySlot(3, inventory('wood', []), storage)).toThrow('0 through 2')
    expect(() => clearCustomInventorySlot(3, storage)).toThrow('0 through 2')
  })

  test('clears one custom inventory slot without changing the others', () => {
    const storage = new MemoryStorage()
    saveCustomInventorySlot(0, inventory('wood', ['minecraft:oak_log']), storage)
    saveCustomInventorySlot(1, inventory('stone', ['minecraft:cobblestone']), storage)

    clearCustomInventorySlot(0, storage)

    expect(loadCustomInventorySlots(storage).value).toEqual([
      null,
      inventory('stone', ['minecraft:cobblestone']),
      null,
    ])
  })
})

describe('target workspace persistence', () => {
  test('stores target entries separately and preserves enabled grid and order', () => {
    const storage = new MemoryStorage()
    const saved = workspace()

    saveTargetWorkspace(saved, storage)

    expect(storage.getItem('mcsr.inventory-slots.v1')).toBeNull()
    expect(loadTargetWorkspace(storage)).toEqual({ value: saved, warning: undefined })
    expect(JSON.parse(storage.getItem('mcsr.target-workspace.v1')!)).toEqual({
      schemaVersion: 1,
      ...saved,
    })
  })

  test('migrates supported version-zero records to version one', () => {
    const storage = new MemoryStorage()
    storage.setItem('mcsr.inventory-slots.v1', JSON.stringify({
      schemaVersion: 0,
      slots: [inventory('wood', ['minecraft:oak_log']), null, null],
    }))
    storage.setItem('mcsr.target-workspace.v1', JSON.stringify({
      schemaVersion: 0,
      ...workspace(),
    }))

    expect(loadCustomInventorySlots(storage).value[0]).toEqual(inventory('wood', ['minecraft:oak_log']))
    expect(loadTargetWorkspace(storage).value).toEqual(workspace())
    expect(JSON.parse(storage.getItem('mcsr.inventory-slots.v1')!).schemaVersion).toBe(1)
    expect(JSON.parse(storage.getItem('mcsr.target-workspace.v1')!).schemaVersion).toBe(1)
  })

  test('isolates corrupt records, preserves raw recovery data, and returns a warning', () => {
    const storage = new MemoryStorage()
    storage.setItem('mcsr.inventory-slots.v1', '{bad json')
    saveTargetWorkspace(workspace(), storage)

    const loaded = loadCustomInventorySlots(storage)

    expect(loaded.value).toEqual([null, null, null])
    expect(loaded.warning).toMatch(/inventory/i)
    expect(loadTargetWorkspace(storage).value).toEqual(workspace())
    const recoveryKey = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .find((key) => key?.startsWith('mcsr.recovery.inventory-slots.'))
    expect(recoveryKey).toBeDefined()
    expect(storage.getItem(recoveryKey!)).toBe('{bad json')
  })
})
