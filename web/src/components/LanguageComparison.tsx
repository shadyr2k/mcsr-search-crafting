import { useEffect, useMemo, useState } from 'react'

import type { IconManifest } from '../data/iconManifest'
import type { CraftingSheetSelection, GeneratedData, LanguageMetadata, RowOptimizationState, TargetWorkspaceEntry } from '../domain/types'
import { createCraftingSheetModel, type CraftingSheetEntry, type ManualCraftSearches } from '../engine/craftingSheet'
import { validateManualItemCraft } from '../engine/manualCraft'
import type { ScoringSettings } from '../engine/scoring'
import { useLanguageComparison, type LanguageComparisonState } from '../hooks/useLanguageComparison'
import { ArrowSprite } from './ArrowSprite'
import { CraftQueryInput, type CraftQueryResult, QuerySequence } from './CraftingSheet'
import { ItemIcon } from './ItemIcon'
import { englishLocaleName, LanguageDropdown } from './LanguageSelector'

import './LanguageComparison.css'

interface LanguageComparisonProps {
  baseData: GeneratedData
  entries: readonly TargetWorkspaceEntry[]
  languages: readonly LanguageMetadata[]
  selectedLocale: string
  icons: IconManifest
  dataBaseUrl: string
  scoringSettings: ScoringSettings
  itemIdSearch: boolean
  minecraftVersion?: string
  loadedLocale?: string
  loadedStates?: ReadonlyMap<string, RowOptimizationState>
  loadedData?: GeneratedData
  layout?: 'inline' | 'page'
  compactLayout?: boolean
  onBack?: () => void
}

type Selections = Record<string, Record<string, CraftingSheetSelection>>
type ComparisonRequest = { leftLocale: string; rightLocale: string }

function scoreText(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1)
}

function languageName(locale: string, languages: readonly LanguageMetadata[]): string {
  const language = languages.find((candidate) => candidate.locale === locale)
  return language ? englishLocaleName(language, languages) : locale
}

function itemName(itemId: string, data: GeneratedData): string {
  return data.items.get(itemId)?.name ?? itemId.replace(/^minecraft:/, '').replaceAll('_', ' ')
}

function entryLabel(entry: TargetWorkspaceEntry, index: number, data: GeneratedData): string {
  return `item set ${index + 1} · ${entry.targetIds.map((itemId) => itemName(itemId, data)).join(', ')}`
}

function comparisonClass(left: number, right: number, side: 'left' | 'right'): string | undefined {
  if (left === right) return undefined
  const leftWins = left < right
  return (side === 'left') === leftWins ? 'language-comparison__value--better' : 'language-comparison__value--worse'
}

function junkFor(entry: CraftingSheetEntry | undefined): number {
  return entry?.selectedSearch?.totalJunkAppearances ?? 0
}

function totalJunk(entries: readonly CraftingSheetEntry[]): number {
  return entries.reduce((total, entry) => total + (entry.disabled ? 0 : junkFor(entry)), 0)
}

function rowStatesFor(
  state: LanguageComparisonState | undefined,
  entries: readonly TargetWorkspaceEntry[],
): ReadonlyMap<string, RowOptimizationState> {
  const rows = new Map<string, RowOptimizationState>()
  for (const entry of entries) {
    const outcome = state?.status === 'ready' ? state.outcomes.get(entry.id) : undefined
    if (outcome) rows.set(entry.id, { status: 'ready', fingerprint: 'language-comparison', outcome })
    else if (state?.status === 'unavailable') rows.set(entry.id, { status: 'error', fingerprint: 'language-comparison', message: state.message ?? 'Calculation failed.' })
    else rows.set(entry.id, { status: 'pending', fingerprint: 'language-comparison' })
  }
  return rows
}

function manualSearchesFor(
  entries: readonly TargetWorkspaceEntry[],
  selections: Readonly<Record<string, CraftingSheetSelection>> | undefined,
  data: GeneratedData | undefined,
  scoringSettings: ScoringSettings,
  itemIdSearch: boolean,
): ManualCraftSearches {
  if (data === undefined || selections === undefined) return new Map()
  const result = new Map<string, Map<string, ReturnType<typeof validateManualItemCraft>>>()
  for (const entry of entries) {
    for (const [itemId, query] of Object.entries(selections[entry.id]?.itemQueries ?? {})) {
      const search = validateManualItemCraft(data, entry, itemId, query, scoringSettings, itemIdSearch)
      if (search === undefined) continue
      const entrySearches = result.get(entry.id) ?? new Map()
      entrySearches.set(itemId, search)
      result.set(entry.id, entrySearches)
    }
  }
  return result as ManualCraftSearches
}

