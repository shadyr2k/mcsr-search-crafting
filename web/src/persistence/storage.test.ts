import { describe, expect, test } from 'vitest'

import {
  clearCustomInventorySlot,
  loadCustomInventorySlots,
  loadLanguagePreferences,
  loadThemePreference,
  loadTargetWorkspace,
  saveCustomInventorySlot,
  saveLanguagePreferences,
  saveThemePreference,
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

class FailingStorage extends MemoryStorage {
  constructor(
    private readonly failReads: boolean,
    private readonly failWrites: boolean,
  ) {
    super()
  }

  override getItem(key: string): string | null {
    if (this.failReads) throw new DOMException('Storage read blocked.', 'SecurityError')
    return super.getItem(key)
  }

  override setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException('Storage quota exceeded.', 'QuotaExceededError')
    super.setItem(key, value)
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
        targetIds: ['minecraft:crafting_table', 'minecraft:stick'],
        inventoryItemIds: ['minecraft:oak_log'],
        enabled: false,
        gridSize: 2 as const,
        order: 4,
      },
      {
        id: 'weapons',
        targetIds: ['minecraft:iron_sword'],
        inventoryItemIds: ['minecraft:iron_ingot'],
        enabled: true,
        gridSize: 3 as const,
        order: 9,
      },
    ],
  }
}

function recoveryValue(storage: Storage, recordName: string): string | null {
  const key = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .find((candidate) => candidate?.startsWith(`mcsr.recovery.${recordName}.`))
  return key ? storage.getItem(key) : null
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

  test('drops a malformed slot while preserving valid siblings and its raw recovery record', () => {
    const storage = new MemoryStorage()
    const raw = JSON.stringify({
      schemaVersion: 1,
      slots: [inventory('wood', ['minecraft:oak_log']), { name: 'bad', itemIds: 'not-an-array' }, inventory('iron', ['minecraft:iron_ingot'])],
    })
    storage.setItem('mcsr.inventory-slots.v1', raw)

    const loaded = loadCustomInventorySlots(storage)

    expect(loaded.value).toEqual([
      inventory('wood', ['minecraft:oak_log']),
      null,
      inventory('iron', ['minecraft:iron_ingot']),
    ])
    expect(loaded.warning).toMatch(/inventory/i)
    expect(recoveryValue(storage, 'inventory-slots')).toBe(raw)
  })

  test('rejects a persisted preset with extra properties without dropping valid siblings', () => {
    const storage = new MemoryStorage()
    const raw = JSON.stringify({
      schemaVersion: 1,
      slots: [{ ...inventory('wood', ['minecraft:oak_log']), id: 'must-not-persist' }, inventory('stone', ['minecraft:cobblestone']), null],
    })
    storage.setItem('mcsr.inventory-slots.v1', raw)

    const loaded = loadCustomInventorySlots(storage)

    expect(loaded.value).toEqual([null, inventory('stone', ['minecraft:cobblestone']), null])
    expect(loaded.warning).toMatch(/inventory/i)
    expect(recoveryValue(storage, 'inventory-slots')).toBe(raw)
  })
})

