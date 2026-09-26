import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { CraftingSheetPreferences, CraftingSheetSelection, GeneratedData, RowOptimizationState, TargetWorkspaceEntry } from '../domain/types'
import { createCraftingSheetModel, type CraftingSheetModel, type ManualCraftSearches } from '../engine/craftingSheet'
import { validateManualItemCraft } from '../engine/manualCraft'
import { DEFAULT_SCORING_SETTINGS, type ScoringSettings } from '../engine/scoring'
import { loadCraftingSheetPreferences, saveCraftingSheetPreferences } from '../persistence/storage'

export const CRAFTING_SHEET_PREFERENCES_UPDATED_EVENT = 'mcsr-crafting-sheet-preferences-updated'

export type {
  CraftingSheetCharacterOccurrence,
  CraftingSheetCharacterUsage,
  CraftingSheetEntry,
  CraftingSheetOption,
} from '../engine/craftingSheet'

export interface CraftingSheetState extends CraftingSheetModel {
  warning: string | undefined
  selectItemCraft(entryId: string, itemId: string, optionId: string): void
  setItemQuery(entryId: string, itemId: string, query: string): CraftQueryResult
  moveItemCraft(entryId: string, itemId: string, direction: -1 | 1): void
  setEntryDisabled(entryId: string, disabled: boolean): void
  /** Restores this language's calculated craft choices and re-enables every row. */
  reset(): void
}

export interface CraftQueryResult {
  valid: boolean
  query: string
  message?: string
}

function combineWarnings(current: string | undefined, next: string | undefined): string | undefined {
  if (!next || current?.includes(next)) return current
  return current ? `${current} ${next}` : next
}

function entryFingerprint(entry: TargetWorkspaceEntry): string {
  return JSON.stringify({
    targetIds: entry.targetIds,
    inventoryItemIds: entry.inventoryItemIds,
    gridSize: entry.gridSize,
    retainCraftOrder: entry.retainCraftOrder === true,
  })
}

function reconcileEntrySelections(
  preferences: CraftingSheetPreferences,
  entries: readonly TargetWorkspaceEntry[],
): CraftingSheetPreferences {
  const fingerprints = new Map(entries.map((entry) => [entry.id, entryFingerprint(entry)]))
  const selectionsByLocale: Record<string, Record<string, CraftingSheetSelection>> = {}
  let changed = false

  for (const [locale, selections] of Object.entries(preferences.selectionsByLocale)) {
    const nextSelections: Record<string, CraftingSheetSelection> = {}
    for (const [entryId, selection] of Object.entries(selections)) {
      const fingerprint = fingerprints.get(entryId)
      if (!fingerprint || (selection.entryFingerprint !== undefined && selection.entryFingerprint !== fingerprint)) {
        changed = true
        continue
      }
      if (selection.entryFingerprint === fingerprint) nextSelections[entryId] = selection
      else {
        changed = true
        nextSelections[entryId] = { ...selection, entryFingerprint: fingerprint }
      }
    }
    if (Object.keys(nextSelections).length > 0) selectionsByLocale[locale] = nextSelections
    if (Object.keys(nextSelections).length !== Object.keys(selections).length) changed = true
  }

  return changed ? { selectionsByLocale } : preferences
}

function updateLocaleSelection(
  preferences: CraftingSheetPreferences,
  locale: string,
  entryId: string,
  fingerprint: string,
  update: (selection: CraftingSheetSelection) => CraftingSheetSelection | undefined,
): CraftingSheetPreferences {
  const selections = preferences.selectionsByLocale[locale] ?? {}
  const nextSelection = update(selections[entryId] ?? {})
  const nextSelections = { ...selections }
  if (nextSelection === undefined) delete nextSelections[entryId]
  else nextSelections[entryId] = { ...nextSelection, entryFingerprint: fingerprint }

  const selectionsByLocale = { ...preferences.selectionsByLocale }
  if (Object.keys(nextSelections).length === 0) delete selectionsByLocale[locale]
  else selectionsByLocale[locale] = nextSelections
  return { selectionsByLocale }
}

function resetLocaleSelections(preferences: CraftingSheetPreferences, locale: string): CraftingSheetPreferences {
  if (!(locale in preferences.selectionsByLocale)) return preferences
  const selectionsByLocale = { ...preferences.selectionsByLocale }
  delete selectionsByLocale[locale]
  return { selectionsByLocale }
}

