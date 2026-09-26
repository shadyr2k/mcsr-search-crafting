import { Fragment, useEffect, useId, useMemo, useState, type CSSProperties } from 'react'

import type { IconManifest } from '../data/iconManifest'
import type { GeneratedData, LanguageMetadata, LanguageScoreState, RowOptimizationState, TargetWorkspaceEntry } from '../domain/types'
import type { CraftingSheetEntry } from '../engine/craftingSheet'
import type { ScoringSettings } from '../engine/scoring'
import { useLanguageComparison, type LanguageComparisonState } from '../hooks/useLanguageComparison'
import { useCraftingSheet } from '../hooks/useCraftingSheet'
import { ArrowSprite } from './ArrowSprite'
import { CraftQueryInput, type CraftQueryResult, QuerySequence } from './CraftingSheet'
import { ItemIcon } from './ItemIcon'
import { englishLocaleName, languageDisplayName, LanguageDropdown } from './LanguageSelector'

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
  languageScores?: ReadonlyMap<string, LanguageScoreState>
  minecraftVersion?: string
  loadedLocale?: string
  loadedStates?: ReadonlyMap<string, RowOptimizationState>
  loadedData?: GeneratedData
  layout?: 'inline' | 'page'
  compactLayout?: boolean
  onBack?: () => void
}

type ComparisonRequest = { leftLocale: string; rightLocale: string }
interface ScoreRange { minimum: number; maximum: number }

function scoreText(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1)
}

function languageName(locale: string, languages: readonly LanguageMetadata[]): string {
  const language = languages.find((candidate) => candidate.locale === locale)
  return language ? englishLocaleName(language, languages) : locale
}

