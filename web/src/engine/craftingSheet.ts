import type {
  CraftingSheetSelection,
  RankedSearch,
  RowOptimizationState,
  TargetWorkspaceEntry,
} from '../domain/types'
import { MAX_RECIPE_BOOK_RESULTS } from './resultLimit'
import { DEFAULT_SCORING_SETTINGS, type ScoringSettings, scoreControlKeys, scoreStep } from './scoring'
import { MAXIMUM_ORDINARY_BACKSPACES, transitionPresentation } from './overlapOptimizer'
import { removeRedundantItemIdSearches } from './rankedSearch'

export interface CraftingSheetOption {
  /** Stable across a rank-order change as long as the calculated craft is the same. */
  id: string
  /** A text-only version of the search sequence for the craft picker. */
  label: string
  isOptimal: boolean
  search: RankedSearch
  totalTypedCharacters: number
  totalScore: number
  scoreDelta: number
  junkCount: number
}

export interface CraftingSheetItemChoice {
  itemId: string
  /** The capped calculated results offered from the input's suggestion list. */
  suggestions: readonly CraftingSheetOption[]
  /** Suggestions plus a persisted, runner-supplied query when one is valid. */
  options: readonly CraftingSheetOption[]
  selectedOptionId: string
  scoreDelta: number
}

export interface CraftingSheetEntry {
  id: string
  itemIds: readonly string[]
  label: string
  queryLabel: string
  options: readonly CraftingSheetOption[]
  selectedOptionId: string
  defaultOptionId: string
  disabled: boolean
  status: 'ready' | 'pending' | 'unavailable'
  itemChoices: readonly CraftingSheetItemChoice[]
  selectedSearch: RankedSearch | undefined
  totalTypedCharacters: number
  totalScore: number
  scoreDelta: number
}

export interface CraftingSheetCharacterOccurrence {
  entryId: string
  label: string
  itemIds: readonly string[]
  optionId: string
  queryLabel: string
}

export interface CraftingSheetCharacterUsage {
  character: string
  /** The number of selected item-set crafts that use this character. */
  craftCount: number
  entryIds: readonly string[]
  occurrences: readonly CraftingSheetCharacterOccurrence[]
}

export interface CraftingSheetModel {
  entries: readonly CraftingSheetEntry[]
  /** Kept visible separately so a disabled craft can always be re-enabled. */
  disabledEntries: readonly CraftingSheetEntry[]
  characterSet: readonly string[]
  characterUsages: readonly CraftingSheetCharacterUsage[]
  /** Fewest distinct characters among all score-optimal choices for active item sets. */
  optimalCharacterCount: number
  isCalculating: boolean
  totalTypedCharacters: number
  totalScore: number
  scoreDelta: number
}

/** Validated user queries, indexed by item set then its requested item. */
export type ManualCraftSearches = ReadonlyMap<string, ReadonlyMap<string, RankedSearch>>

interface SearchOption extends CraftingSheetOption {
  search: RankedSearch
  characters: ReadonlySet<string>
}

interface CandidateEntry {
  entry: TargetWorkspaceEntry
  entryNumber: number
  options: readonly SearchOption[]
  optimalOptions: readonly SearchOption[]
  itemChoices: readonly CraftingSheetItemChoice[]
}

const DEFAULT_SEARCH_LIMIT = 100_000

function displayQuery(query: string): string {
  return query.replaceAll(' ', '_')
}

/**
 * A sequence is enough to distinguish the visible choices. Include step data
 * as well, so different calculated paths with the same displayed queries do
 * not collapse to one persisted selection.
 */
export function craftingSheetCraftKey(search: RankedSearch): string {
  return JSON.stringify([
    search.kind,
    search.steps.map((step) => [
      step.query,
      step.retainedPrefix,
      step.freeBackspaceCount,
      step.typedSuffix,
      [...step.coveredTargetIds].sort(),
      [...step.newTargetIds].sort(),
      [...step.junkItemIds].sort(),
    ]),
  ])
}

