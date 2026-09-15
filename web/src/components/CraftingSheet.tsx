import { useId, useMemo, useState, type CSSProperties } from 'react'

import type { IconManifest } from '../data/iconManifest'
import type { SearchItem } from '../domain/types'
import { ArrowSprite } from './ArrowSprite'
import { ItemIcon } from './ItemIcon'

import './CraftingSheet.css'

export interface CraftingSheetCraftOption {
  id: string
  label: string
  isOptimal: boolean
}

export interface CraftingSheetEntry {
  id: string
  itemIds: readonly string[]
  label: string
  queryLabel: string
  options: readonly CraftingSheetCraftOption[]
  selectedOptionId: string
  defaultOptionId: string
  disabled: boolean
}

export interface CraftingSheetOccurrence {
  entryId: string
  label: string
  itemIds: readonly string[]
  optionId: string
  queryLabel: string
}

export interface CraftingSheetCharacterUsage {
  character: string
  craftCount: number
  entryIds: readonly string[]
  occurrences: readonly CraftingSheetOccurrence[]
}

export interface CraftingSheetProps {
  languageName: string
  entries: readonly CraftingSheetEntry[]
  /** Disabled entries remain available here so their include control is never lost. */
  disabledEntries: readonly CraftingSheetEntry[]
  characterSet: readonly string[]
  characterUsages: readonly CraftingSheetCharacterUsage[]
  items?: ReadonlyMap<string, SearchItem>
  icons?: IconManifest
  isCalculating?: boolean
  warning?: string
  defaultOpen?: boolean
  onSelectCraft: (entryId: string, optionId: string) => void
  onSetEntryDisabled: (entryId: string, disabled: boolean) => void
  onReset: () => void
}

function craftCountLabel(count: number): string {
  return `${count} craft${count === 1 ? '' : 's'}`
}

function highlightedQuery(query: string, character: string) {
  const normalizedCharacter = character.toLocaleLowerCase()
  return Array.from(query).map((part, index) => part.toLocaleLowerCase() === normalizedCharacter
    ? <mark key={index}>{part}</mark>
    : <span key={index}>{part}</span>)
}

function itemName(itemId: string, items: ReadonlyMap<string, SearchItem> | undefined): string {
  return items?.get(itemId)?.name ?? itemId.replace(/^minecraft:/, '').replaceAll('_', ' ')
}

function CraftChoiceMenu({
  entry,
  onSelectCraft,
  onSetEntryDisabled,
}: {
  entry: CraftingSheetEntry
  onSelectCraft: CraftingSheetProps['onSelectCraft']
  onSetEntryDisabled: CraftingSheetProps['onSetEntryDisabled']
}) {
  const [isOpen, setIsOpen] = useState(false)
  const menuId = useId()
  const selectedOption = entry.options.find((option) => option.id === entry.selectedOptionId)

  return <div className="crafting-sheet__craft-controls">
    <button
      type="button"
      className="crafting-sheet__choice-toggle"
      aria-controls={menuId}
      aria-expanded={isOpen}
      onClick={() => setIsOpen((open) => !open)}
    >
      <span className="crafting-sheet__choice-toggle-label">choose craft</span>
      <span className="crafting-sheet__choice-toggle-value">{selectedOption?.label ?? entry.queryLabel}</span>
      <span className="crafting-sheet__disclosure" aria-hidden="true"><ArrowSprite direction={isOpen ? 'up' : 'down'} compact /></span>
    </button>
    {isOpen && <div id={menuId} className="crafting-sheet__choice-menu" aria-label={`Calculated crafts for ${entry.label}`}>
      <ul>
        {entry.options.map((option) => <li key={option.id}>
          <button
            type="button"
            aria-pressed={option.id === entry.selectedOptionId}
            onClick={() => {
              onSelectCraft(entry.id, option.id)
              setIsOpen(false)
            }}
          >
            <span>{option.label}</span>
            {option.isOptimal && <span className="crafting-sheet__optimal" aria-label="Optimal score">optimal</span>}
          </button>
        </li>)}
      </ul>
    </div>}
    <button
      type="button"
      className="crafting-sheet__disable"
      aria-pressed={!entry.disabled}
      onClick={() => onSetEntryDisabled(entry.id, !entry.disabled)}
    >{entry.disabled ? 'include craft' : 'disable craft'}</button>
  </div>
}

