import type { CustomInventoryPreset, TargetWorkspace, TargetWorkspaceEntry } from '../domain/types'

const INVENTORY_SLOTS_KEY = 'mcsr.inventory-slots.v1'
const TARGET_WORKSPACE_KEY = 'mcsr.target-workspace.v1'
const SLOT_COUNT = 3

export interface PersistenceLoadResult<T> {
  value: T
  warning: string | undefined
}

export interface PersistenceSaveResult {
  warning: string | undefined
}

interface VersionedInventorySlots {
  schemaVersion: 1
  slots: Array<CustomInventoryPreset | null>
}

interface VersionedTargetWorkspace extends TargetWorkspace {
  schemaVersion: 1
}

const volatileRecordsByStorage = new WeakMap<Storage, Map<string, string | null>>()
const unavailableStorageRecords = new Map<string, string | null>()

function storageWarning(operation: 'access' | 'read' | 'write'): string {
  return `Browser storage could not be ${operation === 'access' ? 'accessed' : operation}. `
    + 'Data remains available in memory for this page but may be lost after reload.'
}

class ResilientStorage {
  private readonly warnings = new Set<string>()

  constructor(
    private readonly nativeStorage: Storage | undefined,
    private readonly volatileRecords: Map<string, string | null>,
    initialWarning?: string,
  ) {
    if (initialWarning) this.warnings.add(initialWarning)
  }

  get warning(): string | undefined {
    return this.warnings.size > 0 ? [...this.warnings].join(' ') : undefined
  }

  getItem(key: string): string | null {
    if (this.volatileRecords.has(key)) return this.volatileRecords.get(key) ?? null
    if (!this.nativeStorage) {
      this.warnings.add(storageWarning('read'))
      return null
    }
    try {
      return this.nativeStorage.getItem(key)
    } catch {
      this.warnings.add(storageWarning('read'))
      return null
    }
  }

  setItem(key: string, value: string): void {
    this.volatileRecords.set(key, value)
    if (!this.nativeStorage) {
      this.warnings.add(storageWarning('write'))
      return
    }
    try {
      this.nativeStorage.setItem(key, value)
      this.volatileRecords.delete(key)
    } catch {
      this.warnings.add(storageWarning('write'))
    }
  }

  removeItem(key: string): void {
    this.volatileRecords.set(key, null)
    if (!this.nativeStorage) {
      this.warnings.add(storageWarning('write'))
      return
    }
    try {
      this.nativeStorage.removeItem(key)
      this.volatileRecords.delete(key)
    } catch {
      this.warnings.add(storageWarning('write'))
    }
  }
}

function storageOrDefault(storage: Storage | undefined): ResilientStorage {
  if (storage) {
    let volatileRecords = volatileRecordsByStorage.get(storage)
    if (!volatileRecords) {
      volatileRecords = new Map()
      volatileRecordsByStorage.set(storage, volatileRecords)
    }
    return new ResilientStorage(storage, volatileRecords)
  }

  try {
    const localStorage = window.localStorage
    let volatileRecords = volatileRecordsByStorage.get(localStorage)
    if (!volatileRecords) {
      volatileRecords = new Map()
      volatileRecordsByStorage.set(localStorage, volatileRecords)
    }
    return new ResilientStorage(localStorage, volatileRecords)
  } catch {
    return new ResilientStorage(undefined, unavailableStorageRecords, storageWarning('access'))
  }
}

function combineWarnings(...warnings: Array<string | undefined>): string | undefined {
  const messages = [...new Set(warnings.filter((warning): warning is string => Boolean(warning)))]
  return messages.length > 0 ? messages.join(' ') : undefined
}

function defaultSlots(): Array<CustomInventoryPreset | null> {
  return Array.from({ length: SLOT_COUNT }, () => null)
}