export function craftingSheetQueryLabel(search: RankedSearch): string {
  return search.steps.map((step, index) => {
    if (index === 0) return displayQuery(step.query)
    const shiftHome = step.retainedPrefix.length === 0 && step.freeBackspaceCount >= search.steps[index - 1].query.length
    const action = shiftHome ? ' (Shift+Home) ' : step.freeBackspaceCount > 0 ? ` ${'←'.repeat(step.freeBackspaceCount)} ` : ' → '
    return `${action}${displayQuery(step.typedSuffix)}`
  }).join('')
}

function displayedCharacters(search: RankedSearch): ReadonlySet<string> {
  // Search rows render spaces as underscores, so use the same visible character
  // in the sheet's character set and in its highlighted query labels.
  return new Set(Array.from(search.queries.join('')).map((character) => character === ' ' ? '_' : character))
}

function optionsForSearches(searches: readonly RankedSearch[], bestScore: number): SearchOption[] {
  const seen = new Set<string>()
  const options: SearchOption[] = []
  for (const search of removeRedundantItemIdSearches(searches)) {
    if (search.steps.some((step) => step.query.length > 5
      || step.junkItemIds.length + Math.max(1, step.coveredTargetIds.length) > MAX_RECIPE_BOOK_RESULTS)) continue
    const id = craftingSheetCraftKey(search)
    if (seen.has(id)) continue
    seen.add(id)
    const totalTypedCharacters = search.steps.reduce((sum, step, index) => (
      sum + Array.from(index === 0 ? step.query : step.typedSuffix).length
    ), 0)
    options.push({
      id,
      label: craftingSheetQueryLabel(search),
      isOptimal: search.totalScore === bestScore,
      search: { ...search, totalTypedCharacters },
      totalTypedCharacters,
      totalScore: search.totalScore,
      scoreDelta: search.totalScore - bestScore,
      junkCount: search.totalJunkAppearances,
      characters: displayedCharacters(search),
    })
  }
  return options
}

/**
 * Converts ranked crafts into the same selectable options used by the sheet.
 * Other views can use this without depending on the sheet's character-set
 * bookkeeping.
 */
export function craftingSheetOptionsForSearches(searches: readonly RankedSearch[], bestScore: number): CraftingSheetOption[] {
  return optionsForSearches(searches, bestScore)
}

function isSubset(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size > right.size) return false
  for (const character of left) if (!right.has(character)) return false
  return true
}

function addCharacters(current: ReadonlySet<string>, addition: ReadonlySet<string>): Set<string> {
  const next = new Set(current)
  for (const character of addition) next.add(character)
  return next
}

function addedCharacterCount(current: ReadonlySet<string>, addition: ReadonlySet<string>): number {
  let count = 0
  for (const character of addition) if (!current.has(character)) count += 1
  return count
}

/**
 * Discard choices that can never reduce a default character set. Equal sets
 * preserve their existing rank, which keeps default choices predictable.
 */
function nonDominatedOptions(options: readonly SearchOption[]): SearchOption[] {
  return options.filter((candidate, candidateIndex) => !options.some((other, otherIndex) => {
    if (otherIndex === candidateIndex || !isSubset(other.characters, candidate.characters)) return false
    return other.characters.size < candidate.characters.size || otherIndex < candidateIndex
  }))
}

/**
 * Select one optimal craft for each item set while minimizing the number of
 * distinct typed characters across the sheet. The branch-and-bound cap only
 * protects a pathological workspace; the greedy seed remains deterministic.
 */