function selectedLanguageLabel(locale: string, languages: readonly LanguageMetadata[]): string {
  const language = languages.find((candidate) => candidate.locale === locale)
  return language ? `${englishLocaleName(language, languages)} - ${languageDisplayName(language)}` : locale
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

function rowStatesFor(state: LanguageComparisonState | undefined, entries: readonly TargetWorkspaceEntry[]): ReadonlyMap<string, RowOptimizationState> {
  const rows = new Map<string, RowOptimizationState>()
  for (const entry of entries) {
    const outcome = state?.status === 'ready' ? state.outcomes.get(entry.id) : undefined
    if (outcome) rows.set(entry.id, { status: 'ready', fingerprint: 'language-comparison', outcome })
    else if (state?.status === 'unavailable') rows.set(entry.id, { status: 'error', fingerprint: 'language-comparison', message: state.message ?? 'Calculation failed.' })
    else rows.set(entry.id, { status: 'pending', fingerprint: 'language-comparison' })
  }
  return rows
}

function scoreRange(languageScores: ReadonlyMap<string, LanguageScoreState>, extraScores: readonly number[]): ScoreRange {
  const cachedScores = [...languageScores.values()]
    .filter((score): score is Extract<LanguageScoreState, { status: 'ready' }> => score.status === 'ready')
    .map((score) => score.score)
  const scores = cachedScores.length > 0 ? cachedScores : extraScores.filter(Number.isFinite)
  const minimum = Math.min(...scores)
  const maximum = Math.max(...scores)
  return Number.isFinite(minimum) && Number.isFinite(maximum) ? { minimum, maximum } : { minimum: 0, maximum: 0 }
}

function scoreStyle(score: number, range: ScoreRange): CSSProperties {
  const position = range.maximum === range.minimum ? .5 : Math.max(0, Math.min(1, (score - range.minimum) / (range.maximum - range.minimum)))
  return { '--language-comparison-score-hue': String(Math.round(120 * (1 - position))) } as CSSProperties
}

function LanguageCraftRow({ entry, entryNumber, locale, icons, data, metricClasses, compactLayout = false, onSetItemQuery, onMoveItemCraft }: {
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
  const ready = entry?.status === 'ready'
  return <section className="language-comparison__language-row" aria-label={`Item set ${entryNumber} in ${locale}`}>
    <header><strong>{locale}</strong><span className="language-comparison__items">{entry?.itemIds.map((itemId) => <ItemIcon key={itemId} itemId={itemId} name={nameFor(itemId)} manifest={icons} />)}</span></header>
    {ready
      ? <><div className="language-comparison__selected-craft">
        {entry.selectedSearch && <QuerySequence search={entry.selectedSearch} />}
        <span className="language-comparison__metrics"><span className={metricClasses.characters}>{entry.totalTypedCharacters} chars</span><span className={metricClasses.junk}>{junkFor(entry)} junk</span><span className={metricClasses.score}>{scoreText(entry.totalScore)} score</span></span>
      </div><div className="language-comparison__items-editor">
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
      </div></>
      : <p className="language-comparison__empty">{entry?.status === 'pending' ? 'Calculating crafts…' : 'No craft is available.'}</p>}
  </section>
}

function CraftPreview({ entry, language }: { entry: CraftingSheetEntry | undefined; language: string }) {
  return <span className="language-comparison__craft-preview"><strong>{language}</strong>{entry?.status === 'ready' && entry.selectedSearch
    ? <QuerySequence search={entry.selectedSearch} />
    : <span className="language-comparison__preview-empty">{entry?.status === 'pending' ? 'calculating…' : 'no craft'}</span>}</span>
}

function ItemSetComparison({ entry, entryNumber, baseData, left, right, leftName, rightName, icons, leftData, rightData, compactLayout, onSetItemQuery, onMoveItemCraft }: {
  entry: TargetWorkspaceEntry
  entryNumber: number
  baseData: GeneratedData
  left: CraftingSheetEntry | undefined
  right: CraftingSheetEntry | undefined
  leftName: string
  rightName: string
  icons: IconManifest
  leftData: GeneratedData | undefined
  rightData: GeneratedData | undefined
  compactLayout: boolean
  onSetItemQuery: (side: 'left' | 'right', entryId: string, itemId: string, query: string) => CraftQueryResult
  onMoveItemCraft: (side: 'left' | 'right', entryId: string, itemId: string, direction: -1 | 1) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const detailsId = useId()
  const ready = left?.status === 'ready' && right?.status === 'ready'
  return <section className={`language-comparison__item-set${isOpen ? ' language-comparison__item-set--open' : ''}`} aria-label={`Item set ${entryNumber} comparison`}>
    <button type="button" className="language-comparison__item-set-toggle" aria-expanded={isOpen} aria-controls={detailsId} aria-label={`${isOpen ? 'Collapse' : 'Expand'} item set ${entryNumber} comparison`} onClick={() => setIsOpen((current) => !current)}>
      <span className="language-comparison__item-set-heading"><strong>{entryLabel(entry, entryNumber - 1, baseData)}</strong><span className="language-comparison__items">{entry.targetIds.map((itemId) => <ItemIcon key={itemId} itemId={itemId} name={itemName(itemId, baseData)} manifest={icons} />)}</span></span>
      <span className="language-comparison__craft-previews"><CraftPreview entry={left} language={leftName} /><CraftPreview entry={right} language={rightName} /></span>
      <span aria-hidden="true"><ArrowSprite direction={isOpen ? 'up' : 'down'} compact /></span>
    </button>
    {isOpen && <div id={detailsId} className="language-comparison__item-set-details">
      <LanguageCraftRow entry={left} entryNumber={entryNumber} locale={leftName} icons={icons} data={leftData} compactLayout={compactLayout}
        metricClasses={{ characters: ready ? comparisonClass(left.totalTypedCharacters, right.totalTypedCharacters, 'left') : undefined, junk: ready ? comparisonClass(junkFor(left), junkFor(right), 'left') : undefined, score: ready ? comparisonClass(left.totalScore, right.totalScore, 'left') : undefined }}
        onSetItemQuery={(entryId, itemId, query) => onSetItemQuery('left', entryId, itemId, query)} onMoveItemCraft={(entryId, itemId, direction) => onMoveItemCraft('left', entryId, itemId, direction)} />
      <LanguageCraftRow entry={right} entryNumber={entryNumber} locale={rightName} icons={icons} data={rightData} compactLayout={compactLayout}
        metricClasses={{ characters: ready ? comparisonClass(left.totalTypedCharacters, right.totalTypedCharacters, 'right') : undefined, junk: ready ? comparisonClass(junkFor(left), junkFor(right), 'right') : undefined, score: ready ? comparisonClass(left.totalScore, right.totalScore, 'right') : undefined }}
        onSetItemQuery={(entryId, itemId, query) => onSetItemQuery('right', entryId, itemId, query)} onMoveItemCraft={(entryId, itemId, direction) => onMoveItemCraft('right', entryId, itemId, direction)} />
    </div>}
  </section>
}

function ScoreBox({ label, score, range, className }: { label: string; score: number; range: ScoreRange; className?: string }) {
  return <div className={`language-comparison__score-box${className ? ` ${className}` : ''}`} style={scoreStyle(score, range)}><span>{label}</span><strong>{scoreText(score)}</strong></div>
}

function OverallComparison({ leftScore, rightScore, leftName, rightName, range }: { leftScore: number; rightScore: number; leftName: string; rightName: string; range: ScoreRange }) {
  const winner = leftScore === rightScore ? 'Both languages have the same calculated total score.' : `${leftScore < rightScore ? leftName : rightName} is better suited for the current item sets.`
  return <aside className="language-comparison__overall" aria-label="Overall language comparison">
    <strong>overall comparison</strong>
    <div className="language-comparison__overall-scores"><ScoreBox label={leftName} score={leftScore} range={range} /><ScoreBox label={rightName} score={rightScore} range={range} /></div>
    <p>{winner}</p>
  </aside>
}

function ItemSetScoreCard({ entryNumber, left, right }: { entryNumber: number; left: CraftingSheetEntry | undefined; right: CraftingSheetEntry | undefined }) {
  if (left?.status !== 'ready' || right?.status !== 'ready') return <aside className="language-comparison__item-score-card"><strong>item set {entryNumber}</strong><span>scores will appear when both crafts are ready.</span></aside>
  const metrics: Array<[string, number, number, boolean]> = [
    ['chars', left.totalTypedCharacters, right.totalTypedCharacters, false],
    ['junk', junkFor(left), junkFor(right), false],
    ['score', left.totalScore, right.totalScore, true],
  ]
  return <aside className="language-comparison__item-score-card" aria-label={`Item set ${entryNumber} scores`}>
    <strong>item set {entryNumber}</strong>
    <div className="language-comparison__item-score-values">{metrics.map(([label, leftValue, rightValue, isScore]) => <div key={label}>
      <strong>{label}</strong>
      <span className={comparisonClass(leftValue, rightValue, 'left')}>{isScore ? scoreText(leftValue) : leftValue}</span>
      <span aria-hidden="true">/</span>
      <span className={comparisonClass(leftValue, rightValue, 'right')}>{isScore ? scoreText(rightValue) : rightValue}</span>
    </div>)}</div>
  </aside>
}

export function LanguageComparison({ baseData, entries, languages, selectedLocale, icons, dataBaseUrl, scoringSettings, itemIdSearch, languageScores = new Map(), minecraftVersion, loadedLocale, loadedStates, loadedData, layout = 'inline', compactLayout = false, onBack }: LanguageComparisonProps) {
  const availableLocales = useMemo(() => languages.map((language) => language.locale), [languages])
  const fallbackRightLocale = useMemo(() => availableLocales.find((locale) => locale !== selectedLocale) ?? selectedLocale, [availableLocales, selectedLocale])
  const [open, setOpen] = useState(false)
  const [leftLocale, setLeftLocale] = useState(selectedLocale)
  const [rightLocale, setRightLocale] = useState(fallbackRightLocale)
  const [comparisonRequest, setComparisonRequest] = useState<ComparisonRequest>()
  const [selectedEntryId, setSelectedEntryId] = useState<string>()
  const activeEntries = useMemo(() => entries.filter((entry) => entry.enabled && entry.targetIds.length > 0), [entries])
  const isPage = layout === 'page'
  const isOpen = isPage || open
  const isComparisonRequested = comparisonRequest?.leftLocale === leftLocale && comparisonRequest.rightLocale === rightLocale
  const states = useLanguageComparison(baseData, activeEntries, leftLocale, rightLocale, dataBaseUrl, scoringSettings, itemIdSearch, isOpen && isComparisonRequested, loadedLocale, loadedStates, loadedData, minecraftVersion)
  const leftState = states.get(leftLocale)
  const rightState = states.get(rightLocale)
  const leftData = leftState?.status === 'ready' ? leftState.data : undefined
  const rightData = rightState?.status === 'ready' ? rightState.data : undefined
  const leftSheet = useCraftingSheet(leftLocale, entries, rowStatesFor(leftState, entries), minecraftVersion, true, scoringSettings, leftData, itemIdSearch, true)
  const rightSheet = useCraftingSheet(rightLocale, entries, rowStatesFor(rightState, entries), minecraftVersion, true, scoringSettings, rightData, itemIdSearch, true)
  const leftEntries = useMemo(() => new Map(leftSheet.entries.map((entry) => [entry.id, entry])), [leftSheet.entries])
  const rightEntries = useMemo(() => new Map(rightSheet.entries.map((entry) => [entry.id, entry])), [rightSheet.entries])
  const leftName = languageName(leftLocale, languages)
  const rightName = languageName(rightLocale, languages)
  const leftSelectedLanguage = selectedLanguageLabel(leftLocale, languages)
  const rightSelectedLanguage = selectedLanguageLabel(rightLocale, languages)
  const selectedEntryIndex = Math.max(0, activeEntries.findIndex((entry) => entry.id === selectedEntryId))
  const selectedEntry = activeEntries[selectedEntryIndex]
  const range = scoreRange(languageScores, [leftSheet.totalScore, rightSheet.totalScore])

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

  const comparisonEntries = activeEntries.map((entry, index) => ({ entry, index, left: leftEntries.get(entry.id), right: rightEntries.get(entry.id) }))
  const selectedComparison = selectedEntry === undefined ? undefined : comparisonEntries.find((comparison) => comparison.entry.id === selectedEntry.id)
  const displayedComparisons = compactLayout && selectedComparison ? [selectedComparison] : comparisonEntries
  const panel = <div className="language-comparison__panel">
    <header className="language-comparison__selection-header">
      <p>Select two languages, then compare their calculated crafts. Changes to either craft are saved to that language’s crafting sheet.</p>
      <div className="language-comparison__language-selectors">
        <label><span className="language-comparison__selected-language"><small>left language</small><strong>{leftSelectedLanguage}</strong></span><LanguageDropdown label="Left comparison language" languages={languages} selectedLocale={leftLocale} onSelect={chooseLeftLocale} /></label>
        <label><span className="language-comparison__selected-language"><small>right language</small><strong>{rightSelectedLanguage}</strong></span><LanguageDropdown label="Right comparison language" languages={languages} selectedLocale={rightLocale} onSelect={chooseRightLocale} /></label>
      </div>
      <button type="button" className="language-comparison__start" disabled={activeEntries.length === 0} onClick={() => setComparisonRequest({ leftLocale, rightLocale })}>compare</button>
    </header>
    {activeEntries.length === 0 && <p className="language-comparison__empty">Add an item set with a search goal to compare languages.</p>}
    {!isComparisonRequested && activeEntries.length > 0 && <p className="language-comparison__status">Choose two languages, then press compare to calculate and save their default crafts.</p>}
    {isComparisonRequested && (leftState?.status === 'pending' || rightState?.status === 'pending') && <p className="language-comparison__status">calculating comparison…</p>}
    {isComparisonRequested && (leftState?.status === 'unavailable' || rightState?.status === 'unavailable') && <p className="language-comparison__status">The comparison could not be calculated for one of these languages.</p>}
    {isComparisonRequested && selectedComparison && <>
      {compactLayout && <nav className="language-comparison__navigator" aria-label="Item set navigation"><button type="button" aria-label="Previous item set" disabled={selectedEntryIndex === 0} onClick={() => setSelectedEntryId(activeEntries[selectedEntryIndex - 1]?.id)}><ArrowSprite direction="left" compact /></button><label>item set<select aria-label="Compared item set" value={selectedEntry.id} onChange={(event) => setSelectedEntryId(event.target.value)}>{activeEntries.map((entry, index) => <option key={entry.id} value={entry.id}>{entryLabel(entry, index, baseData)}</option>)}</select></label><button type="button" aria-label="Next item set" disabled={selectedEntryIndex === activeEntries.length - 1} onClick={() => setSelectedEntryId(activeEntries[selectedEntryIndex + 1]?.id)}><ArrowSprite direction="right" compact /></button></nav>}
      <div className="language-comparison__comparison-grid">
        <OverallComparison leftScore={leftSheet.totalScore} rightScore={rightSheet.totalScore} leftName={leftName} rightName={rightName} range={range} />
        <section className="language-comparison__comparison-rows" aria-label="Compared item sets">
          <header className="language-comparison__item-sets-heading"><strong>{compactLayout ? 'selected item set' : 'item sets'}</strong></header>
          <header className="language-comparison__item-scores-heading"><strong>item set scores</strong></header>
          {displayedComparisons.map((comparison) => <Fragment key={comparison.entry.id}>
            <ItemSetComparison entry={comparison.entry} entryNumber={comparison.index + 1} baseData={baseData} left={comparison.left} right={comparison.right} leftName={leftName} rightName={rightName} icons={icons} leftData={leftData} rightData={rightData} compactLayout={compactLayout} onSetItemQuery={(side, entryId, itemId, query) => (side === 'left' ? leftSheet : rightSheet).setItemQuery(entryId, itemId, query)} onMoveItemCraft={(side, entryId, itemId, direction) => (side === 'left' ? leftSheet : rightSheet).moveItemCraft(entryId, itemId, direction)} />
            <ItemSetScoreCard entryNumber={comparison.index + 1} left={comparison.left} right={comparison.right} />
          </Fragment>)}
        </section>
      </div>
    </>}
  </div>

  if (isPage) return <section className={`language-comparison language-comparison--page${compactLayout ? ' language-comparison--compact' : ''}`} aria-label="Language craft comparison"><header className="language-comparison__header language-comparison__header--page"><button type="button" aria-label="Back to crafts" onClick={onBack}><span>compare languages</span><span>back to crafts <ArrowSprite direction="left" compact /></span></button></header>{panel}</section>
  return <section className={`language-comparison${isOpen ? ' language-comparison--open' : ''}`} aria-label="Language craft comparison"><header className="language-comparison__header"><button type="button" aria-expanded={isOpen} onClick={() => setOpen((current) => !current)}><span>compare languages</span><span>{isOpen ? 'hide' : 'show'}</span></button></header>{isOpen && panel}</section>
}
