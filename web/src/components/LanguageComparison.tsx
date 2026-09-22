import { useEffect, useMemo, useState } from 'react'

import type { IconManifest } from '../data/iconManifest'
import type { GeneratedData, LanguageMetadata, TargetWorkspaceEntry } from '../domain/types'
import { craftingSheetOptionsForSearches, type CraftingSheetOption } from '../engine/craftingSheet'
import type { ScoringSettings } from '../engine/scoring'
import { useLanguageComparison, type LanguageComparisonState } from '../hooks/useLanguageComparison'
import { englishLocaleName } from './LanguageSelector'
import { CraftPicker, QuerySequence } from './CraftingSheet'
import { ItemIcon } from './ItemIcon'
import { ArrowSprite } from './ArrowSprite'

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
  loadedLocale?: string
  loadedStates?: ReadonlyMap<string, import('../domain/types').RowOptimizationState>
  layout?: 'inline' | 'page'
  onBack?: () => void
}

type Selections = Record<string, Record<string, string>>

function scoreText(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1)
}

function languageName(locale: string, languages: readonly LanguageMetadata[]): string {
  const language = languages.find((candidate) => candidate.locale === locale)
  return language ? englishLocaleName(language, languages) : locale
}

function optionsForEntry(state: LanguageComparisonState | undefined, entryId: string): readonly CraftingSheetOption[] {
  if (state?.status !== 'ready') return []
  const outcome = state.outcomes.get(entryId)
  return outcome?.kind === 'ranked'
    ? craftingSheetOptionsForSearches(outcome.rankedSearches, outcome.bestScore)
    : []
}

function selectedOption(options: readonly CraftingSheetOption[], selections: Selections, locale: string, entryId: string): CraftingSheetOption | undefined {
  const optionId = selections[locale]?.[entryId]
  return options.find((option) => option.id === optionId) ?? options[0]
}

function comparisonClass(left: number, right: number, side: 'left' | 'right'): string | undefined {
  if (left === right) return undefined
  const leftWins = left < right
  return (side === 'left') === leftWins ? 'language-comparison__value--better' : 'language-comparison__value--worse'
}

function ChoiceCell({
  entry,
  entryNumber,
  locale,
  options,
  selected,
  icons,
  data,
  metricClasses,
  onSelect,
}: {
  entry: TargetWorkspaceEntry
  entryNumber: number
  locale: string
  options: readonly CraftingSheetOption[]
  selected: CraftingSheetOption | undefined
  icons: IconManifest
  data: GeneratedData
  metricClasses: { characters?: string; junk?: string; score?: string }
  onSelect: (optionId: string) => void
}) {
  return <section className="language-comparison__choice" aria-label={`Item set ${entryNumber} in ${locale}`}>
    <header>
      <strong>item set {entryNumber}</strong>
      <span className="language-comparison__items">{entry.targetIds.map((itemId) => <ItemIcon
        key={itemId}
        itemId={itemId}
        name={data.items.get(itemId)?.name ?? itemId}
        manifest={icons}
      />)}</span>
    </header>
    {selected
      ? <>
        <QuerySequence search={selected.search} />
        <div className="language-comparison__choice-footer">
          <span className="language-comparison__metrics">
            <span className={metricClasses.characters}>{selected.totalTypedCharacters} chars</span>
            <span className={metricClasses.junk}>{selected.junkCount} junk</span>
            <span className={metricClasses.score}>{scoreText(selected.totalScore)} score</span>
          </span>
          <CraftPicker label={`item set ${entryNumber} in ${locale}`} options={options} selectedOptionId={selected.id} onSelect={onSelect} />
        </div>
      </>
      : <p className="language-comparison__empty">{options.length === 0 ? 'No craft is available.' : 'Choose a craft.'}</p>}
  </section>
}

function Differences({ left, right, leftName, rightName }: {
  left: CraftingSheetOption | undefined
  right: CraftingSheetOption | undefined
  leftName: string
  rightName: string
}) {
  if (!left || !right) return <aside className="language-comparison__difference"><span>craft comparison will appear when both languages have a result.</span></aside>
  const metrics: Array<[string, number, number]> = [
    ['characters', left.totalTypedCharacters, right.totalTypedCharacters],
    ['junk', left.junkCount, right.junkCount],
    ['score', left.totalScore, right.totalScore],
  ]
  const scoreWinner = left.totalScore === right.totalScore ? 'the same calculated score' : `${left.totalScore < right.totalScore ? leftName : rightName} has the lower calculated score`
  return <aside className="language-comparison__difference" aria-label="Craft differences">
    <strong>comparison</strong>
    {metrics.map(([label, leftValue, rightValue]) => <div key={label}>
      <span>{label}</span>
      <span className={comparisonClass(leftValue, rightValue, 'left')}>{label === 'score' ? scoreText(leftValue) : leftValue}</span>
      <span aria-hidden="true">/</span>
      <span className={comparisonClass(leftValue, rightValue, 'right')}>{label === 'score' ? scoreText(rightValue) : rightValue}</span>
    </div>)}
    <p>{scoreWinner}.</p>
  </aside>
}

