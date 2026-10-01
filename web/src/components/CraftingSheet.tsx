import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import type { IconManifest } from '../data/iconManifest'
import type { RankedSearch, SearchItem } from '../domain/types'
import { craftingSheetOptionsForSearches, type CraftingSheetCharacterUsage, type CraftingSheetEntry, type CraftingSheetOption } from '../engine/craftingSheet'
import { matchingCraftQuerySearches } from '../engine/craftQuerySuggestions'
import { ArrowSprite } from './ArrowSprite'
import { ItemIcon } from './ItemIcon'
import { isScrollbarPointer } from './outsidePointer'
import { TapOrScrollButton } from './TapOrScrollButton'
import { QueryControl } from './QueryControl'
import { DEFAULT_KEYBOARD_SETTINGS, type KeyboardSettings } from '../domain/keyboard'
import { KeyboardPlayback } from './KeyboardPlayback'

import './CraftingSheet.css'

export type { CraftingSheetEntry, CraftingSheetCharacterUsage } from '../engine/craftingSheet'

export interface CraftingSheetProps {
  languageName: string
  entries: readonly CraftingSheetEntry[]
  disabledEntries: readonly CraftingSheetEntry[]
  characterSet: readonly string[]
  characterUsages: readonly CraftingSheetCharacterUsage[]
  optimalCharacterCount: number
  totalTypedCharacters: number
  totalScore: number
  scoreDelta: number
  items?: ReadonlyMap<string, SearchItem>
  icons?: IconManifest
  isCalculating?: boolean
  warning?: string
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  layout?: 'inline' | 'page'
  compactLayout?: boolean
  keyboardSettings?: KeyboardSettings
  removeAnimations?: boolean
  onBack?: () => void
  onCompare?: () => void
  onPreviewItemQuery?: (entryId: string, itemId: string, query: string) => CraftingSheetOption | undefined
  onSetItemQuery: (entryId: string, itemId: string, query: string) => CraftQueryResult
  onMoveItemCraft: (entryId: string, itemId: string, direction: -1 | 1) => void
  onSetEntryDisabled: (entryId: string, disabled: boolean) => void
  onReset: () => void
}

function itemName(itemId: string, items: CraftingSheetProps['items']): string {
  return items?.get(itemId)?.name ?? itemId.replace(/^minecraft:/, '').replaceAll('_', ' ')
}

function deltaLabel(delta: number): string {
  return delta === 0 ? 'best score' : `${delta > 0 ? '+' : ''}${delta} score`
}

function totalScoreHue(entries: readonly CraftingSheetEntry[], scoreDelta: number): number {
  const maximumDelta = entries.reduce((total, entry) => {
    if (entry.disabled || entry.status !== 'ready') return total
    const bestScore = entry.totalScore - entry.scoreDelta
    const worstScore = Math.max(entry.totalScore, ...entry.options.map((option) => option.totalScore))
    return total + Math.max(0, worstScore - bestScore)
  }, 0)
  const severity = maximumDelta === 0 ? 0 : Math.min(1, Math.max(0, scoreDelta / maximumDelta))
  return Math.round(132 * (1 - severity))
}

export function SheetDisclosure({ id, open, children, sizeWhileCollapsed = false }: { id: string; open: boolean; children: ReactNode; sizeWhileCollapsed?: boolean }) {
  const [hasOpened, setHasOpened] = useState(open)
  const [isClosing, setIsClosing] = useState(false)
  const detailsRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (open) {
      setHasOpened(true)
      setIsClosing(false)
      return
    }
    if (!hasOpened) return
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
      || detailsRef.current?.closest('.app-shell--remove-animations') !== null
    if (reducedMotion) {
      setIsClosing(false)
      if (!sizeWhileCollapsed) setHasOpened(false)
      return
    }
    setIsClosing(true)
  }, [hasOpened, open, sizeWhileCollapsed])

  if (!open && !hasOpened && !sizeWhileCollapsed) return null

  return <div ref={detailsRef} id={id} className={`crafting-sheet__details${open ? ' crafting-sheet__details--open' : ''}${isClosing ? ' crafting-sheet__details--closing' : ''}`} aria-hidden={!open} inert={!open}
    onAnimationEnd={(event) => {
      if (event.target !== event.currentTarget || event.animationName !== 'crafting-sheet-details-conceal') return
      setIsClosing(false)
      if (!sizeWhileCollapsed) setHasOpened(false)
    }}>
    <div className="crafting-sheet__details-clip">{children}</div>
  </div>
}