describe('target workspace persistence', () => {
  test('marks only a missing workspace record as a first visit', () => {
    const storage = new MemoryStorage()

    expect(loadTargetWorkspace(storage)).toEqual({
      value: { entries: [] },
      warning: undefined,
      isFirstVisit: true,
    })

    saveTargetWorkspace({ entries: [] }, storage)

    expect(loadTargetWorkspace(storage).isFirstVisit).toBe(false)
  })

  test('migrates every valid version-one row with an empty exact inventory', () => {
    const storage = new MemoryStorage()
    const raw = JSON.stringify({
      schemaVersion: 1,
      entries: [{ id: 'late', targetIds: ['minecraft:stick'], enabled: true, gridSize: 2, order: 4 }],
    })
    storage.setItem('mcsr.target-workspace.v1', raw)

    const loaded = loadTargetWorkspace(storage)

    expect(loaded.value.entries[0]).toEqual({
      id: 'late', targetIds: ['minecraft:stick'], inventoryItemIds: [], enabled: true, gridSize: 2, order: 4,
    })
    expect(JSON.parse(storage.getItem('mcsr.target-workspace.v1')!).schemaVersion).toBe(2)
    expect(recoveryValue(storage, 'target-workspace')).toBe(raw)
  })

  test('round trips independent version-two inventories without changing custom slots', () => {
    const storage = new MemoryStorage()
    const originalSlots = JSON.stringify({ schemaVersion: 1, slots: [inventory('wood', ['minecraft:oak_log']), null, null] })
    storage.setItem('mcsr.inventory-slots.v1', originalSlots)
    const saved = {
      entries: [
        { id: 'a', targetIds: ['minecraft:stick'], inventoryItemIds: ['minecraft:oak_log', 'minecraft:oak_log'], enabled: true, gridSize: 2 as const, order: 0 },
        { id: 'b', targetIds: ['minecraft:bucket'], inventoryItemIds: ['minecraft:bucket'], enabled: true, gridSize: 3 as const, order: 1 },
      ],
    }

    saveTargetWorkspace(saved, storage)

    expect(loadTargetWorkspace(storage).value.entries.map((entry) => entry.inventoryItemIds)).toEqual([
      ['minecraft:oak_log'],
      ['minecraft:bucket'],
    ])
    expect(storage.getItem('mcsr.inventory-slots.v1')).toBe(originalSlots)
  })

  test('recovers an unsupported workspace schema version without touching custom slots', () => {
    const storage = new MemoryStorage()
    const raw = JSON.stringify({ schemaVersion: 3, entries: [] })
    const originalSlots = JSON.stringify({ schemaVersion: 1, slots: [null, null, null] })
    storage.setItem('mcsr.target-workspace.v1', raw)
    storage.setItem('mcsr.inventory-slots.v1', originalSlots)

    const loaded = loadTargetWorkspace(storage)

    expect(loaded.value).toEqual({ entries: [] })
    expect(loaded.warning).toMatch(/workspace/i)
    expect(recoveryValue(storage, 'target-workspace')).toBe(raw)
    expect(storage.getItem('mcsr.inventory-slots.v1')).toBe(originalSlots)
  })

  test('round trips an enabled empty entry without turning it into a scoreable target', () => {
    const storage = new MemoryStorage()
    const emptyWorkspace = {
      entries: [{ id: 'empty', targetIds: [], inventoryItemIds: [], enabled: true, gridSize: 3 as const, order: 0 }],
    }

    saveTargetWorkspace(emptyWorkspace, storage)

    expect(loadTargetWorkspace(storage).value).toEqual(emptyWorkspace)
  })

  test('stores target entries separately and preserves enabled grid and order', () => {
    const storage = new MemoryStorage()
    const saved = workspace()

    saveTargetWorkspace(saved, storage)

    expect(storage.getItem('mcsr.inventory-slots.v1')).toBeNull()
    expect(loadTargetWorkspace(storage)).toEqual({ value: saved, warning: undefined, isFirstVisit: false })
    expect(JSON.parse(storage.getItem('mcsr.target-workspace.v1')!)).toEqual({
      schemaVersion: 2,
      ...saved,
    })
  })

  test('migrates supported version-zero records to version two', () => {
    const storage = new MemoryStorage()
    storage.setItem('mcsr.inventory-slots.v1', JSON.stringify({
      schemaVersion: 0,
      slots: [inventory('wood', ['minecraft:oak_log']), null, null],
    }))
    storage.setItem('mcsr.target-workspace.v1', JSON.stringify({
      schemaVersion: 0,
      entries: workspace().entries.map(({ inventoryItemIds: _inventoryItemIds, ...entry }) => entry),
    }))

    expect(loadCustomInventorySlots(storage).value[0]).toEqual(inventory('wood', ['minecraft:oak_log']))
    expect(loadTargetWorkspace(storage).value.entries.map((entry) => entry.inventoryItemIds)).toEqual([[], []])
    expect(JSON.parse(storage.getItem('mcsr.inventory-slots.v1')!).schemaVersion).toBe(1)
    expect(JSON.parse(storage.getItem('mcsr.target-workspace.v1')!).schemaVersion).toBe(2)
  })

  test('isolates corrupt records, preserves raw recovery data, and returns a warning', () => {
    const storage = new MemoryStorage()
    storage.setItem('mcsr.inventory-slots.v1', '{bad json')
    saveTargetWorkspace(workspace(), storage)

    const loaded = loadCustomInventorySlots(storage)

    expect(loaded.value).toEqual([null, null, null])
    expect(loaded.warning).toMatch(/inventory/i)
    expect(loadTargetWorkspace(storage).value).toEqual(workspace())
    expect(recoveryValue(storage, 'inventory-slots')).toBe('{bad json')
  })

  test('drops a malformed entry while preserving valid siblings and its raw recovery record', () => {
    const storage = new MemoryStorage()
    const saved = workspace()
    const raw = JSON.stringify({
      schemaVersion: 2,
      entries: [saved.entries[0], { ...saved.entries[1], gridSize: 4 }],
    })
    storage.setItem('mcsr.target-workspace.v1', raw)

    const loaded = loadTargetWorkspace(storage)

    expect(loaded.value).toEqual({ entries: [saved.entries[0]] })
    expect(loaded.warning).toMatch(/workspace/i)
    expect(recoveryValue(storage, 'target-workspace')).toBe(raw)
  })

  test('returns safe defaults and an actionable warning when browser storage reads fail', () => {
    const storage = new FailingStorage(true, false)

    const loaded = loadTargetWorkspace(storage)

    expect(loaded.value).toEqual({ entries: [] })
    expect(loaded.warning).toMatch(/browser storage.*read/i)
    expect(loaded.warning).toMatch(/memory/i)
  })

  test('retains saved workspace state in memory and warns when browser storage writes fail', () => {
    const storage = new FailingStorage(false, true)
    const saved = workspace()

    const saveResult = saveTargetWorkspace(saved, storage)

    expect(saveResult.warning).toMatch(/browser storage.*write/i)
    expect(saveResult.warning).toMatch(/memory/i)
    expect(loadTargetWorkspace(storage).value).toEqual(saved)
  })
})

