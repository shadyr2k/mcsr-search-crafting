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

function updateLocaleSelection(
  preferences: CraftingSheetPreferences,
  locale: string,
  entryId: string,
  update: (selection: CraftingSheetSelection) => CraftingSheetSelection | undefined,
): CraftingSheetPreferences {
  const selections = preferences.selectionsByLocale[locale] ?? {}
  const nextSelection = update(selections[entryId] ?? {})
  const nextSelections = { ...selections }
  if (nextSelection === undefined) delete nextSelections[entryId]
  else nextSelections[entryId] = nextSelection

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
 * Keeps language-specific sheet choices out of the workspace record. A changed
 * item set simply falls back to its newly calculated default when an old craft
 * key is no longer available.
 */
export function useCraftingSheet(
  locale: string,
  entries: readonly TargetWorkspaceEntry[],
  states: ReadonlyMap<string, RowOptimizationState>,
  minecraftVersion = '1.16.1',
): CraftingSheetState {
  const [initial] = useState(() => loadCraftingSheetPreferences(undefined, minecraftVersion))
  const [preferences, setPreferences] = useState<CraftingSheetPreferences>(initial.value)
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
  }, [minecraftVersion])

  const setEntryDisabled = useCallback((entryId: string, disabled: boolean) => {
    persist(updateLocaleSelection(preferencesRef.current, locale, entryId, (selection) => {
      if (disabled) return { ...selection, disabled: true }
      const { disabled: _disabled, ...enabledSelection } = selection
      return Object.keys(enabledSelection).length > 0 ? enabledSelection : undefined
    }))
  }, [locale, persist])

  const selectItemCraft = useCallback((entryId: string, itemId: string, optionId: string) => {
    if (optionId.length === 0) return
    const current = createCraftingSheetModel(entries, states, preferencesRef.current.selectionsByLocale[locale]).entries.find((entry) => entry.id === entryId)
    if (!current?.itemChoices.find((choice) => choice.itemId === itemId)?.options.some((option) => option.id === optionId)) return
    persist(updateLocaleSelection(preferencesRef.current, locale, entryId, (selection) => ({
      disabled: selection.disabled,
      itemOrder: current.itemChoices.map((choice) => choice.itemId),
      itemCraftKeys: { ...Object.fromEntries(current.itemChoices.map((choice) => [choice.itemId, choice.selectedOptionId])), [itemId]: optionId },
    })))
  }, [entries, states, locale, persist])

  const reset = useCallback(() => {
    persist(resetLocaleSelections(preferencesRef.current, locale))
  }, [locale, persist])

  const moveItemCraft = useCallback((entryId: string, itemId: string, direction: -1 | 1) => {
    const current = createCraftingSheetModel(entries, states, preferencesRef.current.selectionsByLocale[locale]).entries.find((entry) => entry.id === entryId)
    if (!current) return
    const itemOrder = current.itemChoices.map((choice) => choice.itemId)
    const index = itemOrder.indexOf(itemId)
    const destination = index + direction
    if (index < 0 || destination < 0 || destination >= itemOrder.length) return
    const displaced = itemOrder[destination]
    itemOrder[destination] = itemOrder[index]
    itemOrder[index] = displaced
    persist(updateLocaleSelection(preferencesRef.current, locale, entryId, (selection) => ({
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
