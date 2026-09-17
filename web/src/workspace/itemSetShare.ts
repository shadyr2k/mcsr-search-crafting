import type { ItemSetDraft, TargetWorkspaceEntry } from '../domain/types'

export const ITEM_SET_WORKSPACE_SHARE_PREFIX = 'mcsr-item-sets-v2.'
const LEGACY_SHARE_PREFIX = 'mcsr-item-sets-v1.'

export type SharedItemSetDraft = Pick<ItemSetDraft, 'targetIds' | 'inventoryItemIds' | 'enabled' | 'gridSize' | 'retainCraftOrder'>

export type ItemSetWorkspaceShareParseResult =
  | { ok: true; drafts: SharedItemSetDraft[] }
  | { ok: false; error: string }

type SharePayload = {
  v: 1
  t: string[]
  i: string[]
  g: 2 | 3
  e: boolean
  r: boolean
}

type WorkspaceSharePayload = {
  v: 1
  s: SharePayload[]
}

// Item names and identical inventories are stored once for the whole collection.
// A set tuple contains goal references, an inventory reference, and three flags:
// bit 0 = 2x2 grid, bit 1 = enabled, bit 2 = retain craft order.
type CompactWorkspaceSharePayload = {
  v: 2
  d: string[]
  i: number[][]
  s: [number[], number, number][]
}

interface AvailableItems {
  items: ReadonlyMap<string, { id: string }>
  inventoryItems: ReadonlyMap<string, { id: string }>
}

function orderedUnique(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}

function sortedUnique(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort()
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function decodeBase64Url(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid characters')
  const padded = `${value.replaceAll('-', '+').replaceAll('_', '/')}${'='.repeat((4 - value.length % 4) % 4)}`
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((itemId) => typeof itemId === 'string' && itemId.length > 0)
}

function isSharePayload(value: unknown): value is SharePayload {
  if (!isRecord(value)) return false
  const keys = Object.keys(value).sort()
  if (keys.join(',') !== 'e,g,i,r,t,v') return false
  return value.v === 1
    && isStringArray(value.t)
    && isStringArray(value.i)
    && (value.g === 2 || value.g === 3)
    && typeof value.e === 'boolean'
    && typeof value.r === 'boolean'
}

function toSharePayload(draft: SharedItemSetDraft): SharePayload {
  return {
    v: 1,
    // Goal order can influence ordered overlap crafting, so preserve it.
    t: orderedUnique(draft.targetIds),
    i: sortedUnique(draft.inventoryItemIds),
    g: draft.gridSize,
    e: draft.enabled,
    r: draft.retainCraftOrder === true,
  }
}

function toDraft(payload: SharePayload): SharedItemSetDraft {
  return {
    targetIds: [...payload.t],
    inventoryItemIds: [...payload.i],
    gridSize: payload.g,
    enabled: payload.e,
    retainCraftOrder: payload.r,
  }
}

function validatePayload(payload: SharePayload, available: AvailableItems): string | undefined {
  if (payload.t.length === 0 || new Set(payload.t).size !== payload.t.length || new Set(payload.i).size !== payload.i.length) {
    return 'This item-set collection has invalid item selections.'
  }
  if (!payload.t.every((itemId) => available.items.has(itemId))) {
    return 'This collection includes a goal that is unavailable in this version of Minecraft.'
  }
  if (!payload.i.every((itemId) => available.inventoryItems.has(itemId))) {
    return 'This collection includes an inventory item that is unavailable in this version of Minecraft.'
  }
  return undefined
}

function isWorkspaceSharePayload(value: unknown): value is WorkspaceSharePayload {
  if (!isRecord(value)) return false
  const keys = Object.keys(value).sort()
  return keys.join(',') === 's,v' && value.v === 1 && Array.isArray(value.s) && value.s.every(isSharePayload)
}

function expandCompactPayload(value: unknown): WorkspaceSharePayload | undefined {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'd,i,s,v' || value.v !== 2 || !isStringArray(value.d)) return undefined
  const dictionary = value.d.map((id) => id.includes(':') ? id : `minecraft:${id}`)
  if (new Set(dictionary).size !== dictionary.length || !Array.isArray(value.i) || !Array.isArray(value.s)) return undefined
  const isReference = (reference: unknown, length: number): reference is number => typeof reference === 'number' && Number.isInteger(reference) && reference >= 0 && reference < length
  const expandReferences = (references: unknown): string[] | undefined => {
    if (!Array.isArray(references) || !references.every((reference) => isReference(reference, dictionary.length))) return undefined
    return references.map((reference) => dictionary[reference])
  }
  const inventories = value.i.map(expandReferences)
  if (inventories.some((inventory) => inventory === undefined)) return undefined
  const sets: SharePayload[] = []
  for (const set of value.s) {
    if (!Array.isArray(set) || set.length !== 3 || !isReference(set[1], inventories.length) || !isReference(set[2], 8)) return undefined
    const targets = expandReferences(set[0])
    if (!targets) return undefined
    sets.push({ v: 1, t: targets, i: inventories[set[1]]!, g: set[2] & 1 ? 2 : 3, e: Boolean(set[2] & 2), r: Boolean(set[2] & 4) })
  }
  return { v: 1, s: sets }
}