function ChoiceCell({
  entry,
  entryNumber,
  locale,
  icons,
  data,
  metricClasses,
  compactLayout = false,
  onSetItemQuery,
  onMoveItemCraft,
}: {
  entry: CraftingSheetEntry | undefined
  entryNumber: number
  locale: string
  icons: IconManifest
  data: GeneratedData | undefined
  metricClasses: { characters?: string; junk?: string; score?: string }
  compactLayout?: boolean
  onSetItemQuery: (entryId: string, itemId: string, query: string) => CraftQueryResult
  onMoveItemCraft: (entryId: string, itemId: string, direction: -1 | 1) => void
}) {
  const nameFor = (itemId: string) => data === undefined ? itemId.replace(/^minecraft:/, '').replaceAll('_', ' ') : itemName(itemId, data)
  return <section className="language-comparison__choice" aria-label={`Item set ${entryNumber} in ${locale}`}>
    <header>
      <strong>item set {entryNumber}</strong>
      <span className="language-comparison__items">{entry?.itemIds.map((itemId) => <ItemIcon key={itemId} itemId={itemId} name={nameFor(itemId)} manifest={icons} />)}</span>
    </header>
    {entry?.status === 'ready'
      ? <>
        {entry.selectedSearch && <QuerySequence search={entry.selectedSearch} />}
        <div className="language-comparison__choice-footer"><span className="language-comparison__metrics">
          <span className={metricClasses.characters}>{entry.totalTypedCharacters} chars</span>
          <span className={metricClasses.junk}>{junkFor(entry)} junk</span>
          <span className={metricClasses.score}>{scoreText(entry.totalScore)} score</span>
        </span></div>
        <div className="language-comparison__items-editor">
          {entry.itemChoices.map((choice, index) => {
            const selected = choice.options.find((option) => option.id === choice.selectedOptionId)
            const name = nameFor(choice.itemId)
            return <div key={choice.itemId} className="language-comparison__item-choice">
              <span className="language-comparison__reorder" role="group" aria-label={`Reorder ${name} in ${locale}`}>
                {([-1, 1] as const).map((direction) => <button key={direction} type="button" disabled={direction === -1 ? index === 0 : index === entry.itemChoices.length - 1} aria-label={`Move ${name} ${direction === -1 ? 'up' : 'down'} in ${locale}`} onClick={() => onMoveItemCraft(entry.id, choice.itemId, direction)}><ArrowSprite direction={direction === -1 ? 'up' : 'down'} compact /></button>)}
              </span>
              <ItemIcon itemId={choice.itemId} name={name} manifest={icons} />
              {selected && <QuerySequence search={selected.search} />}
              <CraftQueryInput compact={compactLayout} label={`${name} in ${locale}`} value={selected?.search.queries[0] ?? ''} suggestions={choice.suggestions} onSubmit={(query) => onSetItemQuery(entry.id, choice.itemId, query)} />
            </div>
          })}
        </div>
      </>
      : <p className="language-comparison__empty">{entry?.status === 'pending' ? 'Calculating crafts…' : 'No craft is available.'}</p>}
  </section>
}

function Differences({ left, right, leftName, rightName }: { left: CraftingSheetEntry | undefined; right: CraftingSheetEntry | undefined; leftName: string; rightName: string }) {
  if (left?.status !== 'ready' || right?.status !== 'ready') return <aside className="language-comparison__difference"><span>craft comparison will appear when both languages have a result.</span></aside>
  const metrics: Array<[string, number, number]> = [['characters', left.totalTypedCharacters, right.totalTypedCharacters], ['junk', junkFor(left), junkFor(right)], ['score', left.totalScore, right.totalScore]]
  const scoreWinner = left.totalScore === right.totalScore ? 'the same calculated score' : `${left.totalScore < right.totalScore ? leftName : rightName} has the lower calculated score`
  return <aside className="language-comparison__difference" aria-label="Craft differences">
    <strong>comparison</strong>
    {metrics.map(([label, leftValue, rightValue]) => <div key={label}><span>{label}</span><span className={comparisonClass(leftValue, rightValue, 'left')}>{label === 'score' ? scoreText(leftValue) : leftValue}</span><span aria-hidden="true">/</span><span className={comparisonClass(leftValue, rightValue, 'right')}>{label === 'score' ? scoreText(rightValue) : rightValue}</span></div>)}
    <p>{scoreWinner}.</p>
  </aside>
}

