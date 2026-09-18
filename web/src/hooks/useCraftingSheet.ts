import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { CraftingSheetPreferences, CraftingSheetSelection, RowOptimizationState, TargetWorkspaceEntry } from '../domain/types'
import { createCraftingSheetModel, type CraftingSheetModel } from '../engine/craftingSheet'
import { loadCraftingSheetPreferences, saveCraftingSheetPreferences } from '../persistence/storage'

export type {
  CraftingSheetCharacterOccurrence,
  CraftingSheetCharacterUsage,
  CraftingSheetEntry,
  CraftingSheetOption,
} from '../engine/craftingSheet'

export interface CraftingSheetState extends CraftingSheetModel {
  warning: string | undefined
  selectItemCraft(entryId: string, itemId: string, optionId: string): void
  moveItemCraft(entryId: string, itemId: string, direction: -1 | 1): void
  setEntryDisabled(entryId: string, disabled: boolean): void
  /** Restores this language's calculated craft choices and re-enables every row. */
  reset(): void
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
): CraftingSheetState {
  const [initial] = useState(() => loadCraftingSheetPreferences(undefined, minecraftVersion))
  const [preferences, setPreferences] = useState<CraftingSheetPreferences>(initial.value)
  const [loadedMinecraftVersion, setLoadedMinecraftVersion] = useState(minecraftVersion)
  const preferencesRef = useRef(preferences)
  const [warning, setWarning] = useState<string | undefined>(initial.warning)

  const persist = useCallback((next: CraftingSheetPreferences) => {
    preferencesRef.current = next
    setPreferences(next)
    const result = saveCraftingSheetPreferences(next, undefined, minecraftVersion)
    setWarning((current) => combineWarnings(current, result.warning))
  }, [minecraftVersion])

  useEffect(() => {
    const loaded = loadCraftingSheetPreferences(undefined, minecraftVersion)
    preferencesRef.current = loaded.value
    setPreferences(loaded.value)
    setWarning(loaded.warning)
    setLoadedMinecraftVersion(minecraftVersion)
  }, [minecraftVersion])

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
    const current = createCraftingSheetModel(entries, states, preferencesRef.current.selectionsByLocale[locale]).entries.find((entry) => entry.id === entryId)
    if (!current?.itemChoices.find((choice) => choice.itemId === itemId)?.options.some((option) => option.id === optionId)) return
    persist(updateLocaleSelection(preferencesRef.current, locale, entryId, entryFingerprint(entry), (selection) => ({
      disabled: selection.disabled,
      itemOrder: current.itemChoices.map((choice) => choice.itemId),
      itemCraftKeys: { ...Object.fromEntries(current.itemChoices.map((choice) => [choice.itemId, choice.selectedOptionId])), [itemId]: optionId },
    })))
  }, [entries, states, locale, persist])

  const reset = useCallback(() => {
    persist(resetLocaleSelections(preferencesRef.current, locale))
  }, [locale, persist])

  const moveItemCraft = useCallback((entryId: string, itemId: string, direction: -1 | 1) => {
    const entry = entries.find((candidate) => candidate.id === entryId)
    if (!entry) return
    const current = createCraftingSheetModel(entries, states, preferencesRef.current.selectionsByLocale[locale]).entries.find((entry) => entry.id === entryId)
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
    })))
  }, [entries, states, locale, persist])

  const selections = preferences.selectionsByLocale[locale] ?? {}
  const model = useMemo(
    () => createCraftingSheetModel(entries, states, selections),
    [entries, selections, states],
  )
  return { ...model, warning, selectItemCraft, moveItemCraft, setEntryDisabled, reset }
}