function CraftOccurrence({
  occurrence,
  character,
  entry,
  items,
  icons,
  onSelectCraft,
  onSetEntryDisabled,
}: {
  occurrence: CraftingSheetOccurrence
  character: string
  entry: CraftingSheetEntry | undefined
  items: ReadonlyMap<string, SearchItem> | undefined
  icons: IconManifest | undefined
  onSelectCraft: CraftingSheetProps['onSelectCraft']
  onSetEntryDisabled: CraftingSheetProps['onSetEntryDisabled']
}) {
  const label = occurrence.label || entry?.label || 'craft'
  return <li className={`crafting-sheet__occurrence${entry?.disabled ? ' crafting-sheet__occurrence--disabled' : ''}`}>
    <div className="crafting-sheet__occurrence-preview">
      {icons && occurrence.itemIds.length > 0
        ? <span className="crafting-sheet__occurrence-items" aria-label={`${label} items`}>
          {occurrence.itemIds.map((itemId) => <ItemIcon key={itemId} itemId={itemId} name={itemName(itemId, items)} manifest={icons} />)}
        </span>
        : <span className="crafting-sheet__occurrence-label">{label}</span>}
      <span className="crafting-sheet__occurrence-query" aria-label={`${label}: ${occurrence.queryLabel}`}>
        {highlightedQuery(occurrence.queryLabel, character)}
      </span>
    </div>
    {entry && <CraftChoiceMenu entry={entry} onSelectCraft={onSelectCraft} onSetEntryDisabled={onSetEntryDisabled} />}
  </li>
}