function defaultWorkspace(): TargetWorkspace {
  return { entries: [] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isCustomInventoryPreset(value: unknown): value is CustomInventoryPreset {
  return isRecord(value)
    && typeof value.name === 'string'
    && isStringArray(value.itemIds)
    && Object.keys(value).every((key) => key === 'name' || key === 'itemIds')
}

function isTargetWorkspaceEntry(value: unknown): value is TargetWorkspaceEntry {
  return isRecord(value)
    && typeof value.id === 'string'
    && isStringArray(value.targetIds)
    && typeof value.enabled === 'boolean'
    && (value.gridSize === 2 || value.gridSize === 3)
    && typeof value.order === 'number'
    && Number.isInteger(value.order)
}

function assertSlotIndex(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= SLOT_COUNT) {
    throw new RangeError('Custom inventory slot index must be an integer from 0 through 2.')
  }
}

function recoveryKey(recordName: string, storage: ResilientStorage): string {
  const prefix = `mcsr.recovery.${recordName}.${Date.now()}`
  let key = prefix
  let suffix = 1
  while (storage.getItem(key) !== null) key = `${prefix}.${suffix++}`
  return key
}

function recover<T>(
  storage: ResilientStorage,
  key: string,
  recordName: string,
  raw: string,
  fallback: T,
): PersistenceLoadResult<T> {
  storage.setItem(recoveryKey(recordName, storage), raw)
  storage.removeItem(key)
  return {
    value: fallback,
    warning: combineWarnings(
      `Saved ${recordName} data could not be read and was reset. The original data was preserved for recovery.`,
      storage.warning,
    ),
  }
}

function recoverInvalidMembers<T>(
  storage: ResilientStorage,
  recordName: string,
  raw: string,
  value: T,
  save: (value: T, storage: ResilientStorage) => void,
): PersistenceLoadResult<T> {
  storage.setItem(recoveryKey(recordName, storage), raw)
  save(value, storage)
  return {
    value,
    warning: combineWarnings(
      `Saved ${recordName} data contained invalid entries. Valid data was preserved and the original data was saved for recovery.`,
      storage.warning,
    ),
  }
}

function parseJson(storage: ResilientStorage, key: string): unknown | null {
  const raw = storage.getItem(key)
  if (raw === null) return null
  return JSON.parse(raw) as unknown
}

function encodeSlots(slots: Array<CustomInventoryPreset | null>): VersionedInventorySlots {
  return { schemaVersion: 1, slots }
}

function saveSlots(slots: Array<CustomInventoryPreset | null>, storage: ResilientStorage): void {
  storage.setItem(INVENTORY_SLOTS_KEY, JSON.stringify(encodeSlots(slots)))
}

function loadSlots(target: ResilientStorage): PersistenceLoadResult<Array<CustomInventoryPreset | null>> {
  const raw = target.getItem(INVENTORY_SLOTS_KEY)
  if (raw === null) return { value: defaultSlots(), warning: target.warning }

  try {
    const parsed = parseJson(target, INVENTORY_SLOTS_KEY)
    if (!isRecord(parsed) || !Array.isArray(parsed.slots) || parsed.slots.length !== SLOT_COUNT) {
      return recover(target, INVENTORY_SLOTS_KEY, 'inventory-slots', raw, defaultSlots())
    }
    if (parsed.schemaVersion !== 0 && parsed.schemaVersion !== 1) {
      return recover(target, INVENTORY_SLOTS_KEY, 'inventory-slots', raw, defaultSlots())
    }
    const slots = parsed.slots.map((slot) =>
      slot === null || isCustomInventoryPreset(slot) ? slot : null,
    ) as Array<CustomInventoryPreset | null>
    const hasInvalidSlot = parsed.slots.some((slot) => slot !== null && !isCustomInventoryPreset(slot))
    if (hasInvalidSlot) return recoverInvalidMembers(target, 'inventory-slots', raw, slots, saveSlots)
    if (parsed.schemaVersion === 0) saveSlots(slots, target)
    return { value: slots, warning: target.warning }
  } catch {
    return recover(target, INVENTORY_SLOTS_KEY, 'inventory-slots', raw, defaultSlots())
  }
}

export function loadCustomInventorySlots(storage?: Storage): PersistenceLoadResult<Array<CustomInventoryPreset | null>> {
  return loadSlots(storageOrDefault(storage))
}

export function saveCustomInventorySlot(
  index: number,
  preset: CustomInventoryPreset,
  storage?: Storage,
): PersistenceSaveResult {
  assertSlotIndex(index)
  if (!isCustomInventoryPreset(preset)) {
    throw new TypeError('Custom inventory presets must contain only a name and item IDs.')
  }
  const target = storageOrDefault(storage)
  const loaded = loadSlots(target)
  const slots = loaded.value
  slots[index] = { name: preset.name, itemIds: [...preset.itemIds] }
  saveSlots(slots, target)
  return { warning: combineWarnings(loaded.warning, target.warning) }
}

export function clearCustomInventorySlot(index: number, storage?: Storage): PersistenceSaveResult {
  assertSlotIndex(index)
  const target = storageOrDefault(storage)
  const loaded = loadSlots(target)
  const slots = loaded.value
  slots[index] = null
  saveSlots(slots, target)
  return { warning: combineWarnings(loaded.warning, target.warning) }
}

function encodeWorkspace(workspace: TargetWorkspace): VersionedTargetWorkspace {
  return { schemaVersion: 1, entries: workspace.entries }
}

function saveWorkspace(workspace: TargetWorkspace, storage: ResilientStorage): void {
  storage.setItem(TARGET_WORKSPACE_KEY, JSON.stringify(encodeWorkspace(workspace)))
}

function loadWorkspace(target: ResilientStorage): PersistenceLoadResult<TargetWorkspace> {
  const raw = target.getItem(TARGET_WORKSPACE_KEY)
  if (raw === null) return { value: defaultWorkspace(), warning: target.warning }

  try {
    const parsed = parseJson(target, TARGET_WORKSPACE_KEY)
    if (!isRecord(parsed) || !Array.isArray(parsed.entries)
      || (parsed.schemaVersion !== 0 && parsed.schemaVersion !== 1)) {
      return recover(target, TARGET_WORKSPACE_KEY, 'target-workspace', raw, defaultWorkspace())
    }

    const workspace = { entries: parsed.entries.filter(isTargetWorkspaceEntry) }
    if (workspace.entries.length !== parsed.entries.length) {
      return recoverInvalidMembers(target, 'target-workspace', raw, workspace, saveWorkspace)
    }
    if (parsed.schemaVersion === 0) saveWorkspace(workspace, target)
    return { value: workspace, warning: target.warning }
  } catch {
    return recover(target, TARGET_WORKSPACE_KEY, 'target-workspace', raw, defaultWorkspace())
  }
}

export function loadTargetWorkspace(storage?: Storage): PersistenceLoadResult<TargetWorkspace> {
  return loadWorkspace(storageOrDefault(storage))
}

export function saveTargetWorkspace(workspace: TargetWorkspace, storage?: Storage): PersistenceSaveResult {
  if (!isRecord(workspace) || !Array.isArray(workspace.entries) || !workspace.entries.every(isTargetWorkspaceEntry)) {
    throw new TypeError('Target workspaces must contain valid target entries.')
  }
  const target = storageOrDefault(storage)
  saveWorkspace(workspace, target)
  return { warning: target.warning }
}
