import { Fragment, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import type { IconManifest } from '../data/iconManifest'
import type { RankedSearch, SearchItem } from '../domain/types'
import type { CraftingSheetCharacterUsage, CraftingSheetEntry, CraftingSheetOption } from '../engine/craftingSheet'
import { ArrowSprite } from './ArrowSprite'
import { ItemIcon } from './ItemIcon'

import './CraftingSheet.css'

export type { CraftingSheetEntry, CraftingSheetCharacterUsage } from '../engine/craftingSheet'

export interface CraftingSheetProps {
  languageName: string
  entries: readonly CraftingSheetEntry[]
  disabledEntries: readonly CraftingSheetEntry[]
  characterSet: readonly string[]
  characterUsages: readonly CraftingSheetCharacterUsage[]
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
  onSelectItemCraft: (entryId: string, itemId: string, optionId: string) => void
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

function SheetDisclosure({ id, open, children }: { id: string; open: boolean; children: ReactNode }) {
  const [hasOpened, setHasOpened] = useState(open)
  useEffect(() => { if (open) setHasOpened(true) }, [open])
  if (!open && !hasOpened) return null

  return <div id={id} className={`crafting-sheet__details${open ? ' crafting-sheet__details--open' : ''}`} aria-hidden={!open} inert={!open}>
    <div className="crafting-sheet__details-clip">{children}</div>
  </div>
}

function QuerySequence({ search }: { search: RankedSearch }) {
  return <span className="crafting-sheet__sequence" dir="ltr">
    {search.steps.map((step, index) => {
      const replaces = index > 0 && step.retainedPrefix.length === 0 && step.freeBackspaceCount >= search.steps[index - 1].query.length
      return <Fragment key={index}>
        {index > 0 && (replaces
          ? <kbd className="crafting-sheet__key" title="Select the previous query, then replace it">Shift+Home</kbd>
          : step.freeBackspaceCount > 0
            ? <kbd className="crafting-sheet__key" aria-label={`${step.freeBackspaceCount} backspace${step.freeBackspaceCount === 1 ? '' : 's'}`} title={`${step.freeBackspaceCount} backspace${step.freeBackspaceCount === 1 ? '' : 's'}`}>
              <span aria-hidden="true">←{step.freeBackspaceCount > 1 ? ` ×${step.freeBackspaceCount}` : ''}</span>
            </kbd>
            : <span className="crafting-sheet__key" aria-label={step.typedSuffix ? 'Continue typing' : 'Keep search'}>{step.typedSuffix ? '→' : 'keep search'}</span>)}
        <span className="crafting-sheet__query-text" title={`Search: ${step.query.replaceAll(' ', '_')}`}>{(index === 0 ? step.query : step.typedSuffix).replaceAll(' ', '_')}</span>
      </Fragment>
    })}
  </span>
}

function CraftPicker({ label, options, selectedOptionId, onSelect }: {
  label: string
  options: readonly CraftingSheetOption[]
  selectedOptionId: string
  onSelect: (optionId: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [visibleCount, setVisibleCount] = useState(30)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const filtered = useMemo(() => options.filter((option) => (
    option.label.toLocaleLowerCase().includes(filter.toLocaleLowerCase().replaceAll(' ', '_'))
    || option.search.queries.some((query) => query.toLocaleLowerCase().includes(filter.toLocaleLowerCase().replaceAll('_', ' ')))
  )), [filter, options])
  const selected = options.find((option) => option.id === selectedOptionId)
  function close() { setIsOpen(false); toggleRef.current?.focus() }

  return <div className="crafting-sheet__picker" onKeyDown={(event) => {
    if (event.key === 'Escape' && isOpen) { event.stopPropagation(); close() }
  }}>
    <button ref={toggleRef} type="button" className="crafting-sheet__choice-toggle" aria-label={`choose craft for ${label}`} aria-expanded={isOpen} aria-controls={menuId} disabled={options.length === 0}
      onClick={() => { setIsOpen(!isOpen); setFilter(''); setVisibleCount(30) }}>
      <span>choose craft</span><span className="crafting-sheet__option-count">{options.length}</span>
      <span aria-hidden="true"><ArrowSprite direction={isOpen ? 'up' : 'down'} compact /></span>
    </button>
    {isOpen && <section id={menuId} className="crafting-sheet__choice-menu" aria-label={`Calculated crafts for ${label}`}>
      <div className="crafting-sheet__filter">
        <input autoFocus type="search" value={filter} aria-label={`Filter crafts for ${label}`} placeholder="find a query…" onChange={(event) => { setFilter(event.target.value); setVisibleCount(30) }} />
        <button type="button" onClick={close} aria-label={`Close crafts for ${label}`}>close</button>
      </div>
      <p className="crafting-sheet__hint">Up to 5 characters per query and 2 pages of results. Lower score is better.</p>
      <ul>
        {filtered.slice(0, visibleCount).map((option) => <li key={option.id}>
          <button type="button" aria-pressed={option.id === selectedOptionId} onClick={() => { onSelect(option.id); close() }}>
            <QuerySequence search={option.search} />
            <span className="crafting-sheet__option-metrics">
              <span>{option.totalTypedCharacters} chars · {option.junkCount} junk</span>
              <span className={option.isOptimal ? 'crafting-sheet__optimal' : ''}>{deltaLabel(option.scoreDelta)}</span>
              {selected && option.id !== selected.id && <span className="crafting-sheet__change">{option.totalScore - selected.totalScore > 0 ? '+' : ''}{option.totalScore - selected.totalScore} vs selected</span>}
            </span>
          </button>
        </li>)}
      </ul>
      {filtered.length === 0 && <p className="crafting-sheet__empty">No crafts match this query.</p>}
      {filtered.length > visibleCount && <button type="button" className="crafting-sheet__show-more" onClick={() => setVisibleCount((count) => count + 30)}>show more crafts ({filtered.length - visibleCount} remaining)</button>}
    </section>}
  </div>
}

function ItemLabels({ itemIds, items, icons }: { itemIds: readonly string[]; items: CraftingSheetProps['items']; icons: CraftingSheetProps['icons'] }) {
  return <span className="crafting-sheet__items">{itemIds.map((itemId) => <span key={itemId} className="crafting-sheet__item">
    {icons && <ItemIcon itemId={itemId} name={itemName(itemId, items)} manifest={icons} />}
    {!icons && <span role="img" aria-label={itemName(itemId, items)} title={itemName(itemId, items)}>◇</span>}
  </span>)}</span>
}

function ItemSetCard({ entry, items, icons, onSelectItemCraft, onMoveItemCraft, onSetEntryDisabled }: Pick<CraftingSheetProps, 'items' | 'icons' | 'onSelectItemCraft' | 'onMoveItemCraft' | 'onSetEntryDisabled'> & { entry: CraftingSheetEntry }) {
  const [isOpen, setIsOpen] = useState(false)
  const headingId = useId()
  const detailsId = useId()
  return <section className={`crafting-sheet__entry${entry.disabled ? ' crafting-sheet__entry--disabled' : ''}`} aria-labelledby={headingId}>
    <header className="crafting-sheet__entry-heading">
      <button type="button" className="crafting-sheet__entry-toggle" aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${entry.label}`} aria-expanded={isOpen} aria-controls={detailsId} onClick={() => setIsOpen(!isOpen)}>
        <span className="crafting-sheet__entry-summary">
          <span id={headingId} className="crafting-sheet__entry-label">{entry.label}</span>
          <span className="crafting-sheet__summary-items">{entry.itemIds.map((itemId) => {
            const step = entry.selectedSearch?.steps.find((current) => current.newTargetIds.includes(itemId))
              ?? entry.selectedSearch?.steps.find((current) => current.coveredTargetIds.includes(itemId))
            return <span key={itemId} className="crafting-sheet__summary-item">
              <ItemLabels itemIds={[itemId]} items={items} icons={icons} />
              {step && <span className="craft-query crafting-sheet__query-preview" aria-label={`Selected query for ${itemName(itemId, items)}`} dir="ltr"><span className="crafting-sheet__query-text">{step.query.replaceAll(' ', '_')}</span></span>}
            </span>
          })}</span>
          {!isOpen && entry.status !== 'ready' && <span className="crafting-sheet__empty">{entry.status === 'pending' ? 'Calculating crafts…' : 'No available craft.'}</span>}
        </span>
        <span aria-hidden="true"><ArrowSprite direction={isOpen ? 'up' : 'down'} compact /></span>
      </button>
      <label className="crafting-sheet__include"><input type="checkbox" checked={!entry.disabled} aria-label={`Include ${entry.label}`} onChange={(event) => onSetEntryDisabled(entry.id, !event.target.checked)} />{entry.disabled ? 'excluded' : 'included'}</label>
    </header>
    <SheetDisclosure id={detailsId} open={isOpen}>
    <div className="crafting-sheet__entry-body">
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
        <div className="crafting-sheet__individual">
            <p className="crafting-sheet__hint">Reorder with the arrows. Matching queries share a step. Shared prefixes use up to 3 backspaces; otherwise the search is replaced. Chars and scores reflect this order.</p>
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
                <CraftPicker label={itemName(choice.itemId, items)} options={choice.options} selectedOptionId={choice.selectedOptionId} onSelect={(id) => onSelectItemCraft(entry.id, choice.itemId, id)} />
              </div>
            })}
          </div>
      </>}
    </div>
    </SheetDisclosure>
  </section>
}

function CharacterUsageRow({ usage }: { usage: CraftingSheetCharacterUsage }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const detailsId = useId()
  return <li className="crafting-sheet__character-row">
    <button type="button" className="crafting-sheet__character-toggle" aria-controls={detailsId} aria-expanded={isExpanded} onClick={() => setIsExpanded(!isExpanded)}>
      <span className="crafting-sheet__query-text">{usage.character}</span><span>— {usage.craftCount} craft{usage.craftCount === 1 ? '' : 's'}</span><span aria-hidden="true"><ArrowSprite direction={isExpanded ? 'up' : 'down'} compact /></span>
    </button>
    {isExpanded && <ol id={detailsId} className="crafting-sheet__occurrences" aria-label={`${usage.character} crafts`}>
      {usage.occurrences.map((occurrence) => <li key={occurrence.entryId}><span>{occurrence.label}</span><span className="crafting-sheet__usage-query">{occurrence.queryLabel.split(/(\(Shift\+Home\)|←+|→)/).map((part, index) => /^(\(Shift\+Home\)|←|→)/.test(part)
        ? <span key={index}> {part} </span>
        : <span key={index} className="crafting-sheet__query-text">{Array.from(part).map((character, characterIndex) => character === usage.character ? <mark key={characterIndex}>{character}</mark> : character)}</span>)}</span></li>)}
    </ol>}
  </li>
}

function UsageChart({ usages }: { usages: readonly CraftingSheetCharacterUsage[] }) {
  const maxCount = Math.max(0, ...usages.map((usage) => usage.craftCount))
  return <div className="crafting-sheet__chart">
    <p className="crafting-sheet__hint">item sets using each character</p>
    <ol aria-label="Character occurrence bar chart">
      {usages.map((usage) => <li key={usage.character}>
        <span className="crafting-sheet__query-text">{usage.character}</span>
        <span className="crafting-sheet__bar-track"><span className="crafting-sheet__bar" style={{ '--crafting-sheet-bar-width': `${maxCount === 0 ? 0 : usage.craftCount / maxCount * 100}%` } as CSSProperties} /></span>
        <span>{usage.craftCount}</span>
      </li>)}
    </ol>
  </div>
}

export function CraftingSheet({ languageName, entries, characterSet, characterUsages, totalTypedCharacters, totalScore, scoreDelta, items, icons, isCalculating = false, warning, defaultOpen = false, open, onOpenChange, onSelectItemCraft, onMoveItemCraft, onSetEntryDisabled, onReset }: CraftingSheetProps) {
  const [localOpen, setLocalOpen] = useState(defaultOpen)
  const isOpen = open ?? localOpen
  function setIsOpen(next: boolean) { setLocalOpen(next); onOpenChange?.(next) }
  const panelId = useId()
  const readyCount = entries.filter((entry) => !entry.disabled && entry.status === 'ready').length
  const usages = useMemo(() => [...characterUsages].filter((usage) => usage.craftCount > 0).sort((left, right) => right.craftCount - left.craftCount || left.character.localeCompare(right.character)), [characterUsages])
  return <section className="crafting-sheet" aria-label={`${languageName} crafting sheet`}>
    <header className="crafting-sheet__header"><h2 className="crafting-sheet__heading">
      <button type="button" className="crafting-sheet__toggle" aria-controls={panelId} aria-expanded={isOpen} onClick={() => setIsOpen(!isOpen)}>
        <span className="crafting-sheet__title">{languageName} search crafts</span>
        <span className="crafting-sheet__toggle-label" aria-hidden="true">crafting sheet</span>
        <span className="crafting-sheet__disclosure" aria-hidden="true"><ArrowSprite direction={isOpen ? 'up' : 'down'} compact /></span>
      </button>
    </h2></header>
    <SheetDisclosure id={panelId} open={isOpen}>
    <div className="crafting-sheet__panel">
      <div className="crafting-sheet__intro"><p>Your crafts, your way. Choose a sequence for each item set.</p><button type="button" className="crafting-sheet__reset" onClick={onReset}>reset sheet</button></div>
      <div className="crafting-sheet__totals" aria-live="polite" aria-atomic="true">
        <div><strong aria-label="Total characters">{totalTypedCharacters}</strong><span>total characters</span></div>
        <div><strong aria-label="Distinct characters">{characterSet.length}</strong><span>distinct characters</span></div>
        <div><strong>{readyCount}</strong><span>included item sets</span></div>
        <div><strong>{totalScore}</strong><span>total score · {scoreDelta === 0 ? 'best' : `${scoreDelta > 0 ? '+' : ''}${scoreDelta} vs best`}</span></div>
      </div>
      <p className="crafting-sheet__hint">Character counts include spaces and repeated letters. Control keys are excluded. Lower score is better.</p>
      <div className="crafting-sheet__character-set-block"><h3>character set</h3>
        {characterSet.length > 0 ? <ul className="crafting-sheet__character-set" aria-label="Selected characters">{characterSet.map((character) => <li key={character} className="crafting-sheet__query-text">{character}</li>)}</ul> : <p className="crafting-sheet__empty">No search characters are needed.</p>}
        <p className="crafting-sheet__hint"><span className="crafting-sheet__query-text">_</span> = space · ← = backspace · Shift+Home = replace search</p>
      </div>
      {isCalculating && <p className="crafting-sheet__status" role="status">Updating crafting sheet… Totals include ready crafts.</p>}
      {entries.some((entry) => !entry.disabled && entry.status === 'unavailable') && <p className="crafting-sheet__status" role="status">Some item sets have no available craft and are excluded from totals.</p>}
      {warning && <p className="crafting-sheet__warning" role="status">{warning}</p>}
      <section className="crafting-sheet__sets" aria-label="Selected item sets"><h3>item sets</h3>
        {entries.length === 0 && <p className="crafting-sheet__empty">Add an item set with available crafts to build a crafting sheet.</p>}
        {entries.map((entry) => <ItemSetCard key={entry.id} entry={entry} items={items} icons={icons} onSelectItemCraft={onSelectItemCraft} onMoveItemCraft={onMoveItemCraft} onSetEntryDisabled={onSetEntryDisabled} />)}
      </section>
      {usages.length > 0 && <details className="crafting-sheet__usage"><summary>character usage</summary><div className="crafting-sheet__usage-layout"><ol className="crafting-sheet__usage-list">{usages.map((usage) => <CharacterUsageRow key={usage.character} usage={usage} />)}</ol><UsageChart usages={usages} /></div></details>}
    </div>
    </SheetDisclosure>
  </section>
}
