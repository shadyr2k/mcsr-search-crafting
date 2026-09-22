import type { EntryOptimizationOutcome, RankedSearch, TargetWorkspaceEntry } from '../domain/types'
import type { ScoringSettings } from '../engine/scoring'
import { scoringSettingsFingerprint } from '../engine/scoring'
import { SEARCH_ALGORITHM_REVISION } from '../engine/rankedSearch'

const DATABASE_NAME = 'mcsr-language-craft-cache'
const DATABASE_VERSION = 1
const STORE_NAME = 'outcomes'

interface StoredLanguageCraftOutcome {
  id: string
  gameVersion: string
  entryKey: string
  locale: string
  outcome: EntryOptimizationOutcome
}

const memoryRecords = new Map<string, StoredLanguageCraftOutcome>()

function recordId(gameVersion: string, entryKey: string, locale: string): string {
  return `${gameVersion}\u0000${entryKey}\u0000${locale}`
}

/**
 * A craft result is specific to both the item-set inputs and the calculation
 * settings. Keeping that identity in the key means an old result can never be
 * read while an asynchronous cache clear is still finishing.
 */
export function languageCraftEntryKey(
  entry: TargetWorkspaceEntry,
  scoringSettings: ScoringSettings,
  itemIdSearch: boolean,
): string {
  const targetIds = [...new Set(entry.targetIds)]
  if (!entry.retainCraftOrder) targetIds.sort()
  return JSON.stringify({
    targetIds,
    inventoryItemIds: [...new Set(entry.inventoryItemIds)].sort(),
    gridSize: entry.gridSize,
    retainCraftOrder: entry.retainCraftOrder === true,
    algorithm: SEARCH_ALGORITHM_REVISION,
    scoring: scoringSettingsFingerprint(scoringSettings),
    itemIdSearch,
  })
}

function snapshotSearch(search: RankedSearch): RankedSearch {
  return {
    ...search,
    queries: [...search.queries],
    coveredTargetIds: [...search.coveredTargetIds],
    steps: search.steps.map(({ explanations: _explanations, ...step }) => ({
      ...step,
      retainedPrefix: step.retainedPrefix,
      coveredTargetIds: [...step.coveredTargetIds],
      newTargetIds: [...step.newTargetIds],
      junkItemIds: [...step.junkItemIds],
      explanations: [],
      score: { ...step.score },
    })),
  }
}

/** Search explanations are not needed to rebuild sheet/comparison controls. */
export function snapshotLanguageCraftOutcome(outcome: EntryOptimizationOutcome): EntryOptimizationOutcome {
  if (outcome.kind === 'no-viable') return {
    ...outcome,
    rankedSearches: [],
    visibleItemIds: [...outcome.visibleItemIds],
    matchedTargetIds: [...outcome.matchedTargetIds],
    unmatchedTargetIds: [...outcome.unmatchedTargetIds],
  }
  return {
    ...outcome,
    rankedSearches: outcome.rankedSearches.map(snapshotSearch),
    visibleItemIds: [...outcome.visibleItemIds],
    itemSearches: outcome.itemSearches === undefined
      ? undefined
      : Object.fromEntries(Object.entries(outcome.itemSearches).map(([itemId, searches]) => [itemId, searches.map(snapshotSearch)])),
  }
}

function openDatabase(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(undefined)
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        const store = database.objectStoreNames.contains(STORE_NAME)
          ? request.transaction!.objectStore(STORE_NAME)
          : database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        if (!store.indexNames.contains('entry')) store.createIndex('entry', ['gameVersion', 'entryKey'], { unique: false })
        if (!store.indexNames.contains('version')) store.createIndex('version', 'gameVersion', { unique: false })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(undefined)
      request.onblocked = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  })
}

function requestValue<T>(request: IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(undefined)
  })
}

export async function loadLanguageCraftOutcomes(gameVersion: string, entryKey: string): Promise<ReadonlyMap<string, EntryOptimizationOutcome>> {
  const database = await openDatabase()
  if (!database) return new Map([...memoryRecords.values()]
    .filter((record) => record.gameVersion === gameVersion && record.entryKey === entryKey)
    .map((record) => [record.locale, snapshotLanguageCraftOutcome(record.outcome)]))
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const records = await requestValue(transaction.objectStore(STORE_NAME).index('entry').getAll([gameVersion, entryKey])) ?? []
    database.close()
    return new Map(records.map((record) => [record.locale, snapshotLanguageCraftOutcome(record.outcome)]))
  } catch {
    database.close()
    return new Map()
  }
}

export async function saveLanguageCraftOutcome(gameVersion: string, entryKey: string, locale: string, outcome: EntryOptimizationOutcome): Promise<void> {
  const record: StoredLanguageCraftOutcome = { id: recordId(gameVersion, entryKey, locale), gameVersion, entryKey, locale, outcome: snapshotLanguageCraftOutcome(outcome) }
  memoryRecords.set(record.id, record)
  const database = await openDatabase()
  if (!database) return
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(record)
    await new Promise<void>((resolve) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => resolve(); transaction.onabort = () => resolve() })
  } catch {
    // The in-memory copy remains usable for this session if IndexedDB is unavailable.
  } finally {
    database.close()
  }
}

export async function clearLanguageCraftCache(gameVersion: string): Promise<void> {
  for (const [id, record] of memoryRecords) if (record.gameVersion === gameVersion) memoryRecords.delete(id)
  const database = await openDatabase()
  if (!database) return
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const keys = await requestValue(store.index('version').getAllKeys(gameVersion)) ?? []
    keys.forEach((key) => store.delete(key))
    await new Promise<void>((resolve) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => resolve(); transaction.onabort = () => resolve() })
  } finally {
    database.close()
  }
}

export async function pruneLanguageCraftCache(gameVersion: string, activeEntryKeys: ReadonlySet<string>): Promise<void> {
  for (const [id, record] of memoryRecords) if (record.gameVersion === gameVersion && !activeEntryKeys.has(record.entryKey)) memoryRecords.delete(id)
  const database = await openDatabase()
  if (!database) return
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const records = await requestValue(store.index('version').getAll(gameVersion)) ?? []
    records.filter((record) => !activeEntryKeys.has(record.entryKey)).forEach((record) => store.delete(record.id))
    await new Promise<void>((resolve) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => resolve(); transaction.onabort = () => resolve() })
  } finally {
    database.close()
  }
}