function defaultOptionIds(
  entries: readonly CandidateEntry[],
  fixedOptions: ReadonlyMap<string, SearchOption> = new Map(),
): ReadonlyMap<string, string> {
  const groups = entries.map((entry, sourceIndex) => ({
    entry,
    sourceIndex,
    options: nonDominatedOptions(entry.optimalOptions),
  })).filter((group) => group.options.length > 0)
    .sort((left, right) => left.options.length - right.options.length || right.options[0].characters.size - left.options[0].characters.size || left.sourceIndex - right.sourceIndex)

  const seedSelections = new Map<string, string>([...fixedOptions.entries()].map(([entryId, option]) => [entryId, option.id]))
  let seedCharacters = new Set<string>()
  for (const option of fixedOptions.values()) seedCharacters = addCharacters(seedCharacters, option.characters)
  const greedySelections = new Map(seedSelections)
  let greedyCharacters = new Set(seedCharacters)
  for (const group of groups) {
    const option = [...group.options].sort((left, right) => (
      addedCharacterCount(greedyCharacters, left.characters) - addedCharacterCount(greedyCharacters, right.characters)
      || left.characters.size - right.characters.size
      || group.options.indexOf(left) - group.options.indexOf(right)
    ))[0]
    greedySelections.set(group.entry.entry.id, option.id)
    greedyCharacters = addCharacters(greedyCharacters, option.characters)
  }

  let bestCharacters = greedyCharacters
  let bestSelections = greedySelections
  let visited = 0

  function visit(index: number, characters: ReadonlySet<string>, selections: ReadonlyMap<string, string>): void {
    if (++visited > DEFAULT_SEARCH_LIMIT || characters.size >= bestCharacters.size) return
    if (index === groups.length) {
      bestCharacters = new Set(characters)
      bestSelections = new Map(selections)
      return
    }
    const group = groups[index]
    const candidates = [...group.options].sort((left, right) => (
      addedCharacterCount(characters, left.characters) - addedCharacterCount(characters, right.characters)
      || left.characters.size - right.characters.size
      || group.options.indexOf(left) - group.options.indexOf(right)
    ))
    for (const option of candidates) {
      const nextCharacters = addCharacters(characters, option.characters)
      if (nextCharacters.size > bestCharacters.size) continue
      const nextSelections = new Map(selections)
      nextSelections.set(group.entry.entry.id, option.id)
      visit(index + 1, nextCharacters, nextSelections)
    }
  }

  visit(0, seedCharacters, seedSelections)
  return bestSelections
}

function characterCountForSelections(entries: readonly CandidateEntry[], selections: ReadonlyMap<string, string>): number {
  const characters = new Set<string>()
  for (const candidate of entries) {
    const option = candidate.options.find((current) => current.id === selections.get(candidate.entry.id))
    if (option) for (const character of option.characters) characters.add(character)
  }
  return characters.size
}

function candidateEntries(
  entries: readonly TargetWorkspaceEntry[],
  states: ReadonlyMap<string, RowOptimizationState>,
  manualSearches: ManualCraftSearches,
): { entries: CandidateEntry[]; isCalculating: boolean } {
  let isCalculating = false
  const result: CandidateEntry[] = []
  entries.forEach((entry, index) => {
    if (!entry.enabled || entry.targetIds.length === 0) return
    const state = states.get(entry.id)
    if (state === undefined || state.status === 'idle' || state.status === 'pending') isCalculating = true
    if (state?.status !== 'ready' || state.outcome.kind !== 'ranked') return
    const options = optionsForSearches(state.outcome.rankedSearches, state.outcome.bestScore)
    const optimalOptions = options.filter((option) => option.isOptimal)
    const itemChoices = entry.targetIds.map((itemId) => {
      const searches = state.outcome.kind === 'ranked' ? state.outcome.itemSearches?.[itemId] ?? [] : []
      // The picker offers a short list of calculated suggestions. Anything
      // outside it is still available by validating a runner-supplied query.
      const suggestions = optionsForSearches(searches.slice(0, 10), searches[0]?.totalScore ?? 0)
      const defaultOption = suggestions[0]
      const manualSearch = manualSearches.get(entry.id)?.get(itemId)
      const manualOption = manualSearch === undefined
        ? undefined
        : optionsForSearches([manualSearch], defaultOption?.totalScore ?? manualSearch.totalScore)[0]
      const itemOptions = [...suggestions, manualOption]
        .filter((option): option is SearchOption => option !== undefined)
        .filter((option, index, values) => values.findIndex((candidate) => candidate.id === option.id) === index)
      const selected = itemOptions[0]
      return { itemId, suggestions, options: itemOptions, selectedOptionId: selected?.id ?? '', scoreDelta: selected?.scoreDelta ?? 0 }
    })
    if (options.length > 0 && optimalOptions.length > 0) result.push({ entry, entryNumber: index + 1, options, optimalOptions, itemChoices })
  })
  return { entries: result, isCalculating }
}

