import type { CraftingSheetPreferences, CraftingSheetSelection, CustomInventoryPreset, TargetWorkspace, TargetWorkspaceEntry } from '../domain/types'

const INVENTORY_SLOTS_KEY = 'mcsr.inventory-slots.v1'
const TARGET_WORKSPACE_KEY = 'mcsr.target-workspace.v1'
const LANGUAGE_PREFERENCES_KEY = 'mcsr.language-preferences.v1'
const THEME_PREFERENCE_KEY = 'mcsr.theme-preference.v1'
const RECIPE_BOOK_INVENTORY_KEY = 'mcsr.recipe-book-inventory.v1'
const CRAFTING_SHEET_PREFERENCES_KEY = 'mcsr.crafting-sheet.v1'
const GAME_VERSION_PREFERENCE_KEY = 'mcsr.game-version.v1'
const SLOT_COUNT = 3

export interface PersistenceLoadResult<T> {
  value: T
  warning: string | undefined
}

export interface TargetWorkspaceLoadResult extends PersistenceLoadResult<TargetWorkspace> {
  isFirstVisit: boolean
}

export interface PersistenceSaveResult {
  warning: string | undefined
}

interface VersionedInventorySlots {
  schemaVersion: 1
  slots: Array<CustomInventoryPreset | null>
}

interface TargetWorkspaceEntryV1 {
  id: string
  targetIds: string[]
  enabled: boolean
  gridSize: 2 | 3
  order: number
}

interface VersionedTargetWorkspaceV1 {
  schemaVersion: 1
  entries: TargetWorkspaceEntryV1[]
}

interface VersionedTargetWorkspaceV2 extends TargetWorkspace {
  schemaVersion: 2
}

export interface LanguagePreferences {
  selectedLocale: string
  enabledBannedLocales: string[]
}

export type ThemeMode = 'light' | 'dark'
export type ThemeColor = 'pink' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray' | 'white' | 'cyan'

export interface ThemePreference {
  mode: ThemeMode
  color: ThemeColor
}

interface VersionedLanguagePreferences extends LanguagePreferences {
  schemaVersion: 1
}

interface VersionedThemePreferenceV1 {
  schemaVersion: 1
  theme: ThemeMode
}

interface VersionedThemePreference extends ThemePreference {
  schemaVersion: 2
}

interface VersionedGameVersionPreference {
  schemaVersion: 1
  versionId: string
}

interface VersionedRecipeBookInventory {
  schemaVersion: 1
  itemIds: string[]
}