function OverallComparison({ leftModel, rightModel, leftName, rightName }: {
  leftModel: ReturnType<typeof createCraftingSheetModel>
  rightModel: ReturnType<typeof createCraftingSheetModel>
  leftName: string
  rightName: string
}) {
  const leftJunk = totalJunk(leftModel.entries)
  const rightJunk = totalJunk(rightModel.entries)
  const metrics: Array<[string, number, number]> = [
    ['characters', leftModel.totalTypedCharacters, rightModel.totalTypedCharacters],
    ['junk', leftJunk, rightJunk],
    ['score', leftModel.totalScore, rightModel.totalScore],
  ]
  const winner = leftModel.totalScore === rightModel.totalScore ? 'Both languages have the same calculated total score.' : `${leftModel.totalScore < rightModel.totalScore ? leftName : rightName} is better by calculated total score.`
  return <aside className="language-comparison__overall" aria-label="Overall language comparison">
    <strong>overall comparison</strong>
    {metrics.map(([label, leftValue, rightValue]) => <div key={label}><span>{label}</span><span className={comparisonClass(leftValue, rightValue, 'left')}>{label === 'score' ? scoreText(leftValue) : leftValue}</span><span aria-hidden="true">/</span><span className={comparisonClass(leftValue, rightValue, 'right')}>{label === 'score' ? scoreText(rightValue) : rightValue}</span></div>)}
    <p>{winner}</p>
  </aside>
}

