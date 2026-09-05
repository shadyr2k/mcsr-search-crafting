import { Fragment, useId, useMemo, useState } from 'react'

import type { IconManifest } from '../data/iconManifest'
import type { RankedSearch, RecipeResultCollection, RowOptimizationState, SearchItem, TargetWorkspaceEntry } from '../domain/types'
import type { CollectionMatchExplanation } from '../engine/search'
import { ArrowSprite } from './ArrowSprite'
import { ItemIcon } from './ItemIcon'
import { MatchEvidence } from './MatchEvidence'

interface CalculatedSearchRowProps {
  entry: TargetWorkspaceEntry
  entryNumber: number
  state: RowOptimizationState | undefined
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
  collections?: ReadonlyMap<string, RecipeResultCollection>
  onRetry?: () => void
}

interface CraftGroup {
  kind: RankedSearch['kind']
  key: string
  search: RankedSearch
  searches: RankedSearch[]
}

interface SearchCategory {
  kind: RankedSearch['kind']
  name: string
  crafts: CraftGroup[]
}

interface CraftContents {
  targetItemIds: string[]
  junkItemIds: string[]
}

type CraftExplanation =
  | { kind: 'item'; explanation: CollectionMatchExplanation; explanations: CollectionMatchExplanation[] }
  | { kind: 'collection'; explanation: CollectionMatchExplanation; itemIds: string[]; label: string }

function categoryName(kind: RankedSearch['kind']): string {
  return kind === 'single' ? 'Regular' : 'Overlap'
}

function displayQuery(text: string): string {
  return text.replaceAll(' ', '_')
}

function replacesWholeQuery(step: RankedSearch['steps'][number], previousQuery: string | undefined): boolean {
  return previousQuery !== undefined && step.retainedPrefix.length === 0 && step.freeBackspaceCount >= previousQuery.length
}

function searchDescription(search: RankedSearch): string {
  return search.steps.map((step, index) => index === 0
    ? displayQuery(step.query)
    : `${replacesWholeQuery(step, search.steps[index - 1]?.query) ? 'Shift+Home' : `${step.freeBackspaceCount} backspace${step.freeBackspaceCount === 1 ? '' : 's'}`}, ${displayQuery(step.typedSuffix)}`).join(', ')
}

function SearchQuery({ search }: { search: RankedSearch }) {
  return <span className="craft-query" aria-label={searchDescription(search)}>
    {search.steps.map((step, index) => <Fragment key={`${step.query}-${index}`}>
      {index > 0 && (replacesWholeQuery(step, search.steps[index - 1]?.query)
        ? <span className="craft-query__shortcut" aria-label="Shift+Home"><ArrowSprite direction="shift" /><ArrowSprite direction="home" /></span>
        : step.freeBackspaceCount > 0
        ? <span className="craft-query__backspaces" aria-label={`${step.freeBackspaceCount} backspaces`}>
          {Array.from({ length: step.freeBackspaceCount }, (_, arrowIndex) => <ArrowSprite key={arrowIndex} direction="backspace" />)}
        </span>
        : <ArrowSprite direction="right" className="craft-query__advance" />)}
      <span className="craft-query__term">{displayQuery(index === 0 ? step.query : step.typedSuffix)}</span>
    </Fragment>)}
  </span>
}

function groupCrafts(searches: readonly RankedSearch[], kind: RankedSearch['kind']): CraftGroup[] {
  const groups = new Map<string, CraftGroup>()
  for (const search of searches) {
    if (search.kind !== kind) continue
    const key = search.queries.join('\u0000')
    const current = groups.get(key)
    if (current) current.searches.push(search)
    else groups.set(key, { kind, key, search, searches: [search] })
  }
  return [...groups.values()]
}

function compactPreviews(regular: readonly CraftGroup[], overlap: readonly CraftGroup[]): CraftGroup[] {
  if (regular.length > 0 && overlap.length > 0) return [regular[0], overlap[0]]
  return (regular.length > 0 ? regular : overlap).slice(0, 2)
}

function craftContents(craft: CraftGroup): CraftContents {
  const targetIds = new Set<string>()
  const junkItemIds: string[] = []
  for (const search of craft.searches) for (const step of search.steps) {
    for (const itemId of step.coveredTargetIds) targetIds.add(itemId)
    junkItemIds.push(...step.junkItemIds)
  }
  return { targetItemIds: [...targetIds], junkItemIds }
}

