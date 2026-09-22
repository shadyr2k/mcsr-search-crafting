import { useEffect, useMemo, useState } from 'react'

import type { IconManifest } from '../data/iconManifest'
import type { CraftingSheetSelection, GeneratedData, LanguageMetadata, RowOptimizationState, TargetWorkspaceEntry } from '../domain/types'
import { createCraftingSheetModel, type CraftingSheetEntry } from '../engine/craftingSheet'
import type { ScoringSettings } from '../engine/scoring'
import { useLanguageComparison, type LanguageComparisonState } from '../hooks/useLanguageComparison'
import { ArrowSprite } from './ArrowSprite'
import { CraftPicker, QuerySequence } from './CraftingSheet'
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
  layout?: 'inline' | 'page'
  compactLayout?: boolean
  onBack?: () => void
}

type Selections = Record<string, Record<string, CraftingSheetSelection>>

function scoreText(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1)
}

function languageName(locale: string, languages: readonly LanguageMetadata[]): string {
  const language = languages.find((candidate) => candidate.locale === locale)
  return language ? englishLocaleName(language, languages) : locale
}

function comparisonClass(left: number, right: number, side: 'left' | 'right'): string | undefined {
  if (left === right) return undefined
  const leftWins = left < right
  return (side === 'left') === leftWins ? 'language-comparison__value--better' : 'language-comparison__value--worse'
}

