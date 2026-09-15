import type {
  CraftingSheetSelection,
  RankedSearch,
  RowOptimizationState,
  TargetWorkspaceEntry,
} from '../domain/types'

export interface CraftingSheetOption {
  /** Stable across a rank-order change as long as the calculated craft is the same. */
  id: string
  /** A text-only version of the search sequence for the craft picker. */
  label: string
  isOptimal: boolean
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
  isCalculating: boolean
}

interface SearchOption extends CraftingSheetOption {
  search: RankedSearch
  characters: ReadonlySet<string>
}

interface CandidateEntry {
  entry: TargetWorkspaceEntry
  entryNumber: number
  options: readonly SearchOption[]
  optimalOptions: readonly SearchOption[]
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
  return search.queries.map(displayQuery).join(' → ')
}

function displayedCharacters(search: RankedSearch): ReadonlySet<string> {
  // Search rows render spaces as underscores, so use the same visible character
  // in the sheet's character set and in its highlighted query labels.
  return new Set(Array.from(search.queries.join('')).map((character) => character === ' ' ? '_' : character))
}

function optionsForSearches(searches: readonly RankedSearch[], bestScore: number): SearchOption[] {
  const seen = new Set<string>()
  const options: SearchOption[] = []
  for (const search of searches) {
    const id = craftingSheetCraftKey(search)
    if (seen.has(id)) continue
    seen.add(id)
    options.push({
      id,
      label: craftingSheetQueryLabel(search),
      isOptimal: search.totalScore === bestScore,
      search,
      characters: displayedCharacters(search),
    })
  }
  return options
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

function candidateEntries(
  entries: readonly TargetWorkspaceEntry[],
  states: ReadonlyMap<string, RowOptimizationState>,
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
    if (options.length > 0 && optimalOptions.length > 0) result.push({ entry, entryNumber: index + 1, options, optimalOptions })
  })
  return { entries: result, isCalculating }
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
): CraftingSheetModel {
  const candidates = candidateEntries(entries, states)
  // This is the reset target: every row is active and every choice is an
  // equal-score craft selected for the smallest common character set.
  const defaults = defaultOptionIds(candidates.entries)
  const savedOptions = new Map(candidates.entries.flatMap((candidate) => {
    const savedKey = selections[candidate.entry.id]?.craftKey
    const option = candidate.options.find((current) => current.id === savedKey)
    return option ? [[candidate.entry.id, option] as const] : []
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
    const selectedOptionId = savedOption?.id
      ?? selectedDefaults.get(candidate.entry.id)
      ?? defaultOptionId
    const selected = candidate.options.find((option) => option.id === selectedOptionId)!
    const disabled = saved?.disabled === true
    const entry: CraftingSheetEntry = {
      id: candidate.entry.id,
      itemIds: [...candidate.entry.targetIds],
      label: `item set ${candidate.entryNumber}`,
      queryLabel: selected.label,
      options: candidate.options.map(({ id, label, isOptimal }) => ({ id, label, isOptimal })),
      selectedOptionId,
      defaultOptionId,
      disabled,
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
    isCalculating: candidates.isCalculating,
  }
}