interface VersionedCraftingSheetPreferences extends CraftingSheetPreferences {
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

function defaultLanguagePreferences(): LanguagePreferences {
  return { selectedLocale: 'en_us', enabledBannedLocales: [] }
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

function isTargetWorkspaceEntryV1(value: unknown): value is TargetWorkspaceEntryV1 {
  return isRecord(value)
    && typeof value.id === 'string'
    && isStringArray(value.targetIds)
    && typeof value.enabled === 'boolean'
    && (value.gridSize === 2 || value.gridSize === 3)
    && typeof value.order === 'number'
    && Number.isInteger(value.order)
}

function isTargetWorkspaceEntry(value: unknown): value is TargetWorkspaceEntry {
  if (!isRecord(value) || !isTargetWorkspaceEntryV1(value) || !isStringArray(value.inventoryItemIds)) {
    return false
  }
  if (value.retainCraftOrder !== undefined && typeof value.retainCraftOrder !== 'boolean') return false
  return Object.keys(value).every((key) => (
      key === 'id'
      || key === 'targetIds'
      || key === 'inventoryItemIds'
      || key === 'enabled'
      || key === 'gridSize'
      || key === 'retainCraftOrder'
      || key === 'order'
  ))
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

function normalizeWorkspaceEntry(entry: TargetWorkspaceEntry): TargetWorkspaceEntry {
  const { retainCraftOrder: _retainCraftOrder, ...stableEntry } = entry
  return {
    ...stableEntry,
    // The target strip is the user's input order. Keep it intact even when
    // calculations are allowed to reorder targets for a better craft path.
    targetIds: [...new Set(entry.targetIds)],
    inventoryItemIds: [...new Set(entry.inventoryItemIds)].sort(),
    ...(entry.retainCraftOrder === true ? { retainCraftOrder: true } : {}),
  }
}

function encodeWorkspace(workspace: TargetWorkspace): VersionedTargetWorkspaceV2 {
  return { schemaVersion: 2, entries: workspace.entries.map(normalizeWorkspaceEntry) }
}

function saveWorkspace(workspace: TargetWorkspace, storage: ResilientStorage): void {
  storage.setItem(TARGET_WORKSPACE_KEY, JSON.stringify(encodeWorkspace(workspace)))
}

function loadWorkspace(target: ResilientStorage): PersistenceLoadResult<TargetWorkspace> {
  const raw = target.getItem(TARGET_WORKSPACE_KEY)
  if (raw === null) return { value: defaultWorkspace(), warning: target.warning }

  try {
    const parsed = parseJson(target, TARGET_WORKSPACE_KEY)
    if (!isRecord(parsed) || !Array.isArray(parsed.entries)) {
      return recover(target, TARGET_WORKSPACE_KEY, 'target-workspace', raw, defaultWorkspace())
    }

    if (parsed.schemaVersion === 0 || parsed.schemaVersion === 1) {
      const entries = parsed.entries.filter(isTargetWorkspaceEntryV1)
      const workspace = { entries: entries.map((entry) => ({ ...entry, inventoryItemIds: [] })) }
      if (workspace.entries.length !== parsed.entries.length) {
        return recoverInvalidMembers(target, 'target-workspace', raw, workspace, saveWorkspace)
      }
      target.setItem(recoveryKey('target-workspace', target), raw)
      saveWorkspace(workspace, target)
      return {
        value: workspace,
        warning: combineWarnings(
          'Saved target-workspace data was migrated to the current format. The original data was preserved for recovery.',
          target.warning,
        ),
      }
    }

    if (parsed.schemaVersion !== 2) {
      return recover(target, TARGET_WORKSPACE_KEY, 'target-workspace', raw, defaultWorkspace())
    }
    const workspace = { entries: parsed.entries.filter(isTargetWorkspaceEntry) }
    if (workspace.entries.length !== parsed.entries.length) {
      return recoverInvalidMembers(target, 'target-workspace', raw, workspace, saveWorkspace)
    }
    return { value: workspace, warning: target.warning }
  } catch {
    return recover(target, TARGET_WORKSPACE_KEY, 'target-workspace', raw, defaultWorkspace())
  }
}

export function loadTargetWorkspace(storage?: Storage): TargetWorkspaceLoadResult {
  const target = storageOrDefault(storage)
  const isFirstVisit = target.getItem(TARGET_WORKSPACE_KEY) === null && target.warning === undefined
  return { ...loadWorkspace(target), isFirstVisit }
}

export function saveTargetWorkspace(workspace: TargetWorkspace, storage?: Storage): PersistenceSaveResult {
  if (!isRecord(workspace) || !Array.isArray(workspace.entries) || !workspace.entries.every(isTargetWorkspaceEntry)) {
    throw new TypeError('Target workspaces must contain valid target entries.')
  }
  const target = storageOrDefault(storage)
  saveWorkspace(workspace, target)
  return { warning: target.warning }
}

function isLanguagePreferencesValue(value: unknown): value is LanguagePreferences {
  return isRecord(value)
    && typeof value.selectedLocale === 'string'
    && isStringArray(value.enabledBannedLocales)
    && Object.keys(value).every((key) => key === 'selectedLocale' || key === 'enabledBannedLocales' || key === 'schemaVersion')
}

function isLanguagePreferences(value: unknown): value is VersionedLanguagePreferences {
  return isRecord(value) && isLanguagePreferencesValue(value) && value.schemaVersion === 1
}

function saveLanguagePreferencesRecord(preferences: LanguagePreferences, storage: ResilientStorage): void {
  storage.setItem(LANGUAGE_PREFERENCES_KEY, JSON.stringify({
    schemaVersion: 1,
    selectedLocale: preferences.selectedLocale,
    enabledBannedLocales: [...new Set(preferences.enabledBannedLocales)].sort(),
  } satisfies VersionedLanguagePreferences))
}

export function loadLanguagePreferences(
  availableLocales: ReadonlySet<string>,
  storage?: Storage,
): PersistenceLoadResult<LanguagePreferences> {
  const target = storageOrDefault(storage)
  const raw = target.getItem(LANGUAGE_PREFERENCES_KEY)
  if (raw === null) return { value: defaultLanguagePreferences(), warning: target.warning }
  try {
    const parsed = parseJson(target, LANGUAGE_PREFERENCES_KEY)
    if (!isLanguagePreferences(parsed)) {
      return recover(target, LANGUAGE_PREFERENCES_KEY, 'language-preferences', raw, defaultLanguagePreferences())
    }
    const selectedLocale = availableLocales.has(parsed.selectedLocale) ? parsed.selectedLocale : 'en_us'
    const enabledBannedLocales = [...new Set(parsed.enabledBannedLocales)].filter((locale) => availableLocales.has(locale)).sort()
    const preferences = { selectedLocale, enabledBannedLocales }
    if (selectedLocale !== parsed.selectedLocale || enabledBannedLocales.length !== parsed.enabledBannedLocales.length) {
      saveLanguagePreferencesRecord(preferences, target)
      return {
        value: preferences,
        warning: combineWarnings('Saved language preferences included unavailable locales and were reset to en_us.', target.warning),
      }
    }
    return { value: preferences, warning: target.warning }
  } catch {
    return recover(target, LANGUAGE_PREFERENCES_KEY, 'language-preferences', raw, defaultLanguagePreferences())
  }
}

export function saveLanguagePreferences(
  preferences: LanguagePreferences,
  storage?: Storage,
): PersistenceSaveResult {
  if (!isLanguagePreferencesValue(preferences)) {
    throw new TypeError('Language preferences must contain a locale and enabled banned locale IDs.')
  }
  const target = storageOrDefault(storage)
  saveLanguagePreferencesRecord(preferences, target)
  return { warning: target.warning }
}

function defaultCraftingSheetPreferences(): CraftingSheetPreferences {
  return { selectionsByLocale: {} }
}

function normalizeCraftingSheetSelection(value: unknown): CraftingSheetSelection | undefined | null {
  if (!isRecord(value)) return null
  if (!Object.keys(value).every((key) => ['craftKey', 'disabled', 'mode', 'itemCraftKeys', 'itemOrder'].includes(key))) return null
  if (value.craftKey !== undefined && (typeof value.craftKey !== 'string' || value.craftKey.length === 0)) return null
  if (value.disabled !== undefined && typeof value.disabled !== 'boolean') return null
  if (value.mode !== undefined && value.mode !== 'combined' && value.mode !== 'individual') return null
  if (value.itemOrder !== undefined && (!Array.isArray(value.itemOrder)
    || !value.itemOrder.every((itemId) => typeof itemId === 'string' && itemId.length > 0))) return null
  if (value.itemCraftKeys !== undefined && (!isRecord(value.itemCraftKeys)
    || !Object.values(value.itemCraftKeys).every((key) => typeof key === 'string' && key.length > 0))) return null
  const selection: CraftingSheetSelection = {}
  if (typeof value.craftKey === 'string') selection.craftKey = value.craftKey
  if (value.disabled === true) selection.disabled = true
  if (value.mode === 'individual' || value.mode === 'combined') selection.mode = value.mode
  if (Array.isArray(value.itemOrder) && value.itemOrder.length > 0) selection.itemOrder = [...new Set(value.itemOrder)]
  if (isRecord(value.itemCraftKeys) && Object.keys(value.itemCraftKeys).length > 0) {
    selection.itemCraftKeys = Object.fromEntries(Object.entries(value.itemCraftKeys).sort(([left], [right]) => left.localeCompare(right))) as Record<string, string>
  }
  return Object.keys(selection).length > 0 ? selection : undefined
}

function normalizeCraftingSheetPreferences(value: unknown): {
  value: CraftingSheetPreferences
  hasInvalidMember: boolean
} | undefined {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || !isRecord(value.selectionsByLocale)
    || !Object.keys(value).every((key) => key === 'schemaVersion' || key === 'selectionsByLocale')) return undefined

  const selectionsByLocale: Record<string, Record<string, CraftingSheetSelection>> = {}
  let hasInvalidMember = false
  for (const [locale, selections] of Object.entries(value.selectionsByLocale)) {
    if (!isRecord(selections)) {
      hasInvalidMember = true
      continue
    }
    const normalizedSelections: Record<string, CraftingSheetSelection> = {}
    for (const [entryId, selection] of Object.entries(selections)) {
      const normalized = normalizeCraftingSheetSelection(selection)
      if (normalized === null) {
        hasInvalidMember = true
        continue
      }
      if (normalized !== undefined) normalizedSelections[entryId] = normalized
    }
    if (Object.keys(normalizedSelections).length > 0) selectionsByLocale[locale] = normalizedSelections
  }
  return { value: { selectionsByLocale }, hasInvalidMember }
}

function encodeCraftingSheetPreferences(preferences: CraftingSheetPreferences): VersionedCraftingSheetPreferences {
  const selectionsByLocale: Record<string, Record<string, CraftingSheetSelection>> = {}
  for (const locale of Object.keys(preferences.selectionsByLocale).sort()) {
    const selections = preferences.selectionsByLocale[locale]
    const normalizedSelections: Record<string, CraftingSheetSelection> = {}
    for (const entryId of Object.keys(selections).sort()) {
      const selection = normalizeCraftingSheetSelection(selections[entryId])
      if (selection === null) throw new TypeError('Crafting sheet selections must contain only valid craft keys and disabled flags.')
      if (selection !== undefined) normalizedSelections[entryId] = selection
    }
    if (Object.keys(normalizedSelections).length > 0) selectionsByLocale[locale] = normalizedSelections
  }
  return { schemaVersion: 1, selectionsByLocale }
}

function saveCraftingSheetPreferencesRecord(preferences: CraftingSheetPreferences, storage: ResilientStorage): void {
  storage.setItem(CRAFTING_SHEET_PREFERENCES_KEY, JSON.stringify(encodeCraftingSheetPreferences(preferences)))
}

export function loadCraftingSheetPreferences(storage?: Storage): PersistenceLoadResult<CraftingSheetPreferences> {
  const target = storageOrDefault(storage)
  const fallback = defaultCraftingSheetPreferences()
  const raw = target.getItem(CRAFTING_SHEET_PREFERENCES_KEY)
  if (raw === null) return { value: fallback, warning: target.warning }
  try {
    const parsed = parseJson(target, CRAFTING_SHEET_PREFERENCES_KEY)
    const normalized = normalizeCraftingSheetPreferences(parsed)
    if (!normalized) return recover(target, CRAFTING_SHEET_PREFERENCES_KEY, 'crafting-sheet', raw, fallback)
    if (normalized.hasInvalidMember) {
      return recoverInvalidMembers(target, 'crafting-sheet', raw, normalized.value, saveCraftingSheetPreferencesRecord)
    }
    return { value: normalized.value, warning: target.warning }
  } catch {
    return recover(target, CRAFTING_SHEET_PREFERENCES_KEY, 'crafting-sheet', raw, fallback)
  }
}

export function saveCraftingSheetPreferences(
  preferences: CraftingSheetPreferences,
  storage?: Storage,
): PersistenceSaveResult {
  const normalized = normalizeCraftingSheetPreferences({ schemaVersion: 1, ...preferences })
  if (!normalized || normalized.hasInvalidMember) {
    throw new TypeError('Crafting sheet preferences must contain language-specific craft selections.')
  }
  const target = storageOrDefault(storage)
  saveCraftingSheetPreferencesRecord(normalized.value, target)
  return { warning: target.warning }
}

function defaultThemePreference(): ThemePreference {
  return { mode: 'light', color: 'pink' }
}

function isThemePreferenceV1(value: unknown): value is VersionedThemePreferenceV1 {
  return isRecord(value)
    && value.schemaVersion === 1
    && (value.theme === 'light' || value.theme === 'dark')
    && Object.keys(value).every((key) => key === 'schemaVersion' || key === 'theme')
}

function isThemePreference(value: unknown): value is VersionedThemePreference {
  return isRecord(value)
    && value.schemaVersion === 2
    && (value.mode === 'light' || value.mode === 'dark')
    && (value.color === 'pink' || value.color === 'red' || value.color === 'orange' || value.color === 'yellow' || value.color === 'green' || value.color === 'blue' || value.color === 'purple' || value.color === 'gray' || value.color === 'white' || value.color === 'cyan')
    && Object.keys(value).every((key) => key === 'schemaVersion' || key === 'mode' || key === 'color')
}

function saveThemePreferenceRecord(theme: ThemePreference, storage: ResilientStorage): void {
  storage.setItem(THEME_PREFERENCE_KEY, JSON.stringify({ schemaVersion: 2, ...theme } satisfies VersionedThemePreference))
}

export function loadThemePreference(storage?: Storage): PersistenceLoadResult<ThemePreference> {
  const target = storageOrDefault(storage)
  const raw = target.getItem(THEME_PREFERENCE_KEY)
  if (raw === null) return { value: defaultThemePreference(), warning: target.warning }
  try {
    const parsed = parseJson(target, THEME_PREFERENCE_KEY)
    if (isThemePreferenceV1(parsed)) {
      const preference = { mode: parsed.theme, color: 'pink' } satisfies ThemePreference
      saveThemePreferenceRecord(preference, target)
      return { value: preference, warning: target.warning }
    }
    if (!isThemePreference(parsed)) return recover(target, THEME_PREFERENCE_KEY, 'theme-preference', raw, defaultThemePreference())
    return { value: { mode: parsed.mode, color: parsed.color }, warning: target.warning }
  } catch {
    return recover(target, THEME_PREFERENCE_KEY, 'theme-preference', raw, defaultThemePreference())
  }
}

export function saveThemePreference(theme: ThemePreference, storage?: Storage): PersistenceSaveResult {
  if (!isThemePreference({ schemaVersion: 2, ...theme })) {
    throw new TypeError('Theme preferences must contain a valid mode and color.')
  }
  const target = storageOrDefault(storage)
  saveThemePreferenceRecord(theme, target)
  return { warning: target.warning }
}

function isGameVersionPreference(value: unknown): value is VersionedGameVersionPreference {
  return isRecord(value)
    && value.schemaVersion === 1
    && typeof value.versionId === 'string'
    && value.versionId.length > 0
    && Object.keys(value).every((key) => key === 'schemaVersion' || key === 'versionId')
}

export function loadGameVersionPreference(
  availableVersionIds: ReadonlySet<string>,
  fallbackVersionId: string,
  storage?: Storage,
): PersistenceLoadResult<string> {
  const target = storageOrDefault(storage)
  const raw = target.getItem(GAME_VERSION_PREFERENCE_KEY)
  if (raw === null) return { value: fallbackVersionId, warning: target.warning }
  try {
    const parsed = parseJson(target, GAME_VERSION_PREFERENCE_KEY)
    if (!isGameVersionPreference(parsed)) {
      return recover(target, GAME_VERSION_PREFERENCE_KEY, 'game-version', raw, fallbackVersionId)
    }
    if (!availableVersionIds.has(parsed.versionId)) {
      target.setItem(GAME_VERSION_PREFERENCE_KEY, JSON.stringify({ schemaVersion: 1, versionId: fallbackVersionId } satisfies VersionedGameVersionPreference))
      return {
        value: fallbackVersionId,
        warning: combineWarnings('Saved Minecraft version is unavailable and was reset.', target.warning),
      }
    }
    return { value: parsed.versionId, warning: target.warning }
  } catch {
    return recover(target, GAME_VERSION_PREFERENCE_KEY, 'game-version', raw, fallbackVersionId)
  }
}

export function saveGameVersionPreference(versionId: string, storage?: Storage): PersistenceSaveResult {
  if (versionId.length === 0) throw new TypeError('Minecraft version IDs must be non-empty.')
  const target = storageOrDefault(storage)
  target.setItem(GAME_VERSION_PREFERENCE_KEY, JSON.stringify({ schemaVersion: 1, versionId } satisfies VersionedGameVersionPreference))
  return { warning: target.warning }
}

function normalizeRecipeBookInventory(itemIds: readonly string[]): string[] {
  return [...new Set(itemIds)].sort()
}

function isRecipeBookInventory(value: unknown): value is VersionedRecipeBookInventory {
  return isRecord(value)
    && value.schemaVersion === 1
    && isStringArray(value.itemIds)
    && Object.keys(value).every((key) => key === 'schemaVersion' || key === 'itemIds')
}

function saveRecipeBookInventoryRecord(itemIds: readonly string[], storage: ResilientStorage): void {
  storage.setItem(RECIPE_BOOK_INVENTORY_KEY, JSON.stringify({
    schemaVersion: 1,
    itemIds: normalizeRecipeBookInventory(itemIds),
  } satisfies VersionedRecipeBookInventory))
}

export function loadRecipeBookInventory(
  fallbackItemIds: readonly string[] = [],
  storage?: Storage,
): PersistenceLoadResult<string[]> {
  const target = storageOrDefault(storage)
  const fallback = normalizeRecipeBookInventory(fallbackItemIds)
  const raw = target.getItem(RECIPE_BOOK_INVENTORY_KEY)
  if (raw === null) return { value: fallback, warning: target.warning }
  try {
    const parsed = parseJson(target, RECIPE_BOOK_INVENTORY_KEY)
    if (!isRecipeBookInventory(parsed)) {
      return recover(target, RECIPE_BOOK_INVENTORY_KEY, 'recipe-book-inventory', raw, fallback)
    }
    const itemIds = normalizeRecipeBookInventory(parsed.itemIds)
    if (itemIds.length !== parsed.itemIds.length) saveRecipeBookInventoryRecord(itemIds, target)
    return { value: itemIds, warning: target.warning }
  } catch {
    return recover(target, RECIPE_BOOK_INVENTORY_KEY, 'recipe-book-inventory', raw, fallback)
  }
}

export function saveRecipeBookInventory(itemIds: readonly string[], storage?: Storage): PersistenceSaveResult {
  if (!isStringArray(itemIds)) throw new TypeError('Recipe book inventories must contain only item IDs.')
  const target = storageOrDefault(storage)
  saveRecipeBookInventoryRecord(itemIds, target)
  return { warning: target.warning }
}
