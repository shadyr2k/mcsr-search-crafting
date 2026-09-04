import { Fragment, useId, useState } from 'react'

import type { IconManifest } from '../data/iconManifest'
import type { RankedSearch, RankedSearchStep, RowOptimizationState, SearchItem, TargetWorkspaceEntry } from '../domain/types'
import { ItemIcon } from './ItemIcon'

interface CalculatedSearchRowProps {
  entry: TargetWorkspaceEntry
  entryNumber: number
  state: RowOptimizationState | undefined
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
  onRetry?: () => void
}

interface SearchCategory {
  kind: RankedSearch['kind']
  name: string
  searches: RankedSearch[]
}

function categoryName(kind: RankedSearch['kind']): string {
  return kind === 'single' ? 'Regular' : 'Overlap'
}

function searchDescription(search: RankedSearch): string {
  return search.steps.map((step, index) => index === 0
    ? step.query
    : `${step.freeBackspaceCount} backspaces, ${step.query}`).join(', ')
}

function SearchQuery({ search }: { search: RankedSearch }) {
  return <span className="craft-query" aria-label={searchDescription(search)}>
    {search.steps.map((step, index) => <Fragment key={`${step.query}-${index}`}>
      {index > 0 && (step.freeBackspaceCount > 0
        ? <span className="craft-query__backspaces" aria-label={`${step.freeBackspaceCount} backspaces`}>
          {Array.from({ length: step.freeBackspaceCount }, (_, arrowIndex) => <span key={arrowIndex} aria-hidden="true">↞</span>)}
        </span>
        : <span className="craft-query__advance" aria-hidden="true">⟶</span>)}
      <span className="craft-query__term">{step.query}</span>
    </Fragment>)}
  </span>
}

function StepMatches({ step, items, icons }: {
  step: RankedSearchStep
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
}) {
  return <span className="craft-result__step" aria-label={`Matches for ${step.query}`}>
    <span className="craft-result__targets">
      {step.coveredTargetIds.map((itemId) => {
        const item = items.get(itemId)
        return <ItemIcon key={itemId} itemId={itemId} name={item?.name ?? itemId} manifest={icons} />
      })}
    </span>
    {step.junkItemIds.length > 0 && <>
      <span className="craft-result__separator" aria-label="with junk">✦</span>
      <span className="craft-result__junk" aria-label={`Junk for ${step.query}`}>
        {step.junkItemIds.map((itemId, index) => {
          const item = items.get(itemId)
          return <ItemIcon key={`${itemId}-${index}`} itemId={itemId} name={item?.name ?? itemId} manifest={icons} />
        })}
      </span>
    </>}
  </span>
}

function CraftDetail({ search, items, icons }: {
  search: RankedSearch
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
}) {
  return <li className="craft-result" aria-label={`${categoryName(search.kind)} craft: ${searchDescription(search)}`}>
    <SearchQuery search={search} />
    <span className="craft-result__matches">
      {search.steps.map((step, index) => <StepMatches key={`${step.query}-${index}`} step={step} items={items} icons={icons} />)}
    </span>
  </li>
}

function compactPreviews(regular: readonly RankedSearch[], overlap: readonly RankedSearch[]): RankedSearch[] {
  if (regular.length > 0 && overlap.length > 0) return [regular[0], overlap[0]]
  return (regular.length > 0 ? regular : overlap).slice(0, 2)
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

export function CalculatedSearchRow({ entry, entryNumber, state, items, icons, onRetry }: CalculatedSearchRowProps) {
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  const label = `item set ${entryNumber}`
  if (!entry.enabled) return <section className="calculated-search-row" aria-label={`Calculated searches for ${label}`}><span>Disabled</span></section>
  if (state === undefined || state.status === 'idle') return <section className="calculated-search-row" aria-label={`Calculated searches for ${label}`}><span>Waiting for goals</span></section>
  if (state.status === 'pending') return <section className="calculated-search-row" aria-label={`Calculated searches for ${label}`}><span>Calculating…</span></section>
  if (state.status === 'error') return <section className="calculated-search-row" aria-label={`Calculated searches for ${label}`}>
    <span>Calculation error</span>
    {onRetry && <button type="button" onClick={() => onRetry()} aria-label={`Retry item set ${entryNumber}`}>Retry</button>}
  </section>
  if (state.outcome.kind === 'no-viable') return <section className="calculated-search-row" aria-label={`Calculated searches for ${label}`}>
    <TargetItems entry={entry} items={items} icons={icons} />
    <div className="calculated-search-row__status">
      <span>No viable search</span>
      <strong className="metric">{state.outcome.bestScore}</strong>
    </div>
  </section>

  const regular = state.outcome.rankedSearches.filter((search) => search.kind === 'single')
  const overlap = state.outcome.rankedSearches.filter((search) => search.kind === 'overlap')
  const categories: SearchCategory[] = [
    { kind: 'single', name: 'Regular crafts', searches: regular },
    { kind: 'overlap', name: 'Overlap crafts', searches: overlap },
  ]
  const availableCategories = categories.filter((category) => category.searches.length > 0)
  const previews = compactPreviews(regular, overlap)

  return <section className="calculated-search-row" aria-label={`Calculated searches for ${label}`}>
    <div className="calculated-search-row__summary">
      <TargetItems entry={entry} items={items} icons={icons} />
      <ul className="craft-previews" aria-label={`Craft previews for ${label}`}>
        {previews.map((search) => <li key={`${search.kind}:${search.queries.join('\u0000')}`} aria-label={`${categoryName(search.kind)} craft: ${searchDescription(search)}`}>
          <span className={`craft-kind craft-kind--${search.kind}`}>{categoryName(search.kind)}</span>
          <SearchQuery search={search} />
        </li>)}
      </ul>
      <button
        type="button"
        aria-label={`${expanded ? 'Hide' : 'Show all'} crafts for item set ${entryNumber}`}
        aria-controls={listId}
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        {expanded ? 'Hide crafts' : 'Show crafts'}
      </button>
    </div>
    {expanded && <div id={listId} className="craft-categories">
      {availableCategories.map((category) => <section key={category.kind} className="craft-category" aria-label={category.name}>
        <h3>{category.name}</h3>
        <ol>
          {category.searches.map((search) => <CraftDetail key={`${search.kind}:${search.queries.join('\u0000')}`} search={search} items={items} icons={icons} />)}
        </ol>
      </section>)}
    </div>}
  </section>
}