describe('language preference persistence', () => {
  const locales = new Set(['en_us', 'de_de', 'ja_jp'])

  test('round trips the selected locale and manually enabled banned locales', () => {
    const storage = new MemoryStorage()

    saveLanguagePreferences({ selectedLocale: 'ja_jp', enabledBannedLocales: ['ja_jp'] }, storage)

    expect(loadLanguagePreferences(locales, storage)).toEqual({
      value: { selectedLocale: 'ja_jp', enabledBannedLocales: ['ja_jp'] },
      warning: undefined,
    })
  })

  test('preserves target insertion order and the retained-craft-order preference', () => {
    const storage = new MemoryStorage()
    const value = {
      entries: [{
        id: 'ordered',
        targetIds: ['minecraft:tripwire_hook', 'minecraft:crossbow'],
        inventoryItemIds: [],
        enabled: true,
        gridSize: 3 as const,
        retainCraftOrder: true,
        order: 0,
      }],
    }

    saveTargetWorkspace(value, storage)

    expect(loadTargetWorkspace(storage).value).toEqual(value)
  })

  test('falls back to en_us when the saved locale is unavailable', () => {
    const storage = new MemoryStorage()
    storage.setItem('mcsr.language-preferences.v1', JSON.stringify({
      schemaVersion: 1,
      selectedLocale: 'removed_locale',
      enabledBannedLocales: ['removed_locale', 'ja_jp'],
    }))

    expect(loadLanguagePreferences(locales, storage)).toEqual({
      value: { selectedLocale: 'en_us', enabledBannedLocales: ['ja_jp'] },
      warning: expect.stringMatching(/unavailable.*en_us/i),
    })
  })
})

describe('theme preference persistence', () => {
  test('round trips the selected theme', () => {
    const storage = new MemoryStorage()

    saveThemePreference('dark', storage)

    expect(loadThemePreference(storage)).toEqual({ value: 'dark', warning: undefined })
  })

  test('falls back to light for an invalid saved theme', () => {
    const storage = new MemoryStorage()
    storage.setItem('mcsr.theme-preference.v1', JSON.stringify({ schemaVersion: 1, theme: 'purple' }))

    expect(loadThemePreference(storage)).toEqual({
      value: 'light',
      warning: expect.stringMatching(/theme-preference.*reset/i),
    })
  })
})