export function QuerySequence({ search }: { search: RankedSearch }) {
  return <span className="crafting-sheet__sequence" dir="ltr">
    {search.steps.map((step, index) => {
      const replaces = index > 0 && step.retainedPrefix.length === 0 && step.freeBackspaceCount >= search.steps[index - 1].query.length
      return <Fragment key={index}>
        {index > 0 && (replaces
          ? <QueryControl kind="shift-home" textKeycaps keycapClassName="crafting-sheet__key" />
          : step.freeBackspaceCount > 0
            ? <QueryControl kind="backspace" backspaceCount={step.freeBackspaceCount} textKeycaps keycapClassName="crafting-sheet__key" />
            : <span className="crafting-sheet__key" aria-label={step.typedSuffix ? 'Continue typing' : 'Keep search'}>{step.typedSuffix ? '→' : 'keep search'}</span>)}
        <span className="crafting-sheet__query-text" title={`Search: ${step.query.replaceAll(' ', '_')}`}>{(index === 0 ? step.query : step.typedSuffix).replaceAll(' ', '_')}</span>
      </Fragment>
    })}
  </span>
}

function ItemLabels({ itemIds, items, icons }: { itemIds: readonly string[]; items: CraftingSheetProps['items']; icons: CraftingSheetProps['icons'] }) {
  return <span className="crafting-sheet__items">{itemIds.map((itemId) => <span key={itemId} className="crafting-sheet__item">
    {icons && <ItemIcon itemId={itemId} name={itemName(itemId, items)} manifest={icons} />}
    {!icons && <span role="img" aria-label={itemName(itemId, items)} title={itemName(itemId, items)}>◇</span>}
  </span>)}</span>
}