function collectionLabel(collection: RecipeResultCollection, items: ReadonlyMap<string, SearchItem>): string {
  const names = collection.outputItemIds.map((itemId) => items.get(itemId)?.name.toLocaleLowerCase().split(' ') ?? [])
  let suffix = names[0] ?? []
  while (suffix.length > 0 && !names.every((name) => name.slice(-suffix.length).join(' ') === suffix.join(' '))) suffix = suffix.slice(1)
  const base = suffix.join(' ') || collection.recipeGroup?.replaceAll('_', ' ') || 'items'
  return base.endsWith('s') ? base : `${base}s`
}

function craftExplanations(
  craft: CraftGroup,
  targetItemIds: readonly string[],
  collections: ReadonlyMap<string, RecipeResultCollection> | undefined,
  items: ReadonlyMap<string, SearchItem>,
): CraftExplanation[] {
  const targets = new Set(targetItemIds)
  const unique = new Map<string, CollectionMatchExplanation>()
  for (const search of craft.searches) for (const explanation of search.steps.flatMap((step) => step.explanations)) {
    unique.set(JSON.stringify(explanation), explanation)
  }
  const allExplanations = [...unique.values()]
  const matchedMemberIds = new Map<string, Set<string>>()
  for (const explanation of allExplanations) {
    const key = `${explanation.collectionId}\u0000${explanation.query}`
    const memberIds = matchedMemberIds.get(key) ?? new Set<string>()
    memberIds.add(explanation.matchedMemberItemId)
    matchedMemberIds.set(key, memberIds)
  }
  const summarized = new Map<string, CraftExplanation>()
  for (const [key, memberIds] of matchedMemberIds) {
    const [collectionId] = key.split('\u0000')
    const collection = collections?.get(collectionId)
    if (!collection || collection.outputItemIds.length < 2 || !collection.outputItemIds.every((itemId) => memberIds.has(itemId)) || !collection.outputItemIds.some((itemId) => targets.has(itemId))) continue
    const explanation = allExplanations.find((candidate) => `${candidate.collectionId}\u0000${candidate.query}` === key)
    if (explanation) summarized.set(key, { kind: 'collection', explanation, itemIds: [explanation.visibleOutputItemId], label: collectionLabel(collection, items) })
  }
  const result: CraftExplanation[] = []
  const emittedSummaries = new Set<string>()
  const emittedItems = new Set<string>()
  for (const explanation of allExplanations) {
    const key = `${explanation.collectionId}\u0000${explanation.query}`
    const summary = summarized.get(key)
    if (summary) {
      if (!emittedSummaries.has(key)) {
        emittedSummaries.add(key)
        result.push(summary)
      }
    } else if (targets.has(explanation.visibleOutputItemId)) {
      const itemKey = `${explanation.visibleOutputItemId}\u0000${explanation.matchedMemberItemId}\u0000${explanation.source}\u0000${explanation.line}`
      if (emittedItems.has(itemKey)) continue
      emittedItems.add(itemKey)
      result.push({
        kind: 'item',
        explanation,
        explanations: allExplanations.filter((candidate) => `${candidate.visibleOutputItemId}\u0000${candidate.matchedMemberItemId}\u0000${candidate.source}\u0000${candidate.line}` === itemKey),
      })
    }
  }
  return result
}

function CraftItems({ contents, items, icons }: {
  contents: CraftContents
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
}) {
  const visibleJunk = contents.junkItemIds.slice(0, 3)
  const remainingJunkCount = contents.junkItemIds.length - visibleJunk.length
  return <span className="craft-result__items" aria-label="Matched items and junk preview">
    <span className="craft-result__targets" aria-label={`Matched targets: ${contents.targetItemIds.length} items`}>
      {contents.targetItemIds.map((itemId) => {
        const item = items.get(itemId)
        return <ItemIcon key={itemId} itemId={itemId} name={item?.name ?? itemId} manifest={icons} />
      })}
    </span>
    {contents.junkItemIds.length > 0 && <span
      className="craft-result__junk"
      aria-label={`Junk preview: ${visibleJunk.length} of ${contents.junkItemIds.length} items`}
    >
      {visibleJunk.map((itemId, index) => {
        const item = items.get(itemId)
        return <ItemIcon key={`${itemId}-${index}`} itemId={itemId} name={item?.name ?? itemId} manifest={icons} />
      })}
      {remainingJunkCount > 0 && <span className="craft-result__more-junk" aria-label={`${remainingJunkCount} more junk items`}>+{remainingJunkCount}</span>}
    </span>}
  </span>
}