function manualSearchesFor(
  entries: readonly TargetWorkspaceEntry[],
  selections: Readonly<Record<string, CraftingSheetSelection>>,
  data: GeneratedData | undefined,
  scoringSettings: ScoringSettings,
  itemIdSearch: boolean,
): ManualCraftSearches {
  if (data === undefined) return new Map()
  const searches = new Map<string, Map<string, ReturnType<typeof validateManualItemCraft>>>()
  for (const entry of entries) {
    const queries = selections[entry.id]?.itemQueries
    if (queries === undefined) continue
    for (const [itemId, query] of Object.entries(queries)) {
      const search = validateManualItemCraft(data, entry, itemId, query, scoringSettings, itemIdSearch)
      if (search === undefined) continue
      const entrySearches = searches.get(entry.id) ?? new Map()
      entrySearches.set(itemId, search)
      searches.set(entry.id, entrySearches)
    }
  }
  return searches as ManualCraftSearches
}

/**
 * Keeps language-specific sheet choices out of the workspace record. Each
 * saved choice includes the item set inputs that produced it, so edits cannot
 * apply an old choice to a new craft.
 */
export function useCraftingSheet(
  locale: string,
  entries: readonly TargetWorkspaceEntry[],
  states: ReadonlyMap<string, RowOptimizationState>,
  minecraftVersion = '1.16.1',
  entriesReady = true,
  scoringSettings: ScoringSettings = DEFAULT_SCORING_SETTINGS,
  data?: GeneratedData,
  itemIdSearch = false,
  synchronize = false,
): CraftingSheetState {
  const [initial] = useState(() => loadCraftingSheetPreferences(undefined, minecraftVersion))
  const [preferences, setPreferences] = useState<CraftingSheetPreferences>(initial.value)
  const [loadedMinecraftVersion, setLoadedMinecraftVersion] = useState(minecraftVersion)
  const preferencesRef = useRef(preferences)
  const isPersistingRef = useRef(false)
  const [warning, setWarning] = useState<string | undefined>(initial.warning)

  const persist = useCallback((next: CraftingSheetPreferences) => {
    preferencesRef.current = next
    setPreferences(next)
    const result = saveCraftingSheetPreferences(next, undefined, minecraftVersion)
    setWarning((current) => combineWarnings(current, result.warning))
    if (synchronize && typeof window !== 'undefined') {
      isPersistingRef.current = true
      window.dispatchEvent(new Event(CRAFTING_SHEET_PREFERENCES_UPDATED_EVENT))
      isPersistingRef.current = false
    }
  }, [minecraftVersion, synchronize])

  useEffect(() => {
    const refresh = () => {
      if (isPersistingRef.current) return
      const loaded = loadCraftingSheetPreferences(undefined, minecraftVersion)
      preferencesRef.current = loaded.value
      setPreferences(loaded.value)
      setWarning(loaded.warning)
      setLoadedMinecraftVersion(minecraftVersion)
    }
    refresh()
    if (!synchronize) return
    window.addEventListener(CRAFTING_SHEET_PREFERENCES_UPDATED_EVENT, refresh)
    return () => window.removeEventListener(CRAFTING_SHEET_PREFERENCES_UPDATED_EVENT, refresh)
  }, [minecraftVersion, synchronize])

  useEffect(() => {
    if (!entriesReady || loadedMinecraftVersion !== minecraftVersion) return
    const next = reconcileEntrySelections(preferencesRef.current, entries)
    if (next !== preferencesRef.current) persist(next)
  }, [entries, entriesReady, loadedMinecraftVersion, minecraftVersion, persist])

  const setEntryDisabled = useCallback((entryId: string, disabled: boolean) => {
    const entry = entries.find((candidate) => candidate.id === entryId)
    if (!entry) return
    persist(updateLocaleSelection(preferencesRef.current, locale, entryId, entryFingerprint(entry), (selection) => {
      if (disabled) return { ...selection, disabled: true }
      const { disabled: _disabled, entryFingerprint: _entryFingerprint, ...enabledSelection } = selection
      return Object.keys(enabledSelection).length > 0 ? enabledSelection : undefined
    }))
  }, [entries, locale, persist])

  const selectItemCraft = useCallback((entryId: string, itemId: string, optionId: string) => {
    if (optionId.length === 0) return
    const entry = entries.find((candidate) => candidate.id === entryId)
    if (!entry) return
    const selections = preferencesRef.current.selectionsByLocale[locale] ?? {}
    const manualSearches = manualSearchesFor(entries, selections, data, scoringSettings, itemIdSearch)
    const current = createCraftingSheetModel(entries, states, selections, scoringSettings, manualSearches).entries.find((entry) => entry.id === entryId)
    if (!current?.itemChoices.find((choice) => choice.itemId === itemId)?.options.some((option) => option.id === optionId)) return
    persist(updateLocaleSelection(preferencesRef.current, locale, entryId, entryFingerprint(entry), (selection) => ({
      disabled: selection.disabled,
      itemOrder: current.itemChoices.map((choice) => choice.itemId),
      itemCraftKeys: { ...Object.fromEntries(current.itemChoices.map((choice) => [choice.itemId, choice.selectedOptionId])), [itemId]: optionId },
    })))
  }, [data, entries, itemIdSearch, states, locale, persist, scoringSettings])

  const setItemQuery = useCallback((entryId: string, itemId: string, value: string): CraftQueryResult => {
    const entry = entries.find((candidate) => candidate.id === entryId)
    if (!entry || data === undefined) return { valid: false, query: '', message: 'Craft data is still loading.' }
    const selections = preferencesRef.current.selectionsByLocale[locale] ?? {}
    const manualSearches = manualSearchesFor(entries, selections, data, scoringSettings, itemIdSearch)
    const current = createCraftingSheetModel(entries, states, selections, scoringSettings, manualSearches).entries.find((candidate) => candidate.id === entryId)
    const choice = current?.itemChoices.find((candidate) => candidate.itemId === itemId)
    const defaultQuery = choice?.suggestions[0]?.search.queries[0] ?? ''
    const validated = validateManualItemCraft(data, entry, itemId, value, scoringSettings, itemIdSearch)
    const itemOrder = current?.itemChoices.map((candidate) => candidate.itemId) ?? entry.targetIds

    if (validated === undefined) {
      persist(updateLocaleSelection(preferencesRef.current, locale, entryId, entryFingerprint(entry), (selection) => {
        const itemQueries = { ...selection.itemQueries }
        delete itemQueries[itemId]
        return {
          disabled: selection.disabled,
          mode: 'individual',
          itemOrder,
          ...(Object.keys(itemQueries).length > 0 ? { itemQueries } : {}),
        }
      }))
      return { valid: false, query: defaultQuery, message: 'That query does not find this item. Restored the calculated default.' }
    }

    persist(updateLocaleSelection(preferencesRef.current, locale, entryId, entryFingerprint(entry), (selection) => ({
      disabled: selection.disabled,
      mode: 'individual',
      itemOrder,
      itemQueries: { ...selection.itemQueries, [itemId]: validated.queries[0] },
    })))
    return { valid: true, query: validated.queries[0] }
  }, [data, entries, itemIdSearch, locale, persist, scoringSettings, states])

  const reset = useCallback(() => {
    persist(resetLocaleSelections(preferencesRef.current, locale))
  }, [locale, persist])

  const moveItemCraft = useCallback((entryId: string, itemId: string, direction: -1 | 1) => {
    const entry = entries.find((candidate) => candidate.id === entryId)
    if (!entry) return
    const selections = preferencesRef.current.selectionsByLocale[locale] ?? {}
    const manualSearches = manualSearchesFor(entries, selections, data, scoringSettings, itemIdSearch)
    const current = createCraftingSheetModel(entries, states, selections, scoringSettings, manualSearches).entries.find((entry) => entry.id === entryId)
    if (!current) return
    const itemOrder = current.itemChoices.map((choice) => choice.itemId)
    const index = itemOrder.indexOf(itemId)
    const destination = index + direction
    if (index < 0 || destination < 0 || destination >= itemOrder.length) return
    const displaced = itemOrder[destination]
    itemOrder[destination] = itemOrder[index]
    itemOrder[index] = displaced
    persist(updateLocaleSelection(preferencesRef.current, locale, entryId, entryFingerprint(entry), (selection) => ({
      disabled: selection.disabled,
      itemOrder,
      itemCraftKeys: Object.fromEntries(current.itemChoices.map((choice) => [choice.itemId, choice.selectedOptionId])),
      itemQueries: selection.itemQueries,
    })))
  }, [data, entries, itemIdSearch, states, locale, persist, scoringSettings])

  const selections = preferences.selectionsByLocale[locale] ?? {}
  const manualSearches = useMemo(
    () => manualSearchesFor(entries, selections, data, scoringSettings, itemIdSearch),
    [data, entries, itemIdSearch, scoringSettings, selections],
  )
  const model = useMemo(
    () => createCraftingSheetModel(entries, states, selections, scoringSettings, manualSearches),
    [entries, manualSearches, selections, scoringSettings, states],
  )
  return { ...model, warning, selectItemCraft, setItemQuery, moveItemCraft, setEntryDisabled, reset }
}