export function LanguageComparison({ baseData, entries, languages, selectedLocale, icons, dataBaseUrl, scoringSettings, itemIdSearch, minecraftVersion, loadedLocale, loadedStates, loadedData, layout = 'inline', compactLayout = false, onBack }: LanguageComparisonProps) {
  const availableLocales = useMemo(() => languages.map((language) => language.locale), [languages])
  const fallbackRightLocale = useMemo(() => availableLocales.find((locale) => locale !== selectedLocale) ?? selectedLocale, [availableLocales, selectedLocale])
  const [open, setOpen] = useState(false)
  const [leftLocale, setLeftLocale] = useState(selectedLocale)
  const [rightLocale, setRightLocale] = useState(fallbackRightLocale)
  const [selections, setSelections] = useState<Selections>({})
  const [comparisonRequest, setComparisonRequest] = useState<ComparisonRequest>()
  const [selectedEntryId, setSelectedEntryId] = useState<string>()
  const activeEntries = useMemo(() => entries.filter((entry) => entry.enabled && entry.targetIds.length > 0), [entries])
  const isPage = layout === 'page'
  const isOpen = isPage || open
  const isComparisonRequested = comparisonRequest?.leftLocale === leftLocale && comparisonRequest.rightLocale === rightLocale
  const states = useLanguageComparison(baseData, activeEntries, leftLocale, rightLocale, dataBaseUrl, scoringSettings, itemIdSearch, isOpen && isComparisonRequested, loadedLocale, loadedStates, loadedData, minecraftVersion)
  const leftState = states.get(leftLocale)
  const rightState = states.get(rightLocale)
  const leftName = languageName(leftLocale, languages)
  const rightName = languageName(rightLocale, languages)
  const leftData = leftState?.status === 'ready' ? leftState.data : undefined
  const rightData = rightState?.status === 'ready' ? rightState.data : undefined
  const leftManualSearches = useMemo(() => manualSearchesFor(activeEntries, selections[leftLocale], leftData, scoringSettings, itemIdSearch), [activeEntries, itemIdSearch, leftData, leftLocale, scoringSettings, selections])
  const rightManualSearches = useMemo(() => manualSearchesFor(activeEntries, selections[rightLocale], rightData, scoringSettings, itemIdSearch), [activeEntries, itemIdSearch, rightData, rightLocale, scoringSettings, selections])
  const leftModel = useMemo(() => createCraftingSheetModel(activeEntries, rowStatesFor(leftState, activeEntries), selections[leftLocale], scoringSettings, leftManualSearches), [activeEntries, leftLocale, leftManualSearches, leftState, scoringSettings, selections])
  const rightModel = useMemo(() => createCraftingSheetModel(activeEntries, rowStatesFor(rightState, activeEntries), selections[rightLocale], scoringSettings, rightManualSearches), [activeEntries, rightLocale, rightManualSearches, rightState, scoringSettings, selections])
  const leftEntries = useMemo(() => new Map(leftModel.entries.map((entry) => [entry.id, entry])), [leftModel.entries])
  const rightEntries = useMemo(() => new Map(rightModel.entries.map((entry) => [entry.id, entry])), [rightModel.entries])
  const selectedEntryIndex = Math.max(0, activeEntries.findIndex((entry) => entry.id === selectedEntryId))
  const selectedEntry = activeEntries[selectedEntryIndex]

  useEffect(() => {
    if (activeEntries.some((entry) => entry.id === selectedEntryId)) return
    setSelectedEntryId(activeEntries[0]?.id)
  }, [activeEntries, selectedEntryId])

  useEffect(() => {
    if (!isOpen) return
    setLeftLocale(selectedLocale)
    setRightLocale((locale) => locale === selectedLocale ? (availableLocales.find((candidate) => candidate !== selectedLocale) ?? selectedLocale) : locale)
    setComparisonRequest(undefined)
  }, [availableLocales, isOpen, selectedLocale])

  function chooseLeftLocale(locale: string) { setLeftLocale(locale); setComparisonRequest(undefined) }
  function chooseRightLocale(locale: string) { setRightLocale(locale); setComparisonRequest(undefined) }
  function updateSelection(locale: string, entryId: string, update: (selection: CraftingSheetSelection) => CraftingSheetSelection) {
    setSelections((current) => ({ ...current, [locale]: { ...current[locale], [entryId]: update(current[locale]?.[entryId] ?? {}) } }))
  }
  function setItemQuery(locale: string, entryId: string, itemId: string, value: string): CraftQueryResult {
    const entry = activeEntries.find((candidate) => candidate.id === entryId)
    const localeData = locale === leftLocale ? leftData : rightData
    const model = locale === leftLocale ? leftModel : rightModel
    const choice = model.entries.find((candidate) => candidate.id === entryId)?.itemChoices.find((candidate) => candidate.itemId === itemId)
    const defaultQuery = choice?.suggestions[0]?.search.queries[0] ?? ''
    if (!entry || !localeData) return { valid: false, query: defaultQuery, message: 'Craft data is still loading.' }
    const search = validateManualItemCraft(localeData, entry, itemId, value, scoringSettings, itemIdSearch)
    const itemOrder = model.entries.find((candidate) => candidate.id === entryId)?.itemChoices.map((candidate) => candidate.itemId) ?? entry.targetIds
    if (search === undefined) {
      updateSelection(locale, entryId, (selection) => {
        const itemQueries = { ...selection.itemQueries }
        delete itemQueries[itemId]
        return { mode: 'individual', itemOrder, ...(Object.keys(itemQueries).length > 0 ? { itemQueries } : {}) }
      })
      return { valid: false, query: defaultQuery, message: 'That query does not find this item. Restored the calculated default.' }
    }
    updateSelection(locale, entryId, (selection) => ({ mode: 'individual', itemOrder, itemQueries: { ...selection.itemQueries, [itemId]: search.queries[0] } }))
    return { valid: true, query: search.queries[0] }
  }
  function moveItemCraft(locale: string, entryId: string, itemId: string, direction: -1 | 1) {
    const currentEntry = (locale === leftLocale ? leftEntries : rightEntries).get(entryId)
    const order = currentEntry?.itemChoices.map((choice) => choice.itemId) ?? []
    const index = order.indexOf(itemId)
    const destination = index + direction
    if (index < 0 || destination < 0 || destination >= order.length) return
    ;[order[index], order[destination]] = [order[destination], order[index]]
    updateSelection(locale, entryId, (selection) => ({ mode: 'individual', itemOrder: order, itemQueries: selection.itemQueries }))
  }

  const left = selectedEntry === undefined ? undefined : leftEntries.get(selectedEntry.id)
  const right = selectedEntry === undefined ? undefined : rightEntries.get(selectedEntry.id)
  const ready = left?.status === 'ready' && right?.status === 'ready'
  const panel = <div className="language-comparison__panel">
    <p>Compare one item set at a time. Use a calculated suggestion or type a query, then press Enter to validate it.</p>
    <div className="language-comparison__language-selectors">
      <label>left language<LanguageDropdown label="Left comparison language" languages={languages} selectedLocale={leftLocale} onSelect={chooseLeftLocale} /></label>
      <label>right language<LanguageDropdown label="Right comparison language" languages={languages} selectedLocale={rightLocale} onSelect={chooseRightLocale} /></label>
    </div>
    <button type="button" className="language-comparison__start" disabled={activeEntries.length === 0} onClick={() => setComparisonRequest({ leftLocale, rightLocale })}>compare</button>
    {activeEntries.length === 0 && <p className="language-comparison__empty">Add an item set with a search goal to compare languages.</p>}
    {!isComparisonRequested && activeEntries.length > 0 && <p className="language-comparison__status">Choose two languages, then press compare to calculate and save their default crafts.</p>}
    {isComparisonRequested && (leftState?.status === 'pending' || rightState?.status === 'pending') && <p className="language-comparison__status">calculating comparison…</p>}
    {isComparisonRequested && (leftState?.status === 'unavailable' || rightState?.status === 'unavailable') && <p className="language-comparison__status">The comparison could not be calculated for one of these languages.</p>}
    {isComparisonRequested && selectedEntry && <>
      <nav className="language-comparison__navigator" aria-label="Item set navigation">
        <button type="button" aria-label="Previous item set" disabled={selectedEntryIndex === 0} onClick={() => setSelectedEntryId(activeEntries[selectedEntryIndex - 1]?.id)}><ArrowSprite direction="left" compact /></button>
        <label>item set<select aria-label="Compared item set" value={selectedEntry.id} onChange={(event) => setSelectedEntryId(event.target.value)}>{activeEntries.map((entry, index) => <option key={entry.id} value={entry.id}>{entryLabel(entry, index, baseData)}</option>)}</select></label>
        <button type="button" aria-label="Next item set" disabled={selectedEntryIndex === activeEntries.length - 1} onClick={() => setSelectedEntryId(activeEntries[selectedEntryIndex + 1]?.id)}><ArrowSprite direction="right" compact /></button>
      </nav>
      <div className="language-comparison__table">
        <header><strong>{leftName}</strong><strong>{rightName}</strong><strong>differences</strong></header>
        <div className="language-comparison__row">
          <ChoiceCell entry={left} entryNumber={selectedEntryIndex + 1} locale={leftName} icons={icons} data={leftData} compactLayout={compactLayout} metricClasses={{ characters: ready ? comparisonClass(left.totalTypedCharacters, right.totalTypedCharacters, 'left') : undefined, junk: ready ? comparisonClass(junkFor(left), junkFor(right), 'left') : undefined, score: ready ? comparisonClass(left.totalScore, right.totalScore, 'left') : undefined }} onSetItemQuery={(entryId, itemId, query) => setItemQuery(leftLocale, entryId, itemId, query)} onMoveItemCraft={(entryId, itemId, direction) => moveItemCraft(leftLocale, entryId, itemId, direction)} />
          <ChoiceCell entry={right} entryNumber={selectedEntryIndex + 1} locale={rightName} icons={icons} data={rightData} compactLayout={compactLayout} metricClasses={{ characters: ready ? comparisonClass(left.totalTypedCharacters, right.totalTypedCharacters, 'right') : undefined, junk: ready ? comparisonClass(junkFor(left), junkFor(right), 'right') : undefined, score: ready ? comparisonClass(left.totalScore, right.totalScore, 'right') : undefined }} onSetItemQuery={(entryId, itemId, query) => setItemQuery(rightLocale, entryId, itemId, query)} onMoveItemCraft={(entryId, itemId, direction) => moveItemCraft(rightLocale, entryId, itemId, direction)} />
          <Differences left={left} right={right} leftName={leftName} rightName={rightName} />
        </div>
      </div>
      {ready && <OverallComparison leftModel={leftModel} rightModel={rightModel} leftName={leftName} rightName={rightName} />}
    </>}
  </div>

  if (isPage) return <section className={`language-comparison language-comparison--page${compactLayout ? ' language-comparison--compact' : ''}`} aria-label="Language craft comparison">
    <header className="language-comparison__header language-comparison__header--page"><button type="button" aria-label="Back to crafts" onClick={onBack}><span>compare languages</span><span>back to crafts <ArrowSprite direction="left" compact /></span></button></header>
    {panel}
  </section>
  return <section className={`language-comparison${isOpen ? ' language-comparison--open' : ''}`} aria-label="Language craft comparison">
    <header className="language-comparison__header"><button type="button" aria-expanded={isOpen} onClick={() => setOpen((current) => !current)}><span>compare languages</span><span>{isOpen ? 'hide' : 'show'}</span></button></header>
    {isOpen && panel}
  </section>
}