function RemainingJunk({ itemIds, items, icons }: { itemIds: readonly string[]; items: ReadonlyMap<string, SearchItem>; icons: IconManifest }) {
  return <span className="craft-result__remaining-junk" aria-label={`Remaining junk: ${itemIds.length} items`}>
    {itemIds.map((itemId, index) => {
      const item = items.get(itemId)
      return <ItemIcon key={`${itemId}-${index}`} itemId={itemId} name={item?.name ?? itemId} manifest={icons} />
    })}
  </span>
}

function CollectionEvidence({ explanation, itemIds, label, items, icons }: Extract<CraftExplanation, { kind: 'collection' }> & { items: ReadonlyMap<string, SearchItem>; icons: IconManifest }) {
  const matchStart = label.indexOf(explanation.query.toLocaleLowerCase())
  const matchEnd = matchStart + explanation.query.length
  return <span className="match-evidence match-evidence--collection" aria-label={`All ${label}`} title={`All ${label} match ${explanation.query}`}>
    {itemIds.map((itemId) => {
      const item = items.get(itemId)
      return <ItemIcon key={itemId} itemId={itemId} name={item?.name ?? itemId} manifest={icons} />
    })}
    <span>all {matchStart < 0 ? label : <>{label.slice(0, matchStart)}<mark>{label.slice(matchStart, matchEnd)}</mark>{label.slice(matchEnd)}</>}</span>
  </span>
}

function CraftDetail({ craft, items, icons, collections }: {
  craft: CraftGroup
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
  collections: ReadonlyMap<string, RecipeResultCollection> | undefined
}) {
  const [showEvidence, setShowEvidence] = useState(false)
  const evidenceId = useId()
  const contents = useMemo(() => craftContents(craft), [craft])
  const remainingJunkItemIds = contents.junkItemIds.slice(3)
  const explanations = useMemo(() => craftExplanations(craft, contents.targetItemIds, collections, items), [craft, contents.targetItemIds, collections, items])
  const name = `${categoryName(craft.kind)} craft: ${searchDescription(craft.search)}`
  const canExpand = remainingJunkItemIds.length > 0 || explanations.length > 0
  const bar = <>
    <SearchQuery search={craft.search} />
    <CraftItems contents={contents} items={items} icons={icons} />
  </>

  return <li className="craft-result" aria-label={name}>
    {canExpand
      ? <button
        type="button"
        className="craft-result__toggle"
        aria-label={`${showEvidence ? 'Hide' : 'Show'} why ${name}`}
        aria-controls={evidenceId}
        aria-expanded={showEvidence}
        onClick={() => setShowEvidence((current) => !current)}
      >
        {bar}
        <span className="craft-result__toggle-mark"><ArrowSprite direction={showEvidence ? 'up' : 'down'} compact /></span>
      </button>
      : <div className="craft-result__bar">{bar}</div>}
    {showEvidence && <div id={evidenceId} className="craft-result__details">
      {remainingJunkItemIds.length > 0 && <RemainingJunk itemIds={remainingJunkItemIds} items={items} icons={icons} />}
      {explanations.length > 0 && <div className="craft-result__evidence">
        {explanations.map((explanation) => explanation.kind === 'collection'
          ? <CollectionEvidence key={`collection:${explanation.explanation.collectionId}:${explanation.explanation.query}`} {...explanation} items={items} icons={icons} />
          : <MatchEvidence key={JSON.stringify(explanation.explanation)} explanation={explanation.explanation} explanations={explanation.explanations} items={items} icons={icons} />)}
      </div>}
    </div>}
  </li>
}