function junkFor(entry: CraftingSheetEntry | undefined): number {
  return entry?.selectedSearch?.totalJunkAppearances ?? 0
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

function ChoiceCell({
  entry,
  entryNumber,
  locale,
  icons,
  data,
  metricClasses,
  onSelectItemCraft,
  onMoveItemCraft,
}: {
  entry: CraftingSheetEntry | undefined
  entryNumber: number
  locale: string
  icons: IconManifest
  data: GeneratedData
  metricClasses: { characters?: string; junk?: string; score?: string }
  onSelectItemCraft: (entryId: string, itemId: string, optionId: string) => void
  onMoveItemCraft: (entryId: string, itemId: string, direction: -1 | 1) => void
}) {
  const itemName = (itemId: string) => data.items.get(itemId)?.name ?? itemId.replace(/^minecraft:/, '').replaceAll('_', ' ')
  return <section className="language-comparison__choice" aria-label={`Item set ${entryNumber} in ${locale}`}>
    <header>
      <strong>item set {entryNumber}</strong>
      <span className="language-comparison__items">{entry?.itemIds.map((itemId) => <ItemIcon key={itemId} itemId={itemId} name={itemName(itemId)} manifest={icons} />)}</span>
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
            const name = itemName(choice.itemId)
            return <div key={choice.itemId} className="language-comparison__item-choice">
              <span className="language-comparison__reorder" role="group" aria-label={`Reorder ${name} in ${locale}`}>
                {([-1, 1] as const).map((direction) => <button key={direction} type="button" disabled={direction === -1 ? index === 0 : index === entry.itemChoices.length - 1} aria-label={`Move ${name} ${direction === -1 ? 'up' : 'down'} in ${locale}`} onClick={() => onMoveItemCraft(entry.id, choice.itemId, direction)}><ArrowSprite direction={direction === -1 ? 'up' : 'down'} compact /></button>)}
              </span>
              <ItemIcon itemId={choice.itemId} name={name} manifest={icons} />
              {selected && <QuerySequence search={selected.search} />}
              <CraftPicker label={`${name} in ${locale}`} options={choice.options} selectedOptionId={choice.selectedOptionId} onSelect={(optionId) => onSelectItemCraft(entry.id, choice.itemId, optionId)} closeOnOutsidePointer />
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

export function LanguageComparison({ baseData, entries, languages, selectedLocale, icons, dataBaseUrl, scoringSettings, itemIdSearch, minecraftVersion, loadedLocale, loadedStates, layout = 'inline', compactLayout = false, onBack }: LanguageComparisonProps) {
  const availableLocales = useMemo(() => languages.map((language) => language.locale), [languages])
  const fallbackRightLocale = useMemo(() => availableLocales.find((locale) => locale !== selectedLocale) ?? selectedLocale, [availableLocales, selectedLocale])
  const [open, setOpen] = useState(false)
  const [leftLocale, setLeftLocale] = useState(selectedLocale)
  const [rightLocale, setRightLocale] = useState(fallbackRightLocale)
  const [selections, setSelections] = useState<Selections>({})
  const activeEntries = useMemo(() => entries.filter((entry) => entry.enabled && entry.targetIds.length > 0), [entries])
  const isPage = layout === 'page'
  const isOpen = isPage || open
  const states = useLanguageComparison(baseData, activeEntries, leftLocale, rightLocale, dataBaseUrl, scoringSettings, itemIdSearch, isOpen, loadedLocale, loadedStates, minecraftVersion)
  const leftState = states.get(leftLocale)
  const rightState = states.get(rightLocale)
  const leftName = languageName(leftLocale, languages)
  const rightName = languageName(rightLocale, languages)
  const leftModel = useMemo(() => createCraftingSheetModel(activeEntries, rowStatesFor(leftState, activeEntries), selections[leftLocale], scoringSettings), [activeEntries, leftLocale, leftState, scoringSettings, selections])
  const rightModel = useMemo(() => createCraftingSheetModel(activeEntries, rowStatesFor(rightState, activeEntries), selections[rightLocale], scoringSettings), [activeEntries, rightLocale, rightState, scoringSettings, selections])
  const leftEntries = useMemo(() => new Map(leftModel.entries.map((entry) => [entry.id, entry])), [leftModel.entries])
  const rightEntries = useMemo(() => new Map(rightModel.entries.map((entry) => [entry.id, entry])), [rightModel.entries])

  useEffect(() => {
    if (!isOpen) return
    setLeftLocale(selectedLocale)
    setRightLocale((locale) => locale === selectedLocale ? (availableLocales.find((candidate) => candidate !== selectedLocale) ?? selectedLocale) : locale)
  }, [availableLocales, isOpen, selectedLocale])

  function updateSelection(locale: string, entryId: string, update: (selection: CraftingSheetSelection) => CraftingSheetSelection) {
    setSelections((current) => ({ ...current, [locale]: { ...current[locale], [entryId]: update(current[locale]?.[entryId] ?? {}) } }))
  }
  function selectItemCraft(locale: string, entryId: string, itemId: string, optionId: string) {
    updateSelection(locale, entryId, (selection) => ({ ...selection, mode: 'individual', itemCraftKeys: { ...selection.itemCraftKeys, [itemId]: optionId } }))
  }
  function moveItemCraft(locale: string, entryId: string, itemId: string, direction: -1 | 1) {
    const currentEntry = (locale === leftLocale ? leftEntries : rightEntries).get(entryId)
    const order = currentEntry?.itemChoices.map((choice) => choice.itemId) ?? []
    const index = order.indexOf(itemId)
    const destination = index + direction
    if (index < 0 || destination < 0 || destination >= order.length) return
    ;[order[index], order[destination]] = [order[destination], order[index]]
    updateSelection(locale, entryId, (selection) => ({ ...selection, mode: 'individual', itemOrder: order }))
  }

  const panel = <div className="language-comparison__panel">
    <p>Choose and reorder a craft for every item, then compare typed characters, junk, and the calculated score.</p>
    <div className="language-comparison__language-selectors">
      <label>left language<LanguageDropdown label="Left comparison language" languages={languages} selectedLocale={leftLocale} onSelect={setLeftLocale} /></label>
      <label>right language<LanguageDropdown label="Right comparison language" languages={languages} selectedLocale={rightLocale} onSelect={setRightLocale} /></label>
    </div>
    {activeEntries.length === 0 && <p className="language-comparison__empty">Add an item set with a search goal to compare languages.</p>}
    {(leftState?.status === 'pending' || rightState?.status === 'pending') && <p className="language-comparison__status">calculating comparison…</p>}
    {(leftState?.status === 'unavailable' || rightState?.status === 'unavailable') && <p className="language-comparison__status">The comparison could not be calculated for one of these languages.</p>}
    {activeEntries.length > 0 && <div className="language-comparison__table">
      <header><strong>{leftName}</strong><strong>{rightName}</strong><strong>differences</strong></header>
      {activeEntries.map((sourceEntry, index) => {
        const left = leftEntries.get(sourceEntry.id)
        const right = rightEntries.get(sourceEntry.id)
        const ready = left?.status === 'ready' && right?.status === 'ready'
        return <div key={sourceEntry.id} className="language-comparison__row">
          <ChoiceCell entry={left} entryNumber={index + 1} locale={leftName} icons={icons} data={baseData} metricClasses={{ characters: ready ? comparisonClass(left.totalTypedCharacters, right.totalTypedCharacters, 'left') : undefined, junk: ready ? comparisonClass(junkFor(left), junkFor(right), 'left') : undefined, score: ready ? comparisonClass(left.totalScore, right.totalScore, 'left') : undefined }} onSelectItemCraft={(entryId, itemId, optionId) => selectItemCraft(leftLocale, entryId, itemId, optionId)} onMoveItemCraft={(entryId, itemId, direction) => moveItemCraft(leftLocale, entryId, itemId, direction)} />
          <ChoiceCell entry={right} entryNumber={index + 1} locale={rightName} icons={icons} data={baseData} metricClasses={{ characters: ready ? comparisonClass(left.totalTypedCharacters, right.totalTypedCharacters, 'right') : undefined, junk: ready ? comparisonClass(junkFor(left), junkFor(right), 'right') : undefined, score: ready ? comparisonClass(left.totalScore, right.totalScore, 'right') : undefined }} onSelectItemCraft={(entryId, itemId, optionId) => selectItemCraft(rightLocale, entryId, itemId, optionId)} onMoveItemCraft={(entryId, itemId, direction) => moveItemCraft(rightLocale, entryId, itemId, direction)} />
          <Differences left={left} right={right} leftName={leftName} rightName={rightName} />
        </div>
      })}
    </div>}
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