function queryTransition(previousQuery: string | undefined, query: string) {
  if (previousQuery === undefined) return { retainedPrefix: '', freeBackspaceCount: 0, typedSuffix: query }
  const transition = transitionPresentation(previousQuery, query)
  if (transition.freeBackspaceCount <= MAXIMUM_ORDINARY_BACKSPACES) return transition
  return { retainedPrefix: '', freeBackspaceCount: previousQuery.length, typedSuffix: query }
}

function composeItemSearch(candidate: CandidateEntry, scoringSettings: ScoringSettings): RankedSearch | undefined {
  const searches = candidate.itemChoices.map((choice) => choice.options.find((option) => option.id === choice.selectedOptionId)?.search)
  if (searches.some((search) => !search)) return undefined
  const steps: RankedSearch['steps'] = []
  searches.forEach((search, index) => {
    const source = search!.steps[0]
    const previous = steps[steps.length - 1]
    if (previous?.query === source.query) {
      previous.coveredTargetIds.push(candidate.itemChoices[index].itemId)
      previous.newTargetIds.push(candidate.itemChoices[index].itemId)
      return
    }
    const transition = queryTransition(searches[index - 1]?.queries[0], source.query)
    const junk = scoreStep(0, source.junkItemIds.length, scoringSettings)
    const typingPenalty = index === 0
      ? Math.max(0, source.query.length - scoringSettings.freeInitialCharacters) * scoringSettings.additionalCharacterPenalty
      : transition.typedSuffix.length * scoringSettings.additionalCharacterPenalty
    const controls = index === 0
      ? { backspacePenalty: 0, shiftHomePenalty: 0, total: 0 }
      : scoreControlKeys(searches[index - 1]?.queries[0] ?? '', transition, scoringSettings)
    steps.push({
      ...source,
      ...transition,
      coveredTargetIds: [candidate.itemChoices[index].itemId],
      newTargetIds: [candidate.itemChoices[index].itemId],
      score: { typingPenalty, junkPresencePenalty: junk.junkPresencePenalty, junkCountPenalty: junk.junkCountPenalty, backspacePenalty: controls.backspacePenalty, shiftHomePenalty: controls.shiftHomePenalty, total: typingPenalty + junk.total + controls.total },
    })
  })
  return {
    kind: steps.length > 1 ? 'overlap' : 'single',
    queries: steps.map((step) => step.query), steps,
    coveredTargetIds: [...candidate.entry.targetIds],
    totalJunkAppearances: steps.reduce((sum, step) => sum + step.junkItemIds.length, 0),
    totalTypedCharacters: steps.reduce((sum, step) => sum + step.typedSuffix.length, 0),
    totalScore: steps.reduce((sum, step) => sum + step.score.total, 0),
  }
}

/** Compare per-item alternatives against the query immediately before this row. */
function contextualItemChoices(candidate: CandidateEntry, scoringSettings: ScoringSettings): CraftingSheetItemChoice[] {
  return candidate.itemChoices.map((choice, index) => {
    const previous = candidate.itemChoices[index - 1]
    const previousQuery = previous?.options.find((option) => option.id === previous.selectedOptionId)?.search.queries[0]
    const scored = choice.options.map((option) => {
      const query = option.search.queries[0]
      const transition = queryTransition(previousQuery, query)
      const typingPenalty = index === 0
        ? Math.max(0, query.length - scoringSettings.freeInitialCharacters) * scoringSettings.additionalCharacterPenalty
        : transition.typedSuffix.length * scoringSettings.additionalCharacterPenalty
      const junkCount = query === previousQuery ? 0 : option.junkCount
      const controls = index === 0 ? { total: 0 } : scoreControlKeys(previousQuery ?? '', transition, scoringSettings)
      return { ...option, junkCount, totalTypedCharacters: transition.typedSuffix.length, totalScore: typingPenalty + scoreStep(0, junkCount, scoringSettings).total + controls.total }
    })
    const bestScore = Math.min(...scored.map((option) => option.totalScore))
    const options = scored.map((option) => ({ ...option, scoreDelta: option.totalScore - bestScore, isOptimal: option.totalScore === bestScore }))
      .sort((left, right) => left.totalScore - right.totalScore || left.totalTypedCharacters - right.totalTypedCharacters)
    const suggestions = choice.suggestions.map((suggestion) => options.find((option) => option.id === suggestion.id) ?? suggestion)
    return { ...choice, suggestions, options, scoreDelta: options.find((option) => option.id === choice.selectedOptionId)?.scoreDelta ?? 0 }
  })
}