/** Produces a compact, versioned code for the ordered collection of item sets. */
export function createItemSetWorkspaceShareCode(entries: readonly Pick<TargetWorkspaceEntry, 'targetIds' | 'inventoryItemIds' | 'enabled' | 'gridSize' | 'retainCraftOrder'>[]): string {
  const payload: CompactWorkspaceSharePayload = { v: 2, d: [], i: [], s: [] }
  const itemReferences = new Map<string, number>()
  const inventoryReferences = new Map<string, number>()
  const itemReference = (id: string): number => {
    const existing = itemReferences.get(id)
    if (existing !== undefined) return existing
    const reference = payload.d.length
    itemReferences.set(id, reference)
    payload.d.push(id.startsWith('minecraft:') ? id.slice('minecraft:'.length) : id)
    return reference
  }
  for (const entry of entries.map(toSharePayload)) {
    const targets = entry.t.map(itemReference)
    const inventory = entry.i.map(itemReference)
    const inventoryKey = inventory.join(',')
    let inventoryReference = inventoryReferences.get(inventoryKey)
    if (inventoryReference === undefined) {
      inventoryReference = payload.i.length
      inventoryReferences.set(inventoryKey, inventoryReference)
      payload.i.push(inventory)
    }
    const flags = (entry.g === 2 ? 1 : 0) | (entry.e ? 2 : 0) | (entry.r ? 4 : 0)
    payload.s.push([targets, inventoryReference, flags])
  }
  return `${ITEM_SET_WORKSPACE_SHARE_PREFIX}${encodeBase64Url(JSON.stringify(payload))}`
}

/** Validates a complete item-set collection against the current game's available items. */
export function parseItemSetWorkspaceShareCode(code: string, available: AvailableItems): ItemSetWorkspaceShareParseResult {
  const trimmed = code.trim()
  const prefix = [ITEM_SET_WORKSPACE_SHARE_PREFIX, LEGACY_SHARE_PREFIX].find((candidate) => trimmed.startsWith(candidate))
  if (!prefix) {
    return { ok: false, error: 'That is not an item-set collection share code.' }
  }

  let payload: unknown
  try {
    payload = JSON.parse(decodeBase64Url(trimmed.slice(prefix.length)))
  } catch {
    return { ok: false, error: 'This item-set collection share code is incomplete or corrupted.' }
  }
  if (prefix === ITEM_SET_WORKSPACE_SHARE_PREFIX) payload = expandCompactPayload(payload)
  if (!isWorkspaceSharePayload(payload)) {
    return { ok: false, error: 'This item-set collection share code has an unsupported format.' }
  }
  for (const entry of payload.s) {
    const error = validatePayload(entry, available)
    if (error) return { ok: false, error }
  }

  return { ok: true, drafts: payload.s.map(toDraft) }
}
