import { describe, expect, test } from 'vitest'

import { DEFAULT_SCORING_SETTINGS } from '../engine/scoring'
import {
  clearLanguageScoreCache,
  clearCustomInventorySlot,
  languageScoreCacheGeneration,
  loadCraftingSheetPreferences,
  loadAppSettings,
  loadCustomInventorySlots,
  loadGameVersionPreference,
  loadLanguagePreferences,
  loadLanguageScoreCache,
  loadRecipeBookInventory,
  loadThemePreference,
  loadTargetWorkspace,
  saveCustomInventorySlot,
  saveCraftingSheetPreferences,
  saveAppSettings,
  saveGameVersionPreference,
  saveLanguagePreferences,
  saveLanguageScoreCache,
  saveRecipeBookInventory,
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

describe('recipe book inventory persistence', () => {
  test('round trips a deduplicated simulator inventory', () => {
    const storage = new MemoryStorage()

    saveRecipeBookInventory(['minecraft:iron_ingot', 'minecraft:oak_log', 'minecraft:iron_ingot'], storage)

    expect(loadRecipeBookInventory([], storage)).toEqual({
      value: ['minecraft:iron_ingot', 'minecraft:oak_log'],
      warning: undefined,
    })
    expect(JSON.parse(storage.getItem('mcsr.recipe-book-inventory.v1')!)).toEqual({
      schemaVersion: 1,
      itemIds: ['minecraft:iron_ingot', 'minecraft:oak_log'],
    })
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

describe('crafting sheet persistence', () => {
  test('round trips independent item choices and recovers malformed execution preferences', () => {
    const storage = new MemoryStorage()
    const preferences = { selectionsByLocale: { en_us: { beds: {
      mode: 'individual' as const, itemCraftKeys: { bed: 'query:bed', anchor: 'query:aw' }, itemOrder: ['anchor', 'bed'],
    } } } }
    saveCraftingSheetPreferences(preferences, storage)
    expect(loadCraftingSheetPreferences(storage)).toEqual({ value: preferences, warning: undefined })
    const raw = JSON.stringify({ schemaVersion: 1, selectionsByLocale: { en_us: {
      ...preferences.selectionsByLocale.en_us,
      badMode: { mode: 'unsupported' }, badItems: { itemCraftKeys: { bed: 123 } },
      badOrder: { itemOrder: ['bed', 123] },
    } } })
    storage.setItem('mcsr.crafting-sheet.v1', raw)
    const recovered = loadCraftingSheetPreferences(storage)
    expect(recovered.value).toEqual(preferences)
    expect(recovered.warning).toMatch(/crafting-sheet/i)
    expect(recoveryValue(storage, 'crafting-sheet')).toBe(raw)
  })

  test('round trips language-specific craft overrides and disabled rows', () => {
    const storage = new MemoryStorage()
    const preferences = {
      selectionsByLocale: {
        de_de: {
          tools: { craftKey: 'single:hammer' },
        },
        en_us: {
          tools: { craftKey: 'overlap:ha→ham', disabled: true },
          armor: { disabled: true },
        },
      },
    }

    saveCraftingSheetPreferences(preferences, storage)

    expect(loadCraftingSheetPreferences(storage)).toEqual({ value: preferences, warning: undefined })
    expect(JSON.parse(storage.getItem('mcsr.crafting-sheet.v1')!)).toEqual({
      schemaVersion: 2,
      selectionsByLocale: {
        de_de: { tools: { craftKey: 'single:hammer' } },
        en_us: {
          armor: { disabled: true },
          tools: { craftKey: 'overlap:ha→ham', disabled: true },
        },
      },
    })
  })

  test('migrates version-one saved craft choices without dropping them', () => {
    const storage = new MemoryStorage()
    storage.setItem('mcsr.crafting-sheet.v1', JSON.stringify({
      schemaVersion: 1,
      selectionsByLocale: { en_us: { tools: { craftKey: 'single:hammer' } } },
    }))

    expect(loadCraftingSheetPreferences(storage)).toEqual({
      value: { selectionsByLocale: { en_us: { tools: { craftKey: 'single:hammer' } } } },
      warning: undefined,
    })
    expect(JSON.parse(storage.getItem('mcsr.crafting-sheet.v1')!)).toEqual({
      schemaVersion: 2,
      selectionsByLocale: { en_us: { tools: { craftKey: 'single:hammer' } } },
    })
  })

  test('drops malformed nested selections while preserving valid language choices and the raw recovery record', () => {
    const storage = new MemoryStorage()
    const raw = JSON.stringify({
      schemaVersion: 1,
      selectionsByLocale: {
        en_us: { tools: { craftKey: 'valid' }, broken: { craftKey: 3 } },
        de_de: 'not-a-selection-map',
      },
    })
    storage.setItem('mcsr.crafting-sheet.v1', raw)

    const loaded = loadCraftingSheetPreferences(storage)

    expect(loaded.value).toEqual({ selectionsByLocale: { en_us: { tools: { craftKey: 'valid' } } } })
    expect(loaded.warning).toMatch(/crafting-sheet/i)
    expect(recoveryValue(storage, 'crafting-sheet')).toBe(raw)
  })
})

describe('theme preference persistence', () => {
  test('round trips the selected theme mode and color', () => {
    const storage = new MemoryStorage()

    saveThemePreference({ mode: 'dark', color: 'cyan' }, storage)

    expect(loadThemePreference(storage)).toEqual({ value: { mode: 'dark', color: 'cyan' }, warning: undefined })
  })

  test('migrates a saved light or dark preference to the pink theme', () => {
    const storage = new MemoryStorage()
    storage.setItem('mcsr.theme-preference.v1', JSON.stringify({ schemaVersion: 1, theme: 'dark' }))

    expect(loadThemePreference(storage)).toEqual({ value: { mode: 'dark', color: 'pink' }, warning: undefined })
    expect(JSON.parse(storage.getItem('mcsr.theme-preference.v1')!)).toEqual({ schemaVersion: 2, mode: 'dark', color: 'pink' })
  })

  test('falls back to the pink light theme for an invalid saved theme', () => {
    const storage = new MemoryStorage()
    storage.setItem('mcsr.theme-preference.v1', JSON.stringify({ schemaVersion: 1, theme: 'purple' }))

    expect(loadThemePreference(storage)).toEqual({
      value: { mode: 'light', color: 'pink' },
      warning: expect.stringMatching(/theme-preference.*reset/i),
    })
  })
})

describe('Minecraft version preference persistence', () => {
  test('restores an available selected version and resets one that is unavailable', () => {
    const storage = new MemoryStorage()
    const versions = new Set(['1.16.1', '26.1.2'])

    saveGameVersionPreference('26.1.2', storage)
    expect(loadGameVersionPreference(versions, '1.16.1', storage)).toEqual({ value: '26.1.2', warning: undefined })

    expect(loadGameVersionPreference(new Set(['1.16.1']), '1.16.1', storage)).toEqual({
      value: '1.16.1',
      warning: expect.stringMatching(/version.*unavailable/i),
    })
  })
})

describe('version-scoped crafting records', () => {
  test('keeps each Minecraft version’s saved inventory and workspace independent', () => {
    const storage = new MemoryStorage()
    const oldWorkspace = workspace()
    const newWorkspace = { entries: [] }

    saveCustomInventorySlot(0, inventory('old wood', ['minecraft:oak_log']), storage, '1.16.1')
    saveCustomInventorySlot(0, inventory('new wood', ['minecraft:pale_oak_log']), storage, '26.1.2')
    saveTargetWorkspace(oldWorkspace, storage, '1.16.1')
    saveTargetWorkspace(newWorkspace, storage, '26.1.2')

    expect(loadCustomInventorySlots(storage, '1.16.1').value[0]).toEqual(inventory('old wood', ['minecraft:oak_log']))
    expect(loadCustomInventorySlots(storage, '26.1.2').value[0]).toEqual(inventory('new wood', ['minecraft:pale_oak_log']))
    expect(loadTargetWorkspace(storage, '1.16.1').value).toEqual(oldWorkspace)
    expect(loadTargetWorkspace(storage, '26.1.2').value).toEqual(newWorkspace)
    expect(storage.getItem('mcsr.game.26.1.2.mcsr.inventory-slots.v1')).not.toBeNull()
  })

  test('keeps completed language scores separate for each Minecraft version', () => {
    const storage = new MemoryStorage()
    const cache = { entryScores: {
      '{"targetIds":["minecraft:stick"]}': { en_us: 8, de_de: 5 },
    } }

    saveLanguageScoreCache(cache, storage, '26.1.2')

    expect(loadLanguageScoreCache(storage, '26.1.2')).toEqual({ value: cache, warning: undefined })
    expect(loadLanguageScoreCache(storage, '1.16.1')).toEqual({ value: { entryScores: {} }, warning: undefined })
    expect(JSON.parse(storage.getItem('mcsr.game.26.1.2.mcsr.language-score-cache.v1')!)).toEqual({
      schemaVersion: 1,
      entryScores: cache.entryScores,
    })
  })
})

describe('app settings persistence', () => {
  test('loads saved settings from before display preferences and uses their defaults', () => {
    const storage = new MemoryStorage()
    storage.setItem('mcsr.app-settings.v1', JSON.stringify({
      schemaVersion: 1,
      scoring: DEFAULT_SCORING_SETTINGS,
      catifyItems: false,
    }))

    expect(loadAppSettings(storage).value.itemIdSearch).toBe(false)
    expect(loadAppSettings(storage).value.hideNumberCraftsByDefault).toBe(false)
    expect(loadAppSettings(storage).value.textControlKeycaps).toBe(true)
    expect(loadAppSettings(storage).value.removeAnimations).toBe(false)
    expect(loadAppSettings(storage).value.compactLayout).toBe(false)
  })

  test('saves score settings globally and clears a versioned score cache', () => {
    const storage = new MemoryStorage()
    const settings = {
      scoring: {
        freeInitialCharacters: 5,
        additionalCharacterPenalty: 1,
        junkExistingPenalty: 3,
        junkItemPenalty: .25,
        backspacePenalty: .5,
        shiftHomePenalty: 2,
      },
      itemIdSearch: true,
      hideNumberCraftsByDefault: true,
      textControlKeycaps: true,
      removeAnimations: true,
      compactLayout: true,
      catifyItems: true,
    }
    saveAppSettings(settings, storage)
    saveLanguageScoreCache({ entryScores: { itemSet: { en_us: 8 } } }, storage, '26.1.2')

    expect(loadAppSettings(storage)).toEqual({ value: settings, warning: undefined })
    clearLanguageScoreCache(storage, '26.1.2')
    expect(loadLanguageScoreCache(storage, '26.1.2').value).toEqual({ entryScores: {} })
  })

  test('does not let a calculation that began before clearing restore a score cache', () => {
    const storage = new MemoryStorage()
    const minecraftVersion = 'test-cache-generation'
    const generation = languageScoreCacheGeneration(minecraftVersion)

    clearLanguageScoreCache(storage, minecraftVersion)
    saveLanguageScoreCache({ entryScores: { stale: { en_us: 8 } } }, storage, minecraftVersion, generation)

    expect(loadLanguageScoreCache(storage, minecraftVersion).value).toEqual({ entryScores: {} })
  })
})