function editableCandidate(candidate: CandidateEntry, seed: SearchOption, saved?: CraftingSheetSelection): CandidateEntry {
  // Older combined selections may also contain inactive individual overrides.
  const overrides = saved?.mode === 'combined' ? undefined : saved
  const seedOrder = seed.search.steps.flatMap((step) => step.newTargetIds)
  const order = [...new Set([
    ...(overrides?.itemOrder ?? (saved?.mode === 'individual' ? candidate.entry.targetIds : seedOrder)),
    ...candidate.entry.targetIds,
  ])].filter((itemId) => candidate.entry.targetIds.includes(itemId))
  const itemChoices = order.map((itemId) => {
    const choice = candidate.itemChoices.find((current) => current.itemId === itemId)!
    const seedStep = seed.search.steps.find((step) => step.newTargetIds.includes(itemId))
      ?? seed.search.steps.find((step) => step.coveredTargetIds.includes(itemId))
    const selected = choice.options.find((option) => option.id === overrides?.itemCraftKeys?.[itemId])
      ?? choice.options.find((option) => option.search.queries[0] === overrides?.itemQueries?.[itemId])
      ?? (saved?.mode !== 'individual' ? choice.options.find((option) => option.search.queries[0] === seedStep?.query) : undefined)
      ?? choice.options[0]
    return { ...choice, selectedOptionId: selected?.id ?? '', scoreDelta: selected?.scoreDelta ?? 0 }
  })
  return { ...candidate, itemChoices }
}

function composedOption(candidate: CandidateEntry, seed: SearchOption, scoringSettings: ScoringSettings): SearchOption {
  const search = composeItemSearch(candidate, scoringSettings)
  return search ? optionsForSearches([search], candidate.options[0].totalScore)[0] ?? seed : seed
}

/**
 * Projects ready main-page calculations into the state needed by the crafting
 * sheet. This stays independent from React so it can be tested and reused by
 * a presentational dropdown.
 */
