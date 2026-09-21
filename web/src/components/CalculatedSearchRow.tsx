import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type { IconManifest } from '../data/iconManifest'
import type { RankedSearch, RecipeResultCollection, RowOptimizationState, SearchItem, TargetWorkspaceEntry } from '../domain/types'
import type { CollectionMatchExplanation } from '../engine/search'
import { removeRedundantItemIdSearches } from '../engine/rankedSearch'
import { ArrowSprite } from './ArrowSprite'
import { ItemIcon } from './ItemIcon'
import { MatchEvidence } from './MatchEvidence'
import { QueryControl } from './QueryControl'

interface CalculatedSearchRowProps {
  entry: TargetWorkspaceEntry
  entryNumber: number
  state: RowOptimizationState | undefined
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
  collections?: ReadonlyMap<string, RecipeResultCollection>
  onRetry?: () => void
  summaryLead?: ReactNode
  summaryLabel?: string
  hidePreviewDecorations?: boolean
  hideOutcomeScore?: boolean
  previewMode?: 'default' | 'junkless-single' | 'junkless-overlap'
  hideOverflowingPreviews?: boolean
  textControlKeycaps?: boolean
  hideNumberCraftsByDefault?: boolean
  removeAnimations?: boolean
  className?: string
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

function SearchQuery({ search, textControlKeycaps = false }: { search: RankedSearch; textControlKeycaps?: boolean }) {
  return <span className="craft-query" aria-label={searchDescription(search)}>
    {search.steps.map((step, index) => <Fragment key={`${step.query}-${index}`}>
      {index > 0 && (replacesWholeQuery(step, search.steps[index - 1]?.query)
        ? <QueryControl kind="shift-home" textKeycaps={textControlKeycaps} />
        : step.freeBackspaceCount > 0
        ? <QueryControl kind="backspace" backspaceCount={step.freeBackspaceCount} textKeycaps={textControlKeycaps} />
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

function JunkPreview({
  itemIds,
  iconCount,
  items,
  icons,
  decorative = false,
}: {
  itemIds: readonly string[]
  iconCount: number
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
  decorative?: boolean
}) {
  const visibleItemIds = itemIds.slice(0, iconCount)
  const remainingItemCount = itemIds.length - visibleItemIds.length
  return <>
    <span className="craft-result__junk-icons" aria-hidden="true">
      {visibleItemIds.map((itemId, index) => {
        const item = items.get(itemId)
        return <ItemIcon key={`${itemId}-${index}`} itemId={itemId} name={item?.name ?? itemId} manifest={icons} />
      })}
    </span>
    {remainingItemCount > 0 && <span className="craft-result__more-junk" {...(!decorative && { 'aria-label': `${remainingItemCount} more junk items` })}>+{remainingItemCount}</span>}
  </>
}

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
  const itemPreviewRef = useRef<HTMLSpanElement>(null)
  const maxVisibleJunkIcons = Math.min(contents.junkItemIds.length, MAX_COMPACT_JUNK_ICONS)
  const [visibleJunkIconCount, setVisibleJunkIconCount] = useState(maxVisibleJunkIcons)

  useLayoutEffect(() => {
    const preview = itemPreviewRef.current
    if (!preview || !showJunk || contents.junkItemIds.length === 0) {
      setVisibleJunkIconCount(maxVisibleJunkIcons)
      return
    }

    const updateJunkVisibility = () => {
      const targets = preview.querySelector<HTMLElement>('.craft-result__targets')
      if (!targets) return

      const gap = Number.parseFloat(getComputedStyle(preview).gap) || 0
      const targetWidth = targets.getBoundingClientRect().width
      const availableWidth = preview.clientWidth
      const nextVisibleCount = Array.from({ length: maxVisibleJunkIcons + 1 }, (_, index) => maxVisibleJunkIcons - index)
        .find((iconCount) => {
          const sizer = preview.querySelector<HTMLElement>(`[data-junk-icon-count="${iconCount}"]`)
          // The measured strip mirrors the rendered divider and junk container.
          // Two pixels prevent fractional grid widths from clipping an icon
          // at a breakpoint.
          return sizer !== null && targetWidth + gap + sizer.getBoundingClientRect().width + 2 <= availableWidth
        })
      // Keep a junk signal in every compact row. When no icon fits, the zero
      // icon variant renders the aggregate +n count instead.
      setVisibleJunkIconCount(nextVisibleCount ?? 0)
    }

    // jsdom has no layout engine or ResizeObserver. Leave the complete preview
    // in place there; browser layout will make the responsive choice below.
    if (typeof ResizeObserver === 'undefined') {
      setVisibleJunkIconCount(maxVisibleJunkIcons)
      return
    }

    updateJunkVisibility()
    const observer = new ResizeObserver(updateJunkVisibility)
    observer.observe(preview)
    return () => observer.disconnect()
  }, [contents.junkItemIds, maxVisibleJunkIcons, showJunk])

  return <span
    ref={itemPreviewRef}
    className="craft-result__items"
    aria-label="Matched items and junk preview"
  >
    <span className="craft-result__targets" aria-label={`Matched targets: ${contents.targetItemIds.length} items`}>
      {contents.targetItemIds.map((itemId) => {
        const item = items.get(itemId)
        return <ItemIcon key={itemId} itemId={itemId} name={item?.name ?? itemId} manifest={icons} />
      })}
    </span>
    {showJunk && contents.junkItemIds.length > 0 && <>
      {visibleJunkIconCount >= 0 && <>
        <span className="craft-result__junk-divider" aria-hidden="true" />
        <span
          className="craft-result__junk"
          aria-label={`Junk preview: ${visibleJunkIconCount} of ${contents.junkItemIds.length} items`}
        >
          <JunkPreview itemIds={contents.junkItemIds} iconCount={visibleJunkIconCount} items={items} icons={icons} />
        </span>
      </>}
      <span className="craft-result__junk-sizers" aria-hidden="true">
        {Array.from({ length: maxVisibleJunkIcons + 1 }, (_, index) => maxVisibleJunkIcons - index).map((iconCount) => <span
          key={iconCount}
          className="craft-result__junk-sizer"
          data-junk-icon-count={iconCount}
        >
          <span className="craft-result__junk-divider" />
          <span className="craft-result__junk-sizer-content">
            <JunkPreview itemIds={contents.junkItemIds} iconCount={iconCount} items={items} icons={icons} decorative />
          </span>
        </span>)}
      </span>
    </>}
  </span>
}

function CraftPreviews({
  previews,
  label,
  hidePreviewDecorations,
  hideOverflowingPreviews,
  textControlKeycaps,
}: {
  previews: readonly CraftGroup[]
  label: string
  hidePreviewDecorations: boolean
  hideOverflowingPreviews: boolean
  textControlKeycaps: boolean
}) {
  const previewsRef = useRef<HTMLUListElement>(null)
  const overlapPreviewRef = useRef<HTMLLIElement>(null)
  const [visiblePreviewCount, setVisiblePreviewCount] = useState(previews.length)
  const [overlapIsTooWide, setOverlapIsTooWide] = useState(false)
  const overlapPreview = previews.find((craft) => craft.kind === 'overlap')

  useLayoutEffect(() => {
    if (!hideOverflowingPreviews) {
      setVisiblePreviewCount(previews.length)
      return
    }

    const list = previewsRef.current
    if (!list || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const gap = Number.parseFloat(getComputedStyle(list).gap) || 0
      let used = 0
      let visibleCount = 0
      for (const preview of [...list.querySelectorAll<HTMLElement>(':scope > .craft-preview:not(.craft-preview--sizer)')]) {
        const nextWidth = preview.getBoundingClientRect().width
        if (nextWidth === 0 || used + (visibleCount === 0 ? 0 : gap) + nextWidth > list.clientWidth) break
        used += (visibleCount === 0 ? 0 : gap) + nextWidth
        visibleCount += 1
      }
      setVisiblePreviewCount((current) => current === visibleCount ? current : visibleCount)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list.parentElement ?? list)
    return () => observer.disconnect()
  }, [hideOverflowingPreviews, previews])

  useLayoutEffect(() => {
    const list = previewsRef.current
    const overlap = overlapPreviewRef.current
    if (!list || !overlap || typeof ResizeObserver === 'undefined') {
      setOverlapIsTooWide(false)
      return
    }

    const measure = () => {
      const nextValue = overlap.scrollWidth > list.clientWidth
      setOverlapIsTooWide((current) => current === nextValue ? current : nextValue)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => observer.disconnect()
  }, [overlapPreview])

  return <ul ref={previewsRef} className={`craft-previews${overlapIsTooWide ? ' craft-previews--overlap-too-wide' : ''}`} aria-label={`Craft previews for ${label}`}>
    {previews.map((craft, index) => <li
      ref={craft === overlapPreview ? overlapPreviewRef : undefined}
      key={`${craft.kind}:${craft.key}`}
      className={`craft-preview craft-preview--${craft.kind}${hideOverflowingPreviews && index >= visiblePreviewCount ? ' craft-preview--overflow-hidden' : ''}`}
      aria-label={`${categoryName(craft.kind)} craft: ${searchDescription(craft.search)}`}
      aria-hidden={hideOverflowingPreviews && index >= visiblePreviewCount ? true : undefined}
    >
      <SearchQuery search={craft.search} textControlKeycaps={textControlKeycaps} />
      {!hidePreviewDecorations && craftContents(craft).junkItemIds.length === 0 && <span className="craft-preview__star" aria-label="Junkless craft">★</span>}
    </li>)}
  </ul>
}

function RemainingJunk({ itemIds, items, icons, label = `All junk: ${itemIds.length} items` }: { itemIds: readonly string[]; items: ReadonlyMap<string, SearchItem>; icons: IconManifest; label?: string }) {
  return <span className="craft-result__remaining-junk" aria-label={label}>
    {itemIds.map((itemId, index) => {
      const item = items.get(itemId)
      return <ItemIcon key={`${itemId}-${index}`} itemId={itemId} name={item?.name ?? itemId} manifest={icons} />
    })}
  </span>
}

function StepQuery({ search, index, textControlKeycaps }: { search: RankedSearch; index: number; textControlKeycaps: boolean }) {
  const step = search.steps[index]
  const previousQuery = search.steps[index - 1]?.query
  return <span className="craft-query" aria-label={`Search ${index + 1}: ${searchDescription({ ...search, steps: search.steps.slice(0, index + 1) })}`}>
    {index > 0 && (replacesWholeQuery(step, previousQuery)
      ? <QueryControl kind="shift-home" textKeycaps={textControlKeycaps} />
      : step.freeBackspaceCount > 0
      ? <QueryControl kind="backspace" backspaceCount={step.freeBackspaceCount} textKeycaps={textControlKeycaps} />
      : <ArrowSprite direction="right" className="craft-query__advance" />)}
    <span className="craft-query__term">{displayQuery(index === 0 ? step.query : step.typedSuffix)}</span>
  </span>
}

function OverlapCraftSteps({ search, items, icons, expanded, textControlKeycaps }: {
  search: RankedSearch
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
  expanded: boolean
  textControlKeycaps: boolean
}) {
  return <div className="craft-result__steps">
    {search.steps.map((step, index) => {
      const contents = { targetItemIds: step.newTargetIds, junkItemIds: step.junkItemIds }
      return <div key={`${step.query}-${index}`} className="craft-result__step" aria-label={`Search step ${index + 1}`}>
        <div className="craft-result__step-bar">
          <StepQuery search={search} index={index} textControlKeycaps={textControlKeycaps} />
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

function CollectionEvidence({ explanation, itemIds, items, icons, removeAnimations }: Extract<CraftExplanation, { kind: 'collection' }> & { items: ReadonlyMap<string, SearchItem>; icons: IconManifest; removeAnimations: boolean }) {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    setCurrentIndex(0)
    if (removeAnimations || itemIds.length < 2) return
    const timer = window.setInterval(() => setCurrentIndex((index) => (index + 1) % itemIds.length), 800)
    return () => window.clearInterval(timer)
  }, [itemIds, removeAnimations])

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

function CraftDetail({ craft, items, icons, collections, textControlKeycaps, removeAnimations }: {
  craft: CraftGroup
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
  collections: ReadonlyMap<string, RecipeResultCollection> | undefined
  textControlKeycaps: boolean
  removeAnimations: boolean
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
    ? <OverlapCraftSteps search={craft.search} items={items} icons={icons} expanded={showEvidence} textControlKeycaps={textControlKeycaps} />
    : <>
      <SearchQuery search={craft.search} textControlKeycaps={textControlKeycaps} />
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
          ? <CollectionEvidence key={`collection:${explanation.explanation.collectionId}:${explanation.explanation.query}`} {...explanation} items={items} icons={icons} removeAnimations={removeAnimations} />
          : <MatchEvidence key={JSON.stringify(explanation.explanation)} explanation={explanation.explanation} explanations={explanation.explanations} items={items} icons={icons} />)}
      </div>}
      </div>
    </div>}
  </li>
}

function CraftCategory({ category, items, icons, collections, textControlKeycaps, removeAnimations, showMore: controlledShowMore, onShowMoreChange }: {
  category: SearchCategory
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
  collections: ReadonlyMap<string, RecipeResultCollection> | undefined
  textControlKeycaps: boolean
  removeAnimations: boolean
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
      {visibleCrafts.map((craft) => <CraftDetail key={craft.key} craft={craft} items={items} icons={icons} collections={collections} textControlKeycaps={textControlKeycaps} removeAnimations={removeAnimations} />)}
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

export function CalculatedSearchRow({
  entry,
  entryNumber,
  state,
  items,
  icons,
  collections,
  onRetry,
  summaryLead,
  summaryLabel,
  hidePreviewDecorations = false,
  hideOutcomeScore = false,
  previewMode = 'default',
  hideOverflowingPreviews = false,
  textControlKeycaps = false,
  hideNumberCraftsByDefault = false,
  removeAnimations = false,
  className,
}: CalculatedSearchRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [hasExpanded, setHasExpanded] = useState(false)
  const [isClosingCrafts, setIsClosingCrafts] = useState(false)
  const [isReleasingCraftSpacing, setIsReleasingCraftSpacing] = useState(false)
  const craftSpacingReleaseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [regularView, setRegularView] = useState<'junkless' | 'other'>('junkless')
  const [overlapView, setOverlapView] = useState<'junkless' | 'other'>('junkless')
  const [expandedRegularViews, setExpandedRegularViews] = useState({ junkless: false, other: false })
  const [expandedOverlapViews, setExpandedOverlapViews] = useState({ junkless: false, other: false })
  const [showNumberCrafts, setShowNumberCrafts] = useState(!hideNumberCraftsByDefault)
  const listId = useId()
  const label = summaryLabel ?? `item set ${entryNumber}`
  const rowClassName = `calculated-search-row${className ? ` ${className}` : ''}`
  useEffect(() => () => {
    if (craftSpacingReleaseTimer.current !== undefined) clearTimeout(craftSpacingReleaseTimer.current)
  }, [])
  useEffect(() => {
    setShowNumberCrafts(!hideNumberCraftsByDefault)
  }, [hideNumberCraftsByDefault])
  useEffect(() => {
    if (!removeAnimations) return
    if (craftSpacingReleaseTimer.current !== undefined) clearTimeout(craftSpacingReleaseTimer.current)
    setIsClosingCrafts(false)
    setIsReleasingCraftSpacing(false)
    if (!expanded) setHasExpanded(false)
  }, [expanded, removeAnimations])
  if (!entry.enabled) return null
  if (state === undefined || state.status === 'idle') return <section className={rowClassName} aria-label={`Calculated searches for ${label}`}><span>Waiting for goals</span></section>
  if (state.status === 'pending') return <section className={rowClassName} aria-label={`Calculated searches for ${label}`}><span>Calculating…</span></section>
  if (state.status === 'error') return <section className={rowClassName} aria-label={`Calculated searches for ${label}`}>
    <span>Calculation error</span>
    {onRetry && <button type="button" onClick={onRetry} aria-label={`Retry item set ${entryNumber}`}>Retry</button>}
  </section>
  if (state.outcome.kind === 'no-viable') return <section className={rowClassName} aria-label={`Calculated searches for ${label}`}>
    <div className="calculated-search-row__summary">
      {summaryLead ?? <TargetItems entry={entry} items={items} icons={icons} />}
      <div className="calculated-search-row__status">
        <span>No viable search</span>
        {!hideOutcomeScore && <strong className="metric">{state.outcome.bestScore}</strong>}
      </div>
    </div>
  </section>

  const regular = groupCrafts(removeRedundantItemIdSearches(state.outcome.rankedSearches), 'single')
  const overlap = groupCrafts(state.outcome.rankedSearches, 'overlap')
  const hasNumberCrafts = [...regular, ...overlap].some(usesNumberQuery)
  const displayedRegular = showNumberCrafts ? regular : regular.filter((craft) => !usesNumberQuery(craft))
  const displayedOverlap = orderedOverlapCrafts(showNumberCrafts ? overlap : overlap.filter((craft) => !usesNumberQuery(craft)))
  const previews = previewMode === 'junkless-single'
    ? displayedRegular.filter(isJunkless).slice(0, 3)
    : previewMode === 'junkless-overlap'
    ? displayedOverlap.filter(isJunkless).slice(0, 3)
    : compactPreviews(displayedRegular, displayedOverlap)
  const junklessRegular = displayedRegular.filter((craft) => craftContents(craft).junkItemIds.length === 0)
  const otherRegular = displayedRegular.filter((craft) => craftContents(craft).junkItemIds.length > 0)
  const junklessOverlap = displayedOverlap.filter((craft) => craftContents(craft).junkItemIds.length === 0)
  const otherOverlap = displayedOverlap.filter((craft) => craftContents(craft).junkItemIds.length > 0)
  const visibleRegularView = regularView === 'junkless' && junklessRegular.length === 0 ? 'other' : regularView
  const visibleOverlapView = overlapView === 'junkless' && junklessOverlap.length === 0 ? 'other' : overlapView
  const visibleRegularCrafts = visibleRegularView === 'junkless' ? junklessRegular : otherRegular
  const visibleOverlapCrafts = visibleOverlapView === 'junkless' ? junklessOverlap : otherOverlap
  const hasSingleVisibleCategory = (visibleRegularCrafts.length > 0) !== (visibleOverlapCrafts.length > 0)
  const regularHeaderControl = <div className="overlap-category-toggle" role="group" aria-label="Regular craft category">
    <button
      type="button"
      aria-pressed={visibleRegularView === 'junkless'}
      disabled={junklessRegular.length === 0}
      onClick={() => setRegularView('junkless')}
    >junkless</button>
    <span aria-hidden="true">|</span>
    <button
      type="button"
      aria-pressed={visibleRegularView === 'other'}
      disabled={otherRegular.length === 0}
      onClick={() => setRegularView('other')}
    >other</button>
  </div>
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
    if (expanded) {
      if (removeAnimations) {
        if (craftSpacingReleaseTimer.current !== undefined) clearTimeout(craftSpacingReleaseTimer.current)
        setExpanded(false)
        setHasExpanded(false)
        setIsClosingCrafts(false)
        setIsReleasingCraftSpacing(false)
        return
      }
      setExpanded(false)
      setIsClosingCrafts(true)
      setIsReleasingCraftSpacing(false)
      if (craftSpacingReleaseTimer.current !== undefined) clearTimeout(craftSpacingReleaseTimer.current)
      craftSpacingReleaseTimer.current = setTimeout(() => setIsReleasingCraftSpacing(true), 220)
    } else {
      if (craftSpacingReleaseTimer.current !== undefined) clearTimeout(craftSpacingReleaseTimer.current)
      setIsClosingCrafts(false)
      setIsReleasingCraftSpacing(false)
      setHasExpanded(true)
      setExpanded(true)
    }
  }

  return <section className={rowClassName} aria-label={`Calculated searches for ${label}`}>
    <div className={`calculated-search-row__summary${previews.every((craft) => craft.kind === 'overlap') ? ' calculated-search-row__summary--only-overlap' : ''}`}>
      {summaryLead ?? <TargetItems entry={entry} items={items} icons={icons} />}
      <CraftPreviews
        previews={previews}
        label={label}
        hidePreviewDecorations={hidePreviewDecorations}
        hideOverflowingPreviews={hideOverflowingPreviews}
        textControlKeycaps={textControlKeycaps}
      />
      <button
        type="button"
        className="calculated-search-row__toggle"
        aria-label={`${expanded ? 'Hide' : 'Show all'} crafts for ${label}`}
        aria-controls={listId}
        aria-expanded={expanded}
        onClick={toggleCrafts}
      >
        <ArrowSprite direction={expanded ? 'up' : 'down'} />
      </button>
    </div>
    {hasExpanded && <div
      id={listId}
      className={`craft-categories${expanded ? ' craft-categories--open' : ''}${isClosingCrafts ? ' craft-categories--closing' : ''}${isReleasingCraftSpacing ? ' craft-categories--releasing' : ''}`}
      aria-hidden={!expanded}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && !expanded && event.animationName === 'craft-disclosure-close') {
          if (craftSpacingReleaseTimer.current !== undefined) clearTimeout(craftSpacingReleaseTimer.current)
          setIsClosingCrafts(false)
          setIsReleasingCraftSpacing(false)
        }
      }}
    >
      <div className={`craft-categories__content${hasSingleVisibleCategory ? ' craft-categories__content--single-category' : ''}`}>
      {numberCraftFilter}
      {visibleRegularCrafts.length > 0 && <CraftCategory
        category={{ kind: 'single', name: 'Regular crafts', title: 'regular crafts', headerControl: regularHeaderControl, crafts: visibleRegularCrafts }}
        items={items}
        icons={icons}
        collections={collections}
        textControlKeycaps={textControlKeycaps}
        removeAnimations={removeAnimations}
        showMore={expandedRegularViews[visibleRegularView]}
        onShowMoreChange={(showMore) => setExpandedRegularViews((current) => ({ ...current, [visibleRegularView]: showMore }))}
      />}
      {visibleOverlapCrafts.length > 0 && <CraftCategory
        category={{ kind: 'overlap', name: 'Overlap crafts', title: 'overlap crafts', headerControl: overlapHeaderControl, crafts: visibleOverlapCrafts }}
        items={items}
        icons={icons}
        collections={collections}
        textControlKeycaps={textControlKeycaps}
        removeAnimations={removeAnimations}
        showMore={expandedOverlapViews[visibleOverlapView]}
        onShowMoreChange={(showMore) => setExpandedOverlapViews((current) => ({ ...current, [visibleOverlapView]: showMore }))}
      />}
      </div>
    </div>}
  </section>
}
