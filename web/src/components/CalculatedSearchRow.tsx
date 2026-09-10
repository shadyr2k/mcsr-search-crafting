import { Fragment, useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react'

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
  title?: string
  headerControl?: ReactNode
}

interface CraftContents {
  targetItemIds: string[]
  junkItemIds: string[]
}

type CraftExplanation =
  | { kind: 'item'; explanation: CollectionMatchExplanation; explanations: CollectionMatchExplanation[] }
  | { kind: 'collection'; explanation: CollectionMatchExplanation; itemIds: string[] }

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
    const key = (kind === 'overlap' ? [...search.queries].sort() : search.queries).join('\u0000')
    const current = groups.get(key)
    if (current) current.searches.push(search)
    else groups.set(key, { kind, key, search, searches: [search] })
  }
  return [...groups.values()]
}

function usesOnlyShiftHomeReplacements(craft: CraftGroup): boolean {
  return craft.search.steps.length > 1 && craft.search.steps.slice(1).every((step, index) =>
    replacesWholeQuery(step, craft.search.steps[index]?.query),
  )
}

function isJunkless(craft: CraftGroup): boolean {
  return craftContents(craft).junkItemIds.length === 0
}

function usesNumberQuery(craft: CraftGroup): boolean {
  return craft.search.queries.some((query) => /\p{Number}/u.test(query))
}

function preferredOverlapCraft(overlap: readonly CraftGroup[]): CraftGroup | undefined {
  const junklessBackspaceCraft = overlap.find((craft) => !usesOnlyShiftHomeReplacements(craft) && isJunkless(craft))
  if (junklessBackspaceCraft) return junklessBackspaceCraft

  const junklessShiftHomeCraft = overlap.find((craft) => usesOnlyShiftHomeReplacements(craft) && isJunkless(craft))
  const hasBackspaceCraftWithJunk = overlap.some((craft) => !usesOnlyShiftHomeReplacements(craft) && !isJunkless(craft))
  if (junklessShiftHomeCraft && hasBackspaceCraftWithJunk) return junklessShiftHomeCraft

  return overlap.find((craft) => !usesOnlyShiftHomeReplacements(craft)) ?? overlap[0]
}

function orderedOverlapCrafts(overlap: readonly CraftGroup[]): CraftGroup[] {
  const preferred = preferredOverlapCraft(overlap)
  return preferred === undefined ? [] : [preferred, ...overlap.filter((craft) => craft !== preferred)]
}

const MAX_COMPACT_JUNK_ICONS = 3

function compactPreviews(regular: readonly CraftGroup[], overlap: readonly CraftGroup[]): CraftGroup[] {
  const previews = regular.slice(0, 2)
  const orderedOverlap = orderedOverlapCrafts(overlap)
  const previewOverlap = orderedOverlap[0]
  if (previews.length > 0 && previewOverlap) previews.push(previewOverlap)
  else if (previews.length > 0 && regular[2]) previews.push(regular[2])
  return previews.length > 0 ? previews : orderedOverlap.slice(0, 2)
}

function craftContents(craft: CraftGroup): CraftContents {
  const targetIds = new Set<string>()
  const junkItemIds: string[] = []
  const searches = craft.kind === 'overlap' ? [craft.search] : craft.searches
  for (const search of searches) for (const step of search.steps) {
    for (const itemId of step.coveredTargetIds) targetIds.add(itemId)
    junkItemIds.push(...step.junkItemIds)
  }
  return { targetItemIds: [...targetIds], junkItemIds }
}