export function createCraftingSheetModel(
  entries: readonly TargetWorkspaceEntry[],
  states: ReadonlyMap<string, RowOptimizationState>,
  selections: Readonly<Record<string, CraftingSheetSelection>> = {},
  scoringSettings: ScoringSettings = DEFAULT_SCORING_SETTINGS,
  manualSearches: ManualCraftSearches = new Map(),
): CraftingSheetModel {
  const candidates = candidateEntries(entries, states, manualSearches)
  const activeCandidates = candidates.entries.filter((candidate) => selections[candidate.entry.id]?.disabled !== true)
  const scoreOptimalOptionIds = defaultOptionIds(activeCandidates)
  const optimalCharacterCount = characterCountForSelections(activeCandidates, scoreOptimalOptionIds)
  // This is the reset target: every row is active and every choice is an
  // equal-score craft selected for the smallest common character set.
  const defaults = defaultOptionIds(candidates.entries)
  const savedOptions = new Map(candidates.entries.flatMap((candidate) => {
    const saved = selections[candidate.entry.id]
    const savedOption = candidate.options.find((current) => current.id === saved?.craftKey)
    const hasOverrides = saved?.mode === 'individual' || (saved?.mode !== 'combined' && (saved?.itemCraftKeys !== undefined || saved?.itemQueries !== undefined || saved?.itemOrder !== undefined))
    if (!savedOption && !hasOverrides) return []
    const seed = savedOption ?? candidate.options.find((option) => option.id === defaults.get(candidate.entry.id)) ?? candidate.options[0]
    return [[candidate.entry.id, composedOption(editableCandidate(candidate, seed, saved), seed, scoringSettings)] as const]
  }))
  const fixedOptions = new Map([...savedOptions].filter(([entryId]) => selections[entryId]?.disabled !== true))
  const defaultableEntries = candidates.entries.filter((candidate) => (
    selections[candidate.entry.id]?.disabled !== true && !fixedOptions.has(candidate.entry.id)
  ))
  // A manual choice is fixed first; remaining unmodified rows then choose the
  // best-score variant that shares as much of that manual character set as it
  // can. This keeps a custom choice from needlessly inflating the sheet.
  const selectedDefaults = defaultOptionIds(defaultableEntries, fixedOptions)
  const characterOccurrences = new Map<string, CraftingSheetCharacterOccurrence[]>()

  const sheetEntries = candidates.entries.map((candidate) => {
    const defaultOptionId = defaults.get(candidate.entry.id) ?? candidate.options[0].id
    const saved = selections[candidate.entry.id]
    const savedOption = savedOptions.get(candidate.entry.id)
    const seed = candidate.options.find((option) => option.id === saved?.craftKey)
      ?? candidate.options.find((option) => option.id === selectedDefaults.get(candidate.entry.id))
      ?? candidate.options.find((option) => option.id === defaultOptionId)!
    const editable = editableCandidate(candidate, seed, saved)
    const selected = savedOption ?? composedOption(editable, seed, scoringSettings)
    const selectedOptionId = selected.id
    const disabled = saved?.disabled === true
    const entry: CraftingSheetEntry = {
      id: candidate.entry.id,
      itemIds: editable.itemChoices.map((choice) => choice.itemId),
      label: `item set ${candidate.entryNumber}`,
      queryLabel: selected.label,
      options: candidate.options,
      selectedOptionId,
      defaultOptionId,
      disabled,
      status: 'ready',
      itemChoices: contextualItemChoices(editable, scoringSettings),
      selectedSearch: selected.search,
      totalTypedCharacters: selected.totalTypedCharacters,
      totalScore: selected.totalScore,
      scoreDelta: selected.scoreDelta,
    }

    if (!disabled) for (const character of selected.characters) {
      const occurrences = characterOccurrences.get(character) ?? []
      occurrences.push({
        entryId: entry.id,
        label: entry.label,
        itemIds: entry.itemIds,
        optionId: entry.selectedOptionId,
        queryLabel: entry.queryLabel,
      })
      characterOccurrences.set(character, occurrences)
    }
    return entry
  })

  entries.forEach((entry, index) => {
    if (!entry.enabled || entry.targetIds.length === 0 || sheetEntries.some((current) => current.id === entry.id)) return
    const state = states.get(entry.id)
    sheetEntries.push({
      id: entry.id, itemIds: entry.targetIds, label: `item set ${index + 1}`, queryLabel: '',
      options: [], selectedOptionId: '', defaultOptionId: '', disabled: selections[entry.id]?.disabled === true,
      status: state === undefined || state.status === 'idle' || state.status === 'pending' ? 'pending' : 'unavailable',
      itemChoices: [], selectedSearch: undefined,
      totalTypedCharacters: 0, totalScore: 0, scoreDelta: 0,
    })
  })
  sheetEntries.sort((left, right) => entries.findIndex((entry) => entry.id === left.id) - entries.findIndex((entry) => entry.id === right.id))

  const characterUsages = [...characterOccurrences.entries()].map(([character, occurrences]) => ({
    character,
    craftCount: occurrences.length,
    entryIds: occurrences.map(({ entryId }) => entryId),
    occurrences,
  })).sort((left, right) => right.craftCount - left.craftCount || left.character.localeCompare(right.character))

  return {
    entries: sheetEntries,
    disabledEntries: sheetEntries.filter((entry) => entry.disabled),
    characterSet: [...characterOccurrences.keys()].sort((left, right) => left.localeCompare(right)),
    characterUsages,
    optimalCharacterCount,
    isCalculating: candidates.isCalculating,
    totalTypedCharacters: sheetEntries.reduce((sum, entry) => sum + (entry.disabled ? 0 : entry.totalTypedCharacters), 0),
    totalScore: sheetEntries.reduce((sum, entry) => sum + (entry.disabled ? 0 : entry.totalScore), 0),
    scoreDelta: sheetEntries.reduce((sum, entry) => sum + (entry.disabled ? 0 : entry.scoreDelta), 0),
  }
}