export function LanguageComparison({ baseData, entries, languages, selectedLocale, icons, dataBaseUrl, scoringSettings, itemIdSearch, loadedLocale, loadedStates, layout = 'inline', onBack }: LanguageComparisonProps) {
  const availableLocales = useMemo(() => languages.map((language) => language.locale), [languages])
  const fallbackRightLocale = useMemo(() => availableLocales.find((locale) => locale !== selectedLocale) ?? selectedLocale, [availableLocales, selectedLocale])
  const [open, setOpen] = useState(false)
  const [leftLocale, setLeftLocale] = useState(selectedLocale)
  const [rightLocale, setRightLocale] = useState(fallbackRightLocale)
  const [selections, setSelections] = useState<Selections>({})
  const activeEntries = useMemo(() => entries.filter((entry) => entry.enabled && entry.targetIds.length > 0), [entries])
  const isPage = layout === 'page'
  const isOpen = isPage || open
  const states = useLanguageComparison(baseData, activeEntries, leftLocale, rightLocale, dataBaseUrl, scoringSettings, itemIdSearch, isOpen, loadedLocale, loadedStates)
  const leftState = states.get(leftLocale)
  const rightState = states.get(rightLocale)
  const leftName = languageName(leftLocale, languages)
  const rightName = languageName(rightLocale, languages)

  useEffect(() => {
    if (!isOpen) return
    setLeftLocale(selectedLocale)
    setRightLocale((locale) => locale === selectedLocale ? (availableLocales.find((candidate) => candidate !== selectedLocale) ?? selectedLocale) : locale)
  }, [availableLocales, isOpen, selectedLocale])

  function selectCraft(locale: string, entryId: string, optionId: string) {
    setSelections((current) => ({ ...current, [locale]: { ...current[locale], [entryId]: optionId } }))
  }

  const panel = <div className="language-comparison__panel">
      <p>Choose a craft for each item set, then compare typed characters, junk, and the calculated score.</p>
      <div className="language-comparison__language-selectors">
        <label>left language
          <select aria-label="Left comparison language" value={leftLocale} onChange={(event) => setLeftLocale(event.target.value)}>
            {availableLocales.map((locale) => <option key={locale} value={locale}>{languageName(locale, languages)}</option>)}
          </select>
        </label>
        <label>right language
          <select aria-label="Right comparison language" value={rightLocale} onChange={(event) => setRightLocale(event.target.value)}>
            {availableLocales.map((locale) => <option key={locale} value={locale}>{languageName(locale, languages)}</option>)}
          </select>
        </label>
      </div>
      {activeEntries.length === 0 && <p className="language-comparison__empty">Add an item set with a search goal to compare languages.</p>}
      {(leftState?.status === 'pending' || rightState?.status === 'pending') && <p className="language-comparison__status">calculating comparison…</p>}
      {(leftState?.status === 'unavailable' || rightState?.status === 'unavailable') && <p className="language-comparison__status">The comparison could not be calculated for one of these languages.</p>}
      {activeEntries.length > 0 && <div className="language-comparison__table">
        <header>
          <strong>{leftName}</strong><strong>{rightName}</strong><strong>differences</strong>
        </header>
        {activeEntries.map((entry, index) => {
          const leftOptions = optionsForEntry(leftState, entry.id)
          const rightOptions = optionsForEntry(rightState, entry.id)
          const left = selectedOption(leftOptions, selections, leftLocale, entry.id)
          const right = selectedOption(rightOptions, selections, rightLocale, entry.id)
          return <div key={entry.id} className="language-comparison__row">
            <ChoiceCell entry={entry} entryNumber={index + 1} locale={leftName} options={leftOptions} selected={left} icons={icons} data={baseData}
              metricClasses={{
                characters: left && right ? comparisonClass(left.totalTypedCharacters, right.totalTypedCharacters, 'left') : undefined,
                junk: left && right ? comparisonClass(left.junkCount, right.junkCount, 'left') : undefined,
                score: left && right ? comparisonClass(left.totalScore, right.totalScore, 'left') : undefined,
              }} onSelect={(optionId) => selectCraft(leftLocale, entry.id, optionId)} />
            <ChoiceCell entry={entry} entryNumber={index + 1} locale={rightName} options={rightOptions} selected={right} icons={icons} data={baseData}
              metricClasses={{
                characters: left && right ? comparisonClass(left.totalTypedCharacters, right.totalTypedCharacters, 'right') : undefined,
                junk: left && right ? comparisonClass(left.junkCount, right.junkCount, 'right') : undefined,
                score: left && right ? comparisonClass(left.totalScore, right.totalScore, 'right') : undefined,
              }} onSelect={(optionId) => selectCraft(rightLocale, entry.id, optionId)} />
            <Differences left={left} right={right} leftName={leftName} rightName={rightName} />
          </div>
        })}
      </div>}
    </div>

  if (isPage) return <section className="language-comparison language-comparison--page" aria-label="Language craft comparison">
    <header className="language-comparison__header language-comparison__header--page">
      <button type="button" aria-label="Back to crafts" onClick={onBack}>
        <span>compare languages</span>
        <span>back to crafts <ArrowSprite direction="left" compact /></span>
      </button>
    </header>
    {panel}
  </section>

  return <section className={`language-comparison${isOpen ? ' language-comparison--open' : ''}`} aria-label="Language craft comparison">
    <header className="language-comparison__header">
      <button type="button" aria-expanded={isOpen} onClick={() => setOpen((current) => !current)}>
        <span>compare languages</span>
        <span>{isOpen ? 'hide' : 'show'}</span>
      </button>
    </header>
    {isOpen && panel}
  </section>
}