function craftExplanations(
  craft: CraftGroup,
  targetItemIds: readonly string[],
  collections: ReadonlyMap<string, RecipeResultCollection> | undefined,
): CraftExplanation[] {
  const targets = new Set(targetItemIds)
  const unique = new Map<string, CollectionMatchExplanation>()
  const searches = craft.kind === 'overlap' ? [craft.search] : craft.searches
  for (const search of searches) for (const explanation of search.steps.flatMap((step) => step.explanations)) {
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
    if (!collection || memberIds.size < 2 || !collection.outputItemIds.some((itemId) => targets.has(itemId))) continue
    const explanation = allExplanations.find((candidate) => `${candidate.collectionId}\u0000${candidate.query}` === key)
    if (explanation) summarized.set(key, { kind: 'collection', explanation, itemIds: [...memberIds] })
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

function CraftItems({ contents, items, icons, showJunk = true }: {
  contents: CraftContents
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
  showJunk?: boolean
}) {
  const visibleJunkCount = contents.junkItemIds.length > MAX_COMPACT_JUNK_ICONS
    // Reserve the final compact slot for the aggregate count. Keeping one
    // fewer icon is clearer than clipping the "+n" indicator.
    ? MAX_COMPACT_JUNK_ICONS - 2
    : contents.junkItemIds.length
  const visibleJunk = contents.junkItemIds.slice(0, visibleJunkCount)
  const remainingJunkCount = contents.junkItemIds.length - visibleJunk.length
  const visibleItemCount = contents.targetItemIds.length + visibleJunk.length
  return <span
    className="craft-result__items"
    style={{ '--craft-item-count': Math.max(visibleItemCount, 1) } as CSSProperties}
    aria-label="Matched items and junk preview"
  >
    <span className="craft-result__targets" aria-label={`Matched targets: ${contents.targetItemIds.length} items`}>
      {contents.targetItemIds.map((itemId) => {
        const item = items.get(itemId)
        return <ItemIcon key={itemId} itemId={itemId} name={item?.name ?? itemId} manifest={icons} />
      })}
    </span>
    {showJunk && contents.junkItemIds.length > 0 && <span
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

function RemainingJunk({ itemIds, items, icons, label = `All junk: ${itemIds.length} items` }: { itemIds: readonly string[]; items: ReadonlyMap<string, SearchItem>; icons: IconManifest; label?: string }) {
  return <span className="craft-result__remaining-junk" aria-label={label}>
    {itemIds.map((itemId, index) => {
      const item = items.get(itemId)
      return <ItemIcon key={`${itemId}-${index}`} itemId={itemId} name={item?.name ?? itemId} manifest={icons} />
    })}
  </span>
}

function StepQuery({ search, index }: { search: RankedSearch; index: number }) {
  const step = search.steps[index]
  const previousQuery = search.steps[index - 1]?.query
  return <span className="craft-query" aria-label={`Search ${index + 1}: ${searchDescription({ ...search, steps: search.steps.slice(0, index + 1) })}`}>
    {index > 0 && (replacesWholeQuery(step, previousQuery)
      ? <span className="craft-query__shortcut" aria-label="Shift+Home"><ArrowSprite direction="shift" /><ArrowSprite direction="home" /></span>
      : step.freeBackspaceCount > 0
      ? <span className="craft-query__backspaces" aria-label={`${step.freeBackspaceCount} backspaces`}>
        {Array.from({ length: step.freeBackspaceCount }, (_, arrowIndex) => <ArrowSprite key={arrowIndex} direction="backspace" />)}
      </span>
      : <ArrowSprite direction="right" className="craft-query__advance" />)}
    <span className="craft-query__term">{displayQuery(index === 0 ? step.query : step.typedSuffix)}</span>
  </span>
}

function OverlapCraftSteps({ search, items, icons, expanded }: {
  search: RankedSearch
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
  expanded: boolean
}) {
  return <div className="craft-result__steps">
    {search.steps.map((step, index) => {
      const contents = { targetItemIds: step.newTargetIds, junkItemIds: step.junkItemIds }
      return <div key={`${step.query}-${index}`} className="craft-result__step" aria-label={`Search step ${index + 1}`}>
        <div className="craft-result__step-bar">
          <StepQuery search={search} index={index} />
          <CraftItems contents={contents} items={items} icons={icons} showJunk={!expanded} />
        </div>
        {step.junkItemIds.length > 0 && <div className={`craft-result__step-details${expanded ? ' craft-result__step-details--open' : ''}`} aria-hidden={!expanded}>
          <div className="craft-result__step-details-content">
            <RemainingJunk
              itemIds={step.junkItemIds}
              items={items}
              icons={icons}
              label={`All junk for ${displayQuery(step.query)}: ${step.junkItemIds.length} items`}
            />
          </div>
        </div>}
      </div>
    })}
  </div>
}

function CollectionEvidence({ explanation, itemIds, items, icons }: Extract<CraftExplanation, { kind: 'collection' }> & { items: ReadonlyMap<string, SearchItem>; icons: IconManifest }) {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    setCurrentIndex(0)
    if (itemIds.length < 2) return
    const timer = window.setInterval(() => setCurrentIndex((index) => (index + 1) % itemIds.length), 800)
    return () => window.clearInterval(timer)
  }, [itemIds])

  const itemId = itemIds[currentIndex] ?? itemIds[0]
  if (!itemId) return null
  const item = items.get(itemId)
  const itemName = item?.name ?? itemId
  const matchStart = itemName.toLocaleLowerCase().indexOf(explanation.query.toLocaleLowerCase())
  const matchEnd = matchStart + explanation.query.length
  return <span className="match-evidence match-evidence--collection" aria-label={itemName} title={`${itemName} match ${explanation.query}`}>
    <ItemIcon itemId={itemId} name={itemName} manifest={icons} />
    <span>{matchStart < 0 ? itemName : <>{itemName.slice(0, matchStart)}<mark>{itemName.slice(matchStart, matchEnd)}</mark>{itemName.slice(matchEnd)}</>}</span>
  </span>
}

function CraftDetail({ craft, items, icons, collections }: {
  craft: CraftGroup
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
  collections: ReadonlyMap<string, RecipeResultCollection> | undefined
}) {
  const [showEvidence, setShowEvidence] = useState(false)
  const [hasShownEvidence, setHasShownEvidence] = useState(false)
  const evidenceId = useId()
  const contents = useMemo(() => craftContents(craft), [craft])
  const explanations = useMemo(() => craftExplanations(craft, contents.targetItemIds, collections), [craft, contents.targetItemIds, collections])
  const name = `${categoryName(craft.kind)} craft: ${searchDescription(craft.search)}`
  const canExpand = contents.junkItemIds.length > 0 || explanations.length > 0
  const usesStepRows = craft.kind === 'overlap' && contents.junkItemIds.length > 0
  const toggleEvidence = () => {
    setShowEvidence((current) => {
      const next = !current
      if (next) setHasShownEvidence(true)
      return next
    })
  }

  const bar = usesStepRows
    ? <OverlapCraftSteps search={craft.search} items={items} icons={icons} expanded={showEvidence} />
    : <>
      <SearchQuery search={craft.search} />
      <span className="craft-result__item-preview"><CraftItems contents={contents} items={items} icons={icons} showJunk={!showEvidence} /></span>
    </>

  return <li className={`craft-result craft-result--${craft.kind}-craft${usesStepRows ? ' craft-result--overlap' : ''}`} aria-label={name}>
    {canExpand
      ? <button
        type="button"
        className="craft-result__toggle"
        aria-label={`${showEvidence ? 'Hide' : 'Show'} why ${name}`}
        aria-controls={evidenceId}
        aria-expanded={showEvidence}
        onClick={toggleEvidence}
      >
        {bar}
        <span className="craft-result__toggle-mark"><ArrowSprite direction={showEvidence ? 'up' : 'down'} compact /></span>
      </button>
      : <div className="craft-result__bar">{bar}</div>}
    {hasShownEvidence && <div id={evidenceId} className={`craft-result__details${showEvidence ? ' craft-result__details--open' : ''}`} aria-hidden={!showEvidence}>
      <div className="craft-result__details-content">
      {!usesStepRows && contents.junkItemIds.length > 0 && <RemainingJunk itemIds={contents.junkItemIds} items={items} icons={icons} />}
      {explanations.length > 0 && <div className="craft-result__evidence">
        {explanations.map((explanation) => explanation.kind === 'collection'
          ? <CollectionEvidence key={`collection:${explanation.explanation.collectionId}:${explanation.explanation.query}`} {...explanation} items={items} icons={icons} />
          : <MatchEvidence key={JSON.stringify(explanation.explanation)} explanation={explanation.explanation} explanations={explanation.explanations} items={items} icons={icons} />)}
      </div>}
      </div>
    </div>}
  </li>
}

function CraftCategory({ category, items, icons, collections, showMore: controlledShowMore, onShowMoreChange }: {
  category: SearchCategory
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
  collections: ReadonlyMap<string, RecipeResultCollection> | undefined
  showMore?: boolean
  onShowMoreChange?: (showMore: boolean) => void
}) {
  const [localShowMore, setLocalShowMore] = useState(false)
  const showMore = controlledShowMore ?? localShowMore
  const setShowMore = onShowMoreChange ?? setLocalShowMore
  const visibleCrafts = category.crafts.slice(0, showMore ? 10 : 3)
  const categoryLabel = category.name.toLocaleLowerCase()

  return <section className={`craft-category craft-category--${category.kind}`} aria-label={category.name}>
    {category.title && <header className="craft-category__header">
      <h3>{category.title}</h3>
      {category.headerControl}
    </header>}
    <ol>
      {visibleCrafts.map((craft) => <CraftDetail key={craft.key} craft={craft} items={items} icons={icons} collections={collections} />)}
    </ol>
    {category.crafts.length > 3 && <button
      type="button"
      className="craft-category__more"
      aria-label={`${showMore ? 'Show less' : 'Show more'} ${categoryLabel}`}
      onClick={() => setShowMore(!showMore)}
    >
      {showMore ? 'Show less' : 'Show more'} <span><ArrowSprite direction={showMore ? 'up' : 'down'} compact /></span>
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
  const [hasExpanded, setHasExpanded] = useState(false)
  const [overlapView, setOverlapView] = useState<'junkless' | 'other'>('junkless')
  const [expandedOverlapViews, setExpandedOverlapViews] = useState({ junkless: false, other: false })
  const [showNumberCrafts, setShowNumberCrafts] = useState(true)
  const listId = useId()
  const label = `item set ${entryNumber}`
  if (!entry.enabled) return null
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
  const hasNumberCrafts = [...regular, ...overlap].some(usesNumberQuery)
  const displayedRegular = showNumberCrafts ? regular : regular.filter((craft) => !usesNumberQuery(craft))
  const displayedOverlap = orderedOverlapCrafts(showNumberCrafts ? overlap : overlap.filter((craft) => !usesNumberQuery(craft)))
  const previews = compactPreviews(displayedRegular, displayedOverlap)
  const junklessOverlap = displayedOverlap.filter((craft) => craftContents(craft).junkItemIds.length === 0)
  const otherOverlap = displayedOverlap.filter((craft) => craftContents(craft).junkItemIds.length > 0)
  const visibleOverlapView = overlapView === 'junkless' && junklessOverlap.length === 0 ? 'other' : overlapView
  const visibleOverlapCrafts = visibleOverlapView === 'junkless' ? junklessOverlap : otherOverlap
  const overlapHeaderControl = <div className="overlap-category-toggle" role="group" aria-label="Overlap craft category">
    <button
      type="button"
      aria-pressed={visibleOverlapView === 'junkless'}
      disabled={junklessOverlap.length === 0}
      onClick={() => setOverlapView('junkless')}
    >junkless</button>
    <span aria-hidden="true">|</span>
    <button
      type="button"
      aria-pressed={visibleOverlapView === 'other'}
      disabled={otherOverlap.length === 0}
      onClick={() => setOverlapView('other')}
    >other</button>
  </div>
  const numberCraftFilter = hasNumberCrafts && <div className="number-craft-filter" role="group" aria-label="Number craft filter">
    <span>number crafts</span>
    <button
      type="button"
      aria-pressed={showNumberCrafts}
      onClick={() => setShowNumberCrafts(true)}
    >show</button>
    <span aria-hidden="true">|</span>
    <button
      type="button"
      aria-pressed={!showNumberCrafts}
      onClick={() => setShowNumberCrafts(false)}
    >hide</button>
  </div>
  const toggleCrafts = () => {
    setExpanded((current) => {
      const next = !current
      if (next) setHasExpanded(true)
      return next
    })
  }

  return <section className="calculated-search-row" aria-label={`Calculated searches for ${label}`}>
    <div className="calculated-search-row__summary">
      <TargetItems entry={entry} items={items} icons={icons} />
      <ul className="craft-previews" aria-label={`Craft previews for ${label}`}>
        {previews.map((craft) => <li key={`${craft.kind}:${craft.key}`} className={`craft-preview craft-preview--${craft.kind}`} aria-label={`${categoryName(craft.kind)} craft: ${searchDescription(craft.search)}`}>
          <SearchQuery search={craft.search} />
          {craftContents(craft).junkItemIds.length === 0 && <span className="craft-preview__star" aria-label="Junkless craft">★</span>}
        </li>)}
      </ul>
      <button
        type="button"
        className="calculated-search-row__toggle"
        aria-label={`${expanded ? 'Hide' : 'Show all'} crafts for item set ${entryNumber}`}
        aria-controls={listId}
        aria-expanded={expanded}
        onClick={toggleCrafts}
      >
        <ArrowSprite direction={expanded ? 'up' : 'down'} />
      </button>
    </div>
    {hasExpanded && <div id={listId} className={`craft-categories${expanded ? ' craft-categories--open' : ''}`} aria-hidden={!expanded}>
      <div className="craft-categories__content">
      {numberCraftFilter}
      {displayedRegular.length > 0 && <CraftCategory category={{ kind: 'single', name: 'Regular crafts', title: 'regular crafts', crafts: displayedRegular }} items={items} icons={icons} collections={collections} />}
      {visibleOverlapCrafts.length > 0 && <CraftCategory
        category={{ kind: 'overlap', name: 'Overlap crafts', title: 'overlap crafts', headerControl: overlapHeaderControl, crafts: visibleOverlapCrafts }}
        items={items}
        icons={icons}
        collections={collections}
        showMore={expandedOverlapViews[visibleOverlapView]}
        onShowMoreChange={(showMore) => setExpandedOverlapViews((current) => ({ ...current, [visibleOverlapView]: showMore }))}
      />}
      </div>
    </div>}
  </section>
}