function CharacterUsageRow({
  usage,
  entriesById,
  items,
  icons,
  onSelectCraft,
  onSetEntryDisabled,
}: {
  usage: CraftingSheetCharacterUsage
  entriesById: ReadonlyMap<string, CraftingSheetEntry>
  items: ReadonlyMap<string, SearchItem> | undefined
  icons: IconManifest | undefined
  onSelectCraft: CraftingSheetProps['onSelectCraft']
  onSetEntryDisabled: CraftingSheetProps['onSetEntryDisabled']
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const detailsId = useId()
  const count = usage.craftCount

  return <li className="crafting-sheet__character-row">
    <button
      type="button"
      className="crafting-sheet__character-toggle"
      aria-controls={detailsId}
      aria-expanded={isExpanded}
      onClick={() => setIsExpanded((expanded) => !expanded)}
    >
      <span className="crafting-sheet__character">{usage.character}</span>
      <span aria-hidden="true">–</span>
      <span>{craftCountLabel(count)}</span>
      <span className="crafting-sheet__disclosure" aria-hidden="true"><ArrowSprite direction={isExpanded ? 'up' : 'down'} compact /></span>
    </button>
    {isExpanded && <ol id={detailsId} className="crafting-sheet__occurrences" aria-label={`${usage.character} crafts`}>
      {usage.occurrences.map((occurrence, index) => <CraftOccurrence
        key={`${occurrence.entryId}:${occurrence.optionId}:${index}`}
        occurrence={occurrence}
        character={usage.character}
        entry={entriesById.get(occurrence.entryId)}
        items={items}
        icons={icons}
        onSelectCraft={onSelectCraft}
        onSetEntryDisabled={onSetEntryDisabled}
      />)}
    </ol>}
  </li>
}

function UsageChart({ usages }: { usages: readonly CraftingSheetCharacterUsage[] }) {
  const maxCount = Math.max(0, ...usages.map((usage) => usage.craftCount))
  return <section className="crafting-sheet__chart" aria-labelledby="crafting-sheet-chart-title">
    <div className="crafting-sheet__chart-heading">
      <h3 id="crafting-sheet-chart-title">character usage</h3>
      <span>craft occurrences →</span>
    </div>
    <div className="crafting-sheet__chart-axis" aria-hidden="true"><span>character</span><span>crafts</span></div>
    <ol aria-label="Character occurrence bar chart">
      {usages.map((usage) => {
        const width = maxCount === 0 ? 0 : (usage.craftCount / maxCount) * 100
        const style = { '--crafting-sheet-bar-width': `${width}%` } as CSSProperties
        return <li key={usage.character}>
          <span className="crafting-sheet__chart-character">{usage.character}</span>
          <span className="crafting-sheet__bar-track"><span className="crafting-sheet__bar" style={style} /></span>
          <span className="crafting-sheet__chart-count">{usage.craftCount}</span>
        </li>
      })}
    </ol>
  </section>
}

/**
 * A presentation-only view of the craft choices that compose the currently
 * optimal character set. The optimizer owns the entries, selection, and
 * persistence; this component only renders them and reports interactions.
 */
export function CraftingSheet({
  languageName,
  entries,
  disabledEntries,
  characterSet,
  characterUsages,
  items,
  icons,
  isCalculating = false,
  warning,
  defaultOpen = false,
  onSelectCraft,
  onSetEntryDisabled,
  onReset,
}: CraftingSheetProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const panelId = useId()
  const entriesById = useMemo(() => new Map([...entries, ...disabledEntries].map((entry) => [entry.id, entry])), [disabledEntries, entries])
  const usages = useMemo(() => [...characterUsages]
    .filter((usage) => usage.craftCount > 0)
    .sort((left, right) => right.craftCount - left.craftCount || left.character.localeCompare(right.character)), [characterUsages])

  return <section className="crafting-sheet" aria-label={`${languageName} crafting sheet`}>
    <header className="crafting-sheet__header">
      <h2 className="crafting-sheet__heading">
        <button
          type="button"
          className="crafting-sheet__toggle"
          aria-controls={panelId}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        >
          <span className="crafting-sheet__title">{languageName} search crafts</span>
          <span className="crafting-sheet__toggle-label" aria-hidden="true">crafting sheet</span>
          <span className="crafting-sheet__disclosure" aria-hidden="true"><ArrowSprite direction={isOpen ? 'up' : 'down'} compact /></span>
        </button>
      </h2>
    </header>
    {isOpen && <div id={panelId} className="crafting-sheet__panel">
      <div className="crafting-sheet__set-heading">
        <div>
          <h3>character set</h3>
          {characterSet.length > 0
            ? <ul className="crafting-sheet__character-set" aria-label="Selected characters">
              {characterSet.map((character, index) => <li key={`${character}:${index}`}>{character}</li>)}
            </ul>
            : <p className="crafting-sheet__empty">No search characters are needed.</p>}
        </div>
        <button type="button" className="crafting-sheet__reset" onClick={onReset}>reset character set</button>
      </div>
      {isCalculating && <p className="crafting-sheet__status" role="status">Updating character set…</p>}
      {warning && <p className="crafting-sheet__warning" role="status">{warning}</p>}
      {usages.length > 0
        ? <div className="crafting-sheet__usage-layout">
          <section className="crafting-sheet__usage-list" aria-labelledby="crafting-sheet-characters-used">
            <h3 id="crafting-sheet-characters-used">characters used</h3>
            <ol>
              {usages.map((usage) => <CharacterUsageRow
                key={usage.character}
                usage={usage}
                entriesById={entriesById}
                items={items}
                icons={icons}
                onSelectCraft={onSelectCraft}
                onSetEntryDisabled={onSetEntryDisabled}
              />)}
            </ol>
          </section>
          <UsageChart usages={usages} />
        </div>
        : disabledEntries.length === 0 && <p className="crafting-sheet__empty">Add an item set with available crafts to build a crafting sheet.</p>}
      {disabledEntries.length > 0 && <section className="crafting-sheet__disabled" aria-labelledby="crafting-sheet-disabled-crafts">
        <header>
          <h3 id="crafting-sheet-disabled-crafts">disabled crafts</h3>
          <p>Excluded from the character set.</p>
        </header>
        <ol>
          {disabledEntries.map((entry) => <CraftOccurrence
            key={entry.id}
            occurrence={{
              entryId: entry.id,
              label: entry.label,
              itemIds: entry.itemIds,
              optionId: entry.selectedOptionId,
              queryLabel: entry.queryLabel,
            }}
            character=""
            entry={entry}
            items={items}
            icons={icons}
            onSelectCraft={onSelectCraft}
            onSetEntryDisabled={onSetEntryDisabled}
          />)}
        </ol>
      </section>}
    </div>}
  </section>
}
