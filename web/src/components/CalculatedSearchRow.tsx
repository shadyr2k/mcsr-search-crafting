import { useId, useState } from 'react'

import type { IconManifest } from '../data/iconManifest'
import type { RankedSearch, RowOptimizationState, SearchItem, TargetWorkspaceEntry } from '../domain/types'
import { searchSequenceLabel } from '../engine/rankedSearch'
import { ItemIcon } from './ItemIcon'
import { MatchEvidence } from './MatchEvidence'
import { ScoreBreakdownPopover } from './ScoreBreakdownPopover'

interface CalculatedSearchRowProps {
  entry: TargetWorkspaceEntry
  entryNumber: number
  state: RowOptimizationState | undefined
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
  onRetry?: () => void
}

function SearchDetail({ search, rank, items, icons }: {
  search: RankedSearch
  rank: number
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
}) {
  return <li aria-label={`Rank ${rank}`}>
    <span>{searchSequenceLabel(search)}</span>
    <ScoreBreakdownPopover search={search} items={items} icons={icons} />
    <span className="calculated-search-row__icons">
      {search.coveredTargetIds.map((itemId) => {
        const item = items.get(itemId)
        return <ItemIcon key={itemId} itemId={itemId} name={item?.name ?? itemId} manifest={icons} />
      })}
      {search.steps.flatMap((step) => step.junkItemIds).map((itemId, index) => {
        const item = items.get(itemId)
        return <ItemIcon key={`${itemId}-${index}`} itemId={itemId} name={item?.name ?? itemId} manifest={icons} />
      })}
    </span>
    {search.steps.flatMap((step) => step.explanations).slice(0, 1).map((explanation) => <MatchEvidence
      key={`${explanation.collectionId}-${explanation.visibleOutputItemId}-${explanation.line}`}
      explanation={explanation}
      items={items}
      icons={icons}
    />)}
  </li>
}

export function CalculatedSearchRow({ entry, entryNumber, state, items, icons, onRetry }: CalculatedSearchRowProps) {
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
    <div className="calculated-search-row__status">
    <span>No viable search</span>
    <strong className="metric">{state.outcome.bestScore}</strong>
    </div>
  </section>

  const searches = state.outcome.rankedSearches
  const visibleSearches = searches.slice(0, expanded ? 10 : 3)
  const summary = searches.slice(0, 3).map(searchSequenceLabel).join(', ')
  return <section className="calculated-search-row" aria-label={`Calculated searches for ${label}`}>
    <p>{summary}</p>
    <button
      type="button"
      aria-label={`${expanded ? 'Hide' : 'Show'} searches for item set ${entryNumber}`}
      aria-controls={listId}
      aria-expanded={expanded}
      onClick={() => setExpanded((current) => !current)}
    >
      {expanded ? 'Show fewer' : 'Show searches'}
    </button>
    <ol id={listId}>{visibleSearches.map((search, index) => <SearchDetail
      key={`${search.kind}:${search.queries.join('\u0000')}`}
      search={search}
      rank={index + 1}
      items={items}
      icons={icons}
    />)}</ol>
  </section>
}
