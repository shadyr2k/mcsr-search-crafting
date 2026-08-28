import type { CustomInventoryPreset, TargetWorkspace, TargetWorkspaceEntry } from '../domain/types'

const INVENTORY_SLOTS_KEY = 'mcsr.inventory-slots.v1'
const TARGET_WORKSPACE_KEY = 'mcsr.target-workspace.v1'
const SLOT_COUNT = 3

export interface PersistenceLoadResult<T> {
  value: T
  warning: string | undefined
}

interface VersionedInventorySlots {
  schemaVersion: 1
  slots: Array<CustomInventoryPreset | null>
}

interface VersionedTargetWorkspace extends TargetWorkspace {
  schemaVersion: 1
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

function storageOrDefault(storage: Storage | undefined): Storage {
  if (storage) return storage
  return window.localStorage
}

function assertSlotIndex(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= SLOT_COUNT) {
    throw new RangeError('Custom inventory slot index must be an integer from 0 through 2.')
  }
}

function recoveryKey(recordName: string, storage: Storage): string {
  const prefix = `mcsr.recovery.${recordName}.${Date.now()}`
  let key = prefix
  let suffix = 1
  while (storage.getItem(key) !== null) {
    key = `${prefix}.${suffix++}`
  }
  return key
}

function recover<T>(storage: Storage, key: string, recordName: string, raw: string, fallback: T): PersistenceLoadResult<T> {
  storage.setItem(recoveryKey(recordName, storage), raw)
  storage.removeItem(key)
  return {
    value: fallback,
    warning: `Saved ${recordName} data could not be read and was reset. The original data was preserved for recovery.`,
  }
}

function recoverInvalidMembers<T>(
  storage: Storage,
  recordName: string,
  raw: string,
  value: T,
  save: (value: T, storage: Storage) => void,
): PersistenceLoadResult<T> {
  storage.setItem(recoveryKey(recordName, storage), raw)
  save(value, storage)
  return {
    value,
    warning: `Saved ${recordName} data contained invalid entries. Valid data was preserved and the original data was saved for recovery.`,
  }
}

function parseJson(storage: Storage, key: string): unknown | null {
  const raw = storage.getItem(key)
  if (raw === null) return null
  return JSON.parse(raw) as unknown
}

function encodeSlots(slots: Array<CustomInventoryPreset | null>): VersionedInventorySlots {
  return { schemaVersion: 1, slots }
}

function saveSlots(slots: Array<CustomInventoryPreset | null>, storage: Storage): void {
  storage.setItem(INVENTORY_SLOTS_KEY, JSON.stringify(encodeSlots(slots)))
}

export function loadCustomInventorySlots(storage?: Storage): PersistenceLoadResult<Array<CustomInventoryPreset | null>> {
  const target = storageOrDefault(storage)
  const raw = target.getItem(INVENTORY_SLOTS_KEY)
  if (raw === null) return { value: defaultSlots(), warning: undefined }

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
    if (hasInvalidSlot) {
      return recoverInvalidMembers(target, 'inventory-slots', raw, slots, saveSlots)
    }
    if (parsed.schemaVersion === 0) saveSlots(slots, target)
    return { value: slots, warning: undefined }
  } catch {
    return recover(target, INVENTORY_SLOTS_KEY, 'inventory-slots', raw, defaultSlots())
  }
}

export function saveCustomInventorySlot(index: number, preset: CustomInventoryPreset, storage?: Storage): void {
  assertSlotIndex(index)
  if (!isCustomInventoryPreset(preset)) {
    throw new TypeError('Custom inventory presets must contain only a name and item IDs.')
  }
  const target = storageOrDefault(storage)
  const slots = loadCustomInventorySlots(target).value
  slots[index] = { name: preset.name, itemIds: [...preset.itemIds] }
  saveSlots(slots, target)
}

export function clearCustomInventorySlot(index: number, storage?: Storage): void {
  assertSlotIndex(index)
  const target = storageOrDefault(storage)
  const slots = loadCustomInventorySlots(target).value
  slots[index] = null
  saveSlots(slots, target)
}

function encodeWorkspace(workspace: TargetWorkspace): VersionedTargetWorkspace {
  return { schemaVersion: 1, entries: workspace.entries }
}

export function loadTargetWorkspace(storage?: Storage): PersistenceLoadResult<TargetWorkspace> {
  const target = storageOrDefault(storage)
  const raw = target.getItem(TARGET_WORKSPACE_KEY)
  if (raw === null) return { value: defaultWorkspace(), warning: undefined }

  try {
    const parsed = parseJson(target, TARGET_WORKSPACE_KEY)
    if (!isRecord(parsed) || !Array.isArray(parsed.entries)
      || (parsed.schemaVersion !== 0 && parsed.schemaVersion !== 1)) {
      return recover(target, TARGET_WORKSPACE_KEY, 'target-workspace', raw, defaultWorkspace())
    }

    const workspace = { entries: parsed.entries.filter(isTargetWorkspaceEntry) }
    if (workspace.entries.length !== parsed.entries.length) {
      return recoverInvalidMembers(target, 'target-workspace', raw, workspace, saveTargetWorkspace)
    }
    if (parsed.schemaVersion === 0) saveTargetWorkspace(workspace, target)
    return { value: workspace, warning: undefined }
  } catch {
    return recover(target, TARGET_WORKSPACE_KEY, 'target-workspace', raw, defaultWorkspace())
  }
}

export function saveTargetWorkspace(workspace: TargetWorkspace, storage?: Storage): void {
  if (!isRecord(workspace) || !Array.isArray(workspace.entries) || !workspace.entries.every(isTargetWorkspaceEntry)) {
    throw new TypeError('Target workspaces must contain valid target entries.')
  }
  storageOrDefault(storage).setItem(TARGET_WORKSPACE_KEY, JSON.stringify(encodeWorkspace(workspace)))
}