function ItemSetCard({ entry, items, icons, onPreviewItemQuery, onSetItemQuery, onMoveItemCraft, onSetEntryDisabled, compactLayout = false, keyboardSettings = DEFAULT_KEYBOARD_SETTINGS, removeAnimations = false, isOpen, onOpenChange }: Pick<CraftingSheetProps, 'items' | 'icons' | 'onPreviewItemQuery' | 'onSetItemQuery' | 'onMoveItemCraft' | 'onSetEntryDisabled' | 'compactLayout' | 'keyboardSettings' | 'removeAnimations'> & { entry: CraftingSheetEntry; isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const headingId = useId()
  const detailsId = useId()
  const summaryGroups = entry.itemIds.reduce<{ itemIds: string[]; step?: RankedSearch['steps'][number] }[]>((groups, itemId) => {
    const step = entry.selectedSearch?.steps.find((current) => current.newTargetIds.includes(itemId))
      ?? entry.selectedSearch?.steps.find((current) => current.coveredTargetIds.includes(itemId))
    const group = step === undefined ? undefined : groups.find((current) => current.step?.query === step.query)
    if (group) group.itemIds.push(itemId)
    else groups.push({ itemIds: [itemId], step })
    return groups
  }, [])
  if (entry.disabled) return <section className="crafting-sheet__entry crafting-sheet__entry--disabled" aria-labelledby={headingId}>
    <header className="crafting-sheet__entry-heading">
      <span id={headingId} className="crafting-sheet__entry-label">{entry.label}</span>
      <label className="crafting-sheet__include"><input type="checkbox" checked={false} aria-label={`Include ${entry.label}`} onChange={(event) => onSetEntryDisabled(entry.id, !event.target.checked)} />excluded</label>
    </header>
  </section>
  return <section className={`crafting-sheet__entry${entry.disabled ? ' crafting-sheet__entry--disabled' : ''}`} aria-labelledby={headingId}>
    <header className="crafting-sheet__entry-heading">
      <button type="button" className="crafting-sheet__entry-toggle" aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${entry.label}`} aria-expanded={isOpen} aria-controls={detailsId} onClick={() => {
        onOpenChange(!isOpen)
      }}>
        <span className="crafting-sheet__entry-summary">
          <span id={headingId} className="crafting-sheet__entry-label">{entry.label}{!isOpen && entry.status !== 'ready' && <span className="crafting-sheet__entry-status">{entry.status === 'pending' ? 'Calculating crafts…' : 'No available craft.'}</span>}</span>
          <span className="crafting-sheet__summary-items">{summaryGroups.map(({ itemIds, step }) => {
            const itemNames = itemIds.map((itemId) => itemName(itemId, items))
            const itemLabel = itemNames.length < 3 ? itemNames.join(' and ') : `${itemNames.slice(0, -1).join(', ')}, and ${itemNames.at(-1)}`
            return <span key={itemIds.join('|')} className="crafting-sheet__summary-item">
              <ItemLabels itemIds={itemIds} items={items} icons={icons} />
              {step && <span className="craft-query crafting-sheet__query-preview" aria-label={`Selected query for ${itemLabel}`} dir="ltr"><span className="crafting-sheet__query-text">{step.query.replaceAll(' ', '_')}</span></span>}
            </span>
          })}</span>
        </span>
        <span aria-hidden="true"><ArrowSprite direction={isOpen ? 'up' : 'down'} compact /></span>
      </button>
      <label className="crafting-sheet__include"><input type="checkbox" checked={!entry.disabled} aria-label={`Include ${entry.label}`} onChange={(event) => onSetEntryDisabled(entry.id, !event.target.checked)} />{entry.disabled ? 'excluded' : 'included'}</label>
    </header>
    <SheetDisclosure id={detailsId} open={isOpen} sizeWhileCollapsed>
    {isOpen && <div className="crafting-sheet__entry-body">
    {entry.status !== 'ready'
      ? <p className="crafting-sheet__empty">{entry.status === 'pending' ? 'Calculating crafts…' : 'No available craft for this item set. Check its inventory and targets.'}</p>
      : <>
        <div className="crafting-sheet__entry-toolbar">

          <span className="crafting-sheet__entry-metrics"><strong>{entry.totalTypedCharacters} chars</strong><span>{entry.selectedSearch?.totalJunkAppearances ?? 0} junk</span><span title="Difference from this item set’s best calculated score">{deltaLabel(entry.scoreDelta)}</span></span>
        </div>
        <div className="crafting-sheet__plan">
          <span className="crafting-sheet__eyebrow">your sequence</span>
          {entry.selectedSearch && <QuerySequence search={entry.selectedSearch} />}

        </div>
        {isOpen && entry.selectedSearch && <KeyboardPlayback search={entry.selectedSearch} settings={keyboardSettings} removeAnimations={removeAnimations} />}
        <div className="crafting-sheet__individual">
            {entry.itemChoices.map((choice, index) => {
              const selected = choice.options.find((option) => option.id === choice.selectedOptionId)
              return <div className="crafting-sheet__individual-item" key={choice.itemId}>
                <div className="crafting-sheet__individual-summary"><span className="crafting-sheet__step-number">{index + 1}</span>
                  <span className="crafting-sheet__reorder" role="group" aria-label={`Reorder ${itemName(choice.itemId, items)}`}>
                    {([-1, 1] as const).map((direction) => <button key={direction} type="button" disabled={direction === -1 ? index === 0 : index === entry.itemChoices.length - 1}
                      aria-label={`Move ${itemName(choice.itemId, items)} ${direction === -1 ? 'up' : 'down'}`} title={`Move ${direction === -1 ? 'up' : 'down'}`}
                      onClick={() => onMoveItemCraft(entry.id, choice.itemId, direction)}><span aria-hidden="true"><ArrowSprite direction={direction === -1 ? 'up' : 'down'} compact /></span></button>)}
                  </span>
                  <ItemLabels itemIds={[choice.itemId]} items={items} icons={icons} />
                  {selected && <><QuerySequence search={selected.search} /><span className="crafting-sheet__item-cost">{selected.totalTypedCharacters} chars · {selected.junkCount} junk · {deltaLabel(choice.scoreDelta)}</span></>}
                </div>
                <CraftQueryInput label={itemName(choice.itemId, items)} value={selected?.search.queries[0] ?? ''} suggestions={choice.suggestions} calculatedSearches={choice.calculatedSearches} calculatedBestScore={choice.calculatedBestScore} onPreview={(query) => onPreviewItemQuery?.(entry.id, choice.itemId, query)} onChoose={(query) => onSetItemQuery(entry.id, choice.itemId, query)} />
              </div>
            })}
          </div>
      </>}
    </div>}
    </SheetDisclosure>
  </section>
}

function CharacterUsageQuery({ usage, queryLabel }: { usage: CraftingSheetCharacterUsage; queryLabel: string }) {
  return <span className="crafting-sheet__usage-query">{queryLabel.replaceAll('Shift+Home', 'SH').split(/(\(SH\)|←+|→)/).map((part, index) => /^(\(SH\)|←|→)/.test(part)
    ? <span key={index}> {part} </span>
    : <span key={index} className="crafting-sheet__query-text">{Array.from(part).map((character, characterIndex) => character === usage.character ? <mark key={characterIndex}>{character}</mark> : character)}</span>)}</span>
}

export interface CraftQueryResult {
  valid: boolean
  query: string
  message?: string
}

/** A typed prefix opens calculated choices without changing the selected craft. */
export function CraftQueryInput({ label, value, suggestions, calculatedSearches, calculatedBestScore, onPreview, onChoose }: {
  label: string
  value: string
  suggestions: readonly CraftingSheetOption[]
  calculatedSearches?: readonly RankedSearch[]
  calculatedBestScore?: number
  onPreview?: (query: string) => CraftingSheetOption | undefined
  onChoose: (query: string) => CraftQueryResult
}) {
  const displayQuery = (query: string) => query.replaceAll(' ', '_')
  const [draft, setDraft] = useState(displayQuery(value))
  const [isOpen, setIsOpen] = useState(false)
  const [filterByDraft, setFilterByDraft] = useState(false)
  const candidates = useMemo(() => calculatedSearches ?? suggestions.map((option) => option.search), [calculatedSearches, suggestions])
  const [calculated, setCalculated] = useState<{ draft: string; source: readonly RankedSearch[]; options: CraftingSheetOption[] }>()
  const [message, setMessage] = useState<string>()
  const inputRef = useRef<HTMLDivElement>(null)
  const suggestionsRef = useRef<HTMLUListElement>(null)
  const suggestionsId = useId()
  const previewRef = useRef(onPreview)
  const [popupStyle, setPopupStyle] = useState<CSSProperties>()
  const appliedDraftRef = useRef(displayQuery(value))

  useEffect(() => { previewRef.current = onPreview }, [onPreview])

  useEffect(() => {
    const nextDraft = displayQuery(value)
    appliedDraftRef.current = nextDraft
    setDraft(nextDraft)
    setCalculated(undefined)
    setFilterByDraft(false)
  }, [value])
  useEffect(() => {
    if (!isOpen) return
    function closeOnOutsideInteraction(event: Event) {
      if (event.type === 'pointerdown' && isScrollbarPointer(event as PointerEvent)) return
      if (event.target instanceof Node && (inputRef.current?.contains(event.target) || suggestionsRef.current?.contains(event.target))) return
      setIsOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideInteraction)
    document.addEventListener('focusin', closeOnOutsideInteraction)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideInteraction)
      document.removeEventListener('focusin', closeOnOutsideInteraction)
    }
  }, [isOpen])

  const choose = useCallback((query: string) => {
    const result = onChoose(query)
    const nextDraft = displayQuery(result.query)
    appliedDraftRef.current = nextDraft
    setDraft(nextDraft)
    setCalculated(undefined)
    setFilterByDraft(false)
    setMessage(result.message)
    setIsOpen(false)
  }, [onChoose])

  useEffect(() => {
    if (!isOpen || !filterByDraft || draft.trim().length === 0) return
    const controller = new AbortController()
    void matchingCraftQuerySearches(candidates, draft, controller.signal).then((searches) => {
      if (controller.signal.aborted) return
      const manual = previewRef.current?.(draft)
      const options = craftingSheetOptionsForSearches(searches, calculatedBestScore ?? suggestions[0]?.totalScore ?? 0)
      if (manual) options.unshift(manual)
      setCalculated({ draft, source: candidates, options: options.filter((option, index) => options.findIndex((candidate) => candidate.id === option.id) === index).slice(0, 10) })
    }).catch(() => {
      if (!controller.signal.aborted) setMessage('Unable to calculate suggestions. Try typing again.')
    })
    return () => controller.abort()
  }, [draft, filterByDraft, isOpen, candidates, calculatedBestScore, suggestions])

  const matchingSuggestions = filterByDraft
    ? calculated?.draft === draft && calculated.source === candidates ? calculated.options : []
    : suggestions.slice(0, 10)

  useLayoutEffect(() => {
    if (!isOpen) return
    const input = inputRef.current?.querySelector('input')
    if (!input) return
    function positionPopup() {
      const anchor = input!.getBoundingClientRect()
      const viewport = window.visualViewport
      let left = (viewport?.offsetLeft ?? 0) + 4
      let top = (viewport?.offsetTop ?? 0) + 4
      let right = left + (viewport?.width ?? window.innerWidth) - 8
      let bottom = top + (viewport?.height ?? window.innerHeight) - 8
      for (let parent = input!.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent)
        const sheet = parent.classList.contains('crafting-sheet')
        const scrollX = /auto|scroll/.test(style.overflowX)
        const scrollY = /auto|scroll/.test(style.overflowY)
        if (!sheet && !scrollX && !scrollY) continue
        const bounds = parent.getBoundingClientRect()
        if (bounds.width === 0 || bounds.height === 0) continue
        if (sheet || scrollX) { left = Math.max(left, bounds.left + 4); right = Math.min(right, bounds.right - 4) }
        if (sheet || scrollY) { top = Math.max(top, bounds.top + 4); bottom = Math.min(bottom, bounds.bottom - 4) }
      }
      if (anchor.width > 0 && (anchor.bottom <= top || anchor.top >= bottom || anchor.right <= left || anchor.left >= right)) {
        setIsOpen(false)
        return
      }
      const below = Math.max(0, bottom - anchor.bottom - 4)
      const above = Math.max(0, anchor.top - top - 4)
      const opensAbove = below < 192 && above > below
      const maxHeight = Math.min(192, opensAbove ? above : below)
      const width = Math.min(anchor.width, Math.max(0, right - left))
      setPopupStyle({ position: 'fixed', left: Math.max(left, Math.min(anchor.left, right - width)), top: opensAbove ? anchor.top - 4 : anchor.bottom + 4, transform: opensAbove ? 'translateY(-100%)' : undefined, width, maxHeight })
    }
    positionPopup()
    function reposition(event: Event) {
      if (event.target instanceof Node && suggestionsRef.current?.contains(event.target)) return
      positionPopup()
    }
    document.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', positionPopup)
    window.visualViewport?.addEventListener('resize', positionPopup)
    window.visualViewport?.addEventListener('scroll', positionPopup)
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(positionPopup)
    observer?.observe(input)
    return () => {
      document.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', positionPopup)
      window.visualViewport?.removeEventListener('resize', positionPopup)
      window.visualViewport?.removeEventListener('scroll', positionPopup)
      observer?.disconnect()
    }
  }, [isOpen])

  return <div ref={inputRef} className="crafting-sheet__query-input">
    <input type="search" value={draft} aria-label={`Craft query for ${label}`} aria-expanded={isOpen && matchingSuggestions.length > 0} aria-controls={isOpen && matchingSuggestions.length > 0 ? suggestionsId : undefined} placeholder="type a craft…" title="Latin accents and special letters accept English keyboard equivalents."
      onFocus={() => { setFilterByDraft(false); setCalculated(undefined); setIsOpen(true) }}
      onChange={(event) => { setDraft(displayQuery(event.target.value)); setFilterByDraft(true); setCalculated(undefined); setMessage(undefined); setIsOpen(true) }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setIsOpen(false)
        if (event.key === 'Enter') event.preventDefault()
      }} />
    {message && <p className="crafting-sheet__query-status" role="status">{message}</p>}
    {isOpen && matchingSuggestions.length > 0 && createPortal(<ul id={suggestionsId} ref={suggestionsRef} style={popupStyle} className="crafting-sheet__query-suggestions" aria-label={`Calculated craft suggestions for ${label}`}>
      {matchingSuggestions.map((option) => <li key={option.id}>
        <TapOrScrollButton type="button" onTap={() => choose(option.search.queries[0])}>
          <QuerySequence search={option.search} />
          <span>{option.totalTypedCharacters} chars · {option.junkCount} junk · {deltaLabel(option.scoreDelta)}</span>
        </TapOrScrollButton>
      </li>)}
    </ul>, document.body)}
  </div>
}

function CharacterDetails({ selectedCharacter, usages }: { selectedCharacter: string | undefined; usages: readonly CraftingSheetCharacterUsage[] }) {
  const usage = usages.find((current) => current.character === selectedCharacter)
  return <section className="crafting-sheet__character-details" aria-live="polite">
    <h3>character details</h3>
    {usage === undefined
      ? <p className="crafting-sheet__empty">Select a character to see every item set that uses it.</p>
      : <><p className="crafting-sheet__hint"><span className="crafting-sheet__query-text">{usage.character}</span> appears in {usage.craftCount} item set{usage.craftCount === 1 ? '' : 's'}.</p>
        <ol className="crafting-sheet__occurrences" aria-label={`${usage.character} crafts`}>
          {usage.occurrences.map((occurrence) => <li key={occurrence.entryId}><span>{occurrence.label}</span><CharacterUsageQuery usage={usage} queryLabel={occurrence.queryLabel} /></li>)}
        </ol>
      </>}
  </section>
}

function UsageChart({ usages, className = '' }: { usages: readonly CraftingSheetCharacterUsage[]; className?: string }) {
  const maxCount = Math.max(0, ...usages.map((usage) => usage.craftCount))
  return <section className={`crafting-sheet__chart${className ? ` ${className}` : ''}`}>
    <p className="crafting-sheet__hint">item sets using each character</p>
    <ol aria-label="Character occurrence bar chart">
      {usages.map((usage) => <li key={usage.character}>
        <span className="crafting-sheet__query-text">{usage.character}</span>
        <span className="crafting-sheet__bar-track"><span className="crafting-sheet__bar" style={{ '--crafting-sheet-bar-width': `${maxCount === 0 ? 0 : usage.craftCount / maxCount * 100}%` } as CSSProperties} /></span>
        <span>{usage.craftCount}</span>
      </li>)}
    </ol>
  </section>
}

function CharacterSet({ characterSet, selectedCharacter, onSelectCharacter }: { characterSet: readonly string[]; selectedCharacter: string | undefined; onSelectCharacter: (character: string) => void }) {
  return <div className="crafting-sheet__character-set-block"><h3>character set</h3>
    {characterSet.length > 0 ? <ul className="crafting-sheet__character-set" aria-label="Selected characters">{characterSet.map((character) => <li key={character}><button type="button" aria-label={`Show details for ${character}`} aria-pressed={selectedCharacter === character} onClick={() => onSelectCharacter(character)}><span className="crafting-sheet__query-text">{character}</span></button></li>)}</ul> : <p className="crafting-sheet__empty">No search characters are needed.</p>}
    <p className="crafting-sheet__hint">_ = space · ← = backspace · SH = shift home (replace search)</p>
  </div>
}

function SheetSummary({
  entries,
  characterSet,
  totalTypedCharacters,
  totalScore,
  scoreDelta,
  optimalCharacterCount,
  isCalculating,
  warning,
  readyCount,
  onReset,
}: Pick<CraftingSheetProps, 'entries' | 'characterSet' | 'totalTypedCharacters' | 'totalScore' | 'scoreDelta' | 'optimalCharacterCount' | 'isCalculating' | 'warning' | 'onReset'> & { readyCount: number }) {
  const scoreHue = totalScoreHue(entries, scoreDelta)
  const characterDelta = characterSet.length - optimalCharacterCount
  return <>
    <div className="crafting-sheet__intro"><button type="button" className="crafting-sheet__reset" onClick={onReset}>reset sheet</button></div>
    <div className="crafting-sheet__totals" aria-live="polite" aria-atomic="true">
      <div><strong aria-label="Total characters">{totalTypedCharacters}</strong><span>total characters</span></div>
      <div><strong aria-label="Distinct characters" title="Difference from the fewest characters possible among all score-optimal craft choices.">{characterSet.length}{characterDelta !== 0 && <small className={`crafting-sheet__character-delta${characterDelta < 0 ? ' crafting-sheet__character-delta--saved' : ''}`}>{characterDelta > 0 ? '+' : ''}{characterDelta}</small>}</strong><span>distinct characters</span></div>
      <div><strong>{readyCount}</strong><span>included item sets</span></div>
      <div><strong className="crafting-sheet__score" style={{ '--crafting-sheet-score-hue': `${scoreHue}deg` } as CSSProperties} aria-label="Total score" title="Green is tied with the best score; red is the high end of the available score range.">{totalScore}</strong><span>total score · {scoreDelta === 0 ? 'best' : `${scoreDelta > 0 ? '+' : ''}${scoreDelta} vs best`}</span></div>
    </div>
    {isCalculating && <p className="crafting-sheet__status" role="status">Updating crafting sheet… Totals include ready crafts.</p>}
    {entries.some((entry) => !entry.disabled && entry.status === 'unavailable') && <p className="crafting-sheet__status" role="status">Some item sets have no available craft and are excluded from totals.</p>}
    {warning && <p className="crafting-sheet__warning" role="status">{warning}</p>}
  </>
}

function ItemSetList({ entries, items, icons, onPreviewItemQuery, onSetItemQuery, onMoveItemCraft, onSetEntryDisabled, compactLayout = false, keyboardSettings, removeAnimations, columns = false }: Pick<CraftingSheetProps, 'entries' | 'items' | 'icons' | 'onPreviewItemQuery' | 'onSetItemQuery' | 'onMoveItemCraft' | 'onSetEntryDisabled' | 'compactLayout' | 'keyboardSettings' | 'removeAnimations'> & { columns?: boolean }) {
  const columnsRef = useRef<HTMLDivElement>(null)
  const [openEntryId, setOpenEntryId] = useState<string>()
  const [rowCount, setRowCount] = useState<number>()
  const hasExcludedEntries = columns && entries.some((entry) => entry.disabled)
  const hasExpandedEntries = columns && entries.some((entry) => entry.id === openEntryId && !entry.disabled)
  const hasMeasuredRows = columns && rowCount !== undefined
  const usesNaturalRows = (hasExcludedEntries || hasExpandedEntries) && hasMeasuredRows
  const usesIndependentColumns = hasExcludedEntries && hasMeasuredRows
  const compactColumns = usesIndependentColumns && rowCount
    ? Array.from({ length: Math.ceil(entries.length / rowCount) }, (_, columnIndex) => entries.slice(columnIndex * rowCount, (columnIndex + 1) * rowCount))
    : []

  function measureRowCount() {
    if (!columnsRef.current) return
    const styles = getComputedStyle(columnsRef.current)
    const rowGap = Number.parseFloat(styles.rowGap) || 0
    const minimumRowHeight = (Number.parseFloat(styles.fontSize) || 16) * 3.75
    if (columnsRef.current.clientHeight > 0) {
      const nextRowCount = Math.max(1, Math.floor((columnsRef.current.clientHeight + rowGap) / (minimumRowHeight + rowGap)))
      setRowCount((current) => current === nextRowCount ? current : nextRowCount)
    }
  }

  useEffect(() => {
    if (!columns) return
    let animationFrame: number | undefined
    const scheduleMeasurement = () => {
      if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
      if (typeof requestAnimationFrame === 'undefined') {
        measureRowCount()
        return
      }
      animationFrame = requestAnimationFrame(() => {
        animationFrame = undefined
        measureRowCount()
      })
    }
    scheduleMeasurement()
    window.addEventListener('resize', scheduleMeasurement)
    return () => {
      if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', scheduleMeasurement)
    }
  }, [columns])

  function setEntryOpen(entryId: string, open: boolean) {
    if (open && rowCount === undefined) measureRowCount()
    setOpenEntryId((current) => open ? entryId : current === entryId ? undefined : current)
  }

  function setEntryDisabled(entryId: string, disabled: boolean) {
    if (disabled) measureRowCount()
    onSetEntryDisabled(entryId, disabled)
  }

  function renderEntry(entry: CraftingSheetEntry) {
    return <ItemSetCard key={entry.id} entry={entry} items={items} icons={icons} onPreviewItemQuery={onPreviewItemQuery} onSetItemQuery={onSetItemQuery} onMoveItemCraft={onMoveItemCraft} onSetEntryDisabled={setEntryDisabled} compactLayout={compactLayout} keyboardSettings={keyboardSettings} removeAnimations={removeAnimations} isOpen={entry.id === openEntryId} onOpenChange={(open) => setEntryOpen(entry.id, open)} />
  }

  return <section className={`crafting-sheet__sets${columns ? ' crafting-sheet__sets--columns' : ''}`} aria-label="Selected item sets"><h3>item sets</h3>
    {entries.length === 0 && <p className="crafting-sheet__empty">Add an item set with available crafts to build a crafting sheet.</p>}
    {entries.length > 0 && <div ref={columnsRef} style={hasMeasuredRows ? { '--crafting-sheet-entry-row-count': String(rowCount) } as CSSProperties : undefined} className={`crafting-sheet__set-columns${usesIndependentColumns ? ' crafting-sheet__set-columns--compact-rows' : usesNaturalRows ? ' crafting-sheet__set-columns--expanded' : hasMeasuredRows ? ' crafting-sheet__set-columns--sized' : ''}`}>{usesIndependentColumns ? compactColumns.map((entryColumn, columnIndex) => <div className="crafting-sheet__set-column" key={columnIndex}>{entryColumn.map(renderEntry)}</div>) : entries.map(renderEntry)}</div>}
  </section>
}

export function CraftingSheet({ languageName, entries, characterSet, characterUsages, optimalCharacterCount, totalTypedCharacters, totalScore, scoreDelta, items, icons, isCalculating = false, warning, defaultOpen = false, open, onOpenChange, layout = 'inline', compactLayout = false, keyboardSettings, removeAnimations, onBack, onCompare, onPreviewItemQuery, onSetItemQuery, onMoveItemCraft, onSetEntryDisabled, onReset }: CraftingSheetProps) {
  const [localOpen, setLocalOpen] = useState(defaultOpen)
  const [selectedCharacter, setSelectedCharacter] = useState<string>()
  const isOpen = open ?? localOpen
  function setIsOpen(next: boolean) { setLocalOpen(next); onOpenChange?.(next) }
  const panelId = useId()
  const readyCount = entries.filter((entry) => !entry.disabled && entry.status === 'ready').length
  const usages = useMemo(() => [...characterUsages].filter((usage) => usage.craftCount > 0).sort((left, right) => right.craftCount - left.craftCount || left.character.localeCompare(right.character)), [characterUsages])
  const selectCharacter = (character: string) => setSelectedCharacter((current) => current === character ? undefined : character)

  useEffect(() => {
    if (selectedCharacter !== undefined && !characterSet.includes(selectedCharacter)) setSelectedCharacter(undefined)
  }, [characterSet, selectedCharacter])

  if (layout === 'page') return <section className={`crafting-sheet crafting-sheet--page${compactLayout ? ' crafting-sheet--compact' : ''}`} aria-label={`${languageName} crafting sheet`}>
    <div className="crafting-sheet__panel crafting-sheet__panel--page">
      <aside className="crafting-sheet__page-info">
        <header className="crafting-sheet__header"><h2 className="crafting-sheet__heading">
          <button type="button" className="crafting-sheet__toggle" aria-label={`Back to ${languageName} crafts`} onClick={onBack}>
            <span className="crafting-sheet__title">{languageName} search crafts</span>
            <span className="crafting-sheet__toggle-label" aria-hidden="true">back to crafts</span>
            <span className="crafting-sheet__disclosure" aria-hidden="true"><ArrowSprite direction="left" compact /></span>
          </button>
        </h2></header>
        <SheetSummary entries={entries} characterSet={characterSet} totalTypedCharacters={totalTypedCharacters} totalScore={totalScore} scoreDelta={scoreDelta} optimalCharacterCount={optimalCharacterCount} isCalculating={isCalculating} warning={warning} readyCount={readyCount} onReset={onReset} />
      </aside>
      <aside className="crafting-sheet__page-characters">
        <CharacterSet characterSet={characterSet} selectedCharacter={selectedCharacter} onSelectCharacter={selectCharacter} />
        <CharacterDetails selectedCharacter={selectedCharacter} usages={usages} />
      </aside>
      <UsageChart usages={usages} className="crafting-sheet__chart--page" />
      <ItemSetList columns keyboardSettings={keyboardSettings} removeAnimations={removeAnimations} compactLayout={compactLayout} entries={entries} items={items} icons={icons} onPreviewItemQuery={onPreviewItemQuery} onSetItemQuery={onSetItemQuery} onMoveItemCraft={onMoveItemCraft} onSetEntryDisabled={onSetEntryDisabled} />
    </div>
  </section>

  return <section className="crafting-sheet" aria-label={`${languageName} crafting sheet`}>
    <header className="crafting-sheet__header crafting-sheet__header--actions">
      <h2 className="crafting-sheet__heading"><span className="crafting-sheet__title">{languageName} search crafts</span></h2>
      <div className="crafting-sheet__actions">
        <button type="button" className="crafting-sheet__action" aria-controls={panelId} aria-expanded={isOpen} onClick={() => setIsOpen(!isOpen)}>
          <span>crafting sheet</span><span aria-hidden="true"><ArrowSprite direction="right" compact /></span>
        </button>
        {onCompare && <button type="button" className="crafting-sheet__action" onClick={onCompare}><span>compare languages</span><span aria-hidden="true"><ArrowSprite direction="right" compact /></span></button>}
      </div>
    </header>
    <SheetDisclosure id={panelId} open={isOpen}>
    <div className="crafting-sheet__panel">
      <SheetSummary entries={entries} characterSet={characterSet} totalTypedCharacters={totalTypedCharacters} totalScore={totalScore} scoreDelta={scoreDelta} optimalCharacterCount={optimalCharacterCount} isCalculating={isCalculating} warning={warning} readyCount={readyCount} onReset={onReset} />
      <ItemSetList keyboardSettings={keyboardSettings} removeAnimations={removeAnimations} compactLayout={compactLayout} entries={entries} items={items} icons={icons} onPreviewItemQuery={onPreviewItemQuery} onSetItemQuery={onSetItemQuery} onMoveItemCraft={onMoveItemCraft} onSetEntryDisabled={onSetEntryDisabled} />
      <CharacterSet characterSet={characterSet} selectedCharacter={selectedCharacter} onSelectCharacter={selectCharacter} />
      <CharacterDetails selectedCharacter={selectedCharacter} usages={usages} />
    </div>
    </SheetDisclosure>
  </section>
}