function CraftCategory({ category, items, icons, collections }: {
  category: SearchCategory
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
  collections: ReadonlyMap<string, RecipeResultCollection> | undefined
}) {
  const [showTopTen, setShowTopTen] = useState(false)
  const visibleCrafts = category.crafts.slice(0, showTopTen ? 10 : 3)
  const categoryLabel = category.name.toLocaleLowerCase()

  return <section className="craft-category" aria-label={category.name}>
    <h3>{category.name}</h3>
    <ol>
      {visibleCrafts.map((craft) => <CraftDetail key={craft.key} craft={craft} items={items} icons={icons} collections={collections} />)}
    </ol>
    {category.crafts.length > 3 && <button
      type="button"
      className="craft-category__more"
      aria-label={`${showTopTen ? 'Show top 3' : 'Show top 10'} ${categoryLabel}`}
      onClick={() => setShowTopTen((current) => !current)}
    >
      {showTopTen ? 'Show top 3' : 'Show top 10'} <span><ArrowSprite direction={showTopTen ? 'up' : 'down'} compact /></span>
    </button>}
  </section>
}

function TargetItems({ entry, items, icons }: {
  entry: TargetWorkspaceEntry
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
}) {
  return <span className="calculated-search-row__targets" aria-label={`Targets for item set ${entry.id}`}>
    {entry.targetIds.map((itemId) => {
      const item = items.get(itemId)
      return <ItemIcon key={itemId} itemId={itemId} name={item?.name ?? itemId} manifest={icons} size="detail" />
    })}
  </span>
}

export function CalculatedSearchRow({ entry, entryNumber, state, items, icons, collections, onRetry }: CalculatedSearchRowProps) {
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  const label = `item set ${entryNumber}`
  if (!entry.enabled) return <section className="calculated-search-row" aria-label={`Calculated searches for ${label}`}><span>Disabled</span></section>
  if (state === undefined || state.status === 'idle') return <section className="calculated-search-row" aria-label={`Calculated searches for ${label}`}><span>Waiting for goals</span></section>
  if (state.status === 'pending') return <section className="calculated-search-row" aria-label={`Calculated searches for ${label}`}><span>Calculating…</span></section>
  if (state.status === 'error') return <section className="calculated-search-row" aria-label={`Calculated searches for ${label}`}>
    <span>Calculation error</span>
    {onRetry && <button type="button" onClick={onRetry} aria-label={`Retry item set ${entryNumber}`}>Retry</button>}
  </section>
  if (state.outcome.kind === 'no-viable') return <section className="calculated-search-row" aria-label={`Calculated searches for ${label}`}>
    <TargetItems entry={entry} items={items} icons={icons} />
    <div className="calculated-search-row__status">
      <span>No viable search</span>
      <strong className="metric">{state.outcome.bestScore}</strong>
    </div>
  </section>

  const regular = groupCrafts(state.outcome.rankedSearches, 'single')
  const overlap = groupCrafts(state.outcome.rankedSearches, 'overlap')
  const categories: SearchCategory[] = [
    { kind: 'single', name: 'Regular crafts', crafts: regular },
    { kind: 'overlap', name: 'Overlap crafts', crafts: overlap },
  ]
  const availableCategories = categories.filter((category) => category.crafts.length > 0)
  const previews = compactPreviews(regular, overlap)

  return <section className="calculated-search-row" aria-label={`Calculated searches for ${label}`}>
    <div className="calculated-search-row__summary">
      <TargetItems entry={entry} items={items} icons={icons} />
      <ul className="craft-previews" aria-label={`Craft previews for ${label}`}>
        {previews.map((craft) => <li key={`${craft.kind}:${craft.key}`} aria-label={`${categoryName(craft.kind)} craft: ${searchDescription(craft.search)}`}>
          <span className={`craft-kind craft-kind--${craft.kind}`}>{categoryName(craft.kind)}</span>
          <SearchQuery search={craft.search} />
        </li>)}
      </ul>
      <button
        type="button"
        className="calculated-search-row__toggle"
        aria-label={`${expanded ? 'Hide' : 'Show all'} crafts for item set ${entryNumber}`}
        aria-controls={listId}
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <ArrowSprite direction={expanded ? 'up' : 'down'} />
      </button>
    </div>
    {expanded && <div id={listId} className="craft-categories">
      {availableCategories.map((category) => <CraftCategory key={category.kind} category={category} items={items} icons={icons} collections={collections} />)}
    </div>}
  </section>
}
