import type { SearchItem } from '../domain/types'
import type { MatchExplanation } from '../engine/search'
import type {
  WorkspaceEntryResult,
  WorkspaceOptimizationProgress,
  WorkspaceResult,
} from '../engine/optimizeWorkspace'

interface ResultPanelProps {
  items: ReadonlyMap<string, SearchItem>
  result?: WorkspaceResult
  pending?: boolean
  progress?: WorkspaceOptimizationProgress
  warning?: string
  error?: string
}

function progressMessage(progress: WorkspaceOptimizationProgress): string {
  const phase = progress.phase === 'matching' ? 'matching candidates' : 'ranking overlap paths'
  const count = progress.total === undefined
    ? `${progress.completed} operations`
    : `${progress.completed} of ${progress.total}`
  return `Calculating target set ${progress.entryIndex + 1} of ${progress.entryCount}: ${phase} (${count})…`
}

function itemLabel(itemId: string, items: ReadonlyMap<string, SearchItem>): string {
  return `${items.get(itemId)?.name ?? itemId} (${itemId})`
}

function itemList(itemIds: readonly string[], items: ReadonlyMap<string, SearchItem>): string {
  return itemIds.length === 0 ? 'none' : itemIds.map((itemId) => itemLabel(itemId, items)).join(', ')
}

function ExactMatch({ explanation }: { explanation: MatchExplanation }) {
  const { line, matchedSpan } = explanation
  const validSpan = Number.isInteger(matchedSpan.start)
    && Number.isInteger(matchedSpan.end)
    && matchedSpan.start >= 0
    && matchedSpan.end > matchedSpan.start
    && matchedSpan.end <= line.length
    && line.slice(matchedSpan.start, matchedSpan.end) === matchedSpan.text

  return <li className="match-explanation">
    <span>{explanation.source} · {explanation.itemId} · span {matchedSpan.start}–{matchedSpan.end}</span>
    {validSpan ? <span className="search-line">
      {line.slice(0, matchedSpan.start)}
      <mark>{line.slice(matchedSpan.start, matchedSpan.end)}</mark>
      {line.slice(matchedSpan.end)}
    </span> : <span className="result-data-error" role="alert">
      Invalid match span for “{line}”.
    </span>}
  </li>
}

function Explanations({ explanations }: { explanations: readonly MatchExplanation[] }) {
  return <ul className="match-explanations">
    {explanations.map((explanation, index) => <ExactMatch
      key={`${explanation.itemId}-${explanation.source}-${explanation.matchedSpan.start}-${index}`}
      explanation={explanation}
    />)}
  </ul>
}

function SingleResults({
  entry,
  entryNumber,
  items,
}: {
  entry: WorkspaceEntryResult
  entryNumber: number
  items: ReadonlyMap<string, SearchItem>
}) {
  const result = entry.single[0]
  const headingId = `single-results-${entry.entryId}`

  return <section className="result-category" aria-labelledby={headingId}>
    <h4 id={headingId}>Single-query results for set {entryNumber}</h4>
    {!result ? <p>No complete single query.</p> : <article className="ranked-result">
      <h5>Best single-query craft</h5>
      <p>Query: <code>{result.query}</code></p>
      <p>Targets: {itemList(result.coveredTargetIds, items)}</p>
      <p>Junk: {itemList(result.junkItemIds, items)}</p>
      <dl className="score-breakdown">
        <div><dt>Length penalty</dt><dd>{result.score.lengthPenalty}</dd></div>
        <div><dt>Junk presence penalty</dt><dd>{result.score.junkPresencePenalty}</dd></div>
        <div><dt>Junk count penalty</dt><dd>{result.score.junkCountPenalty}</dd></div>
        <div><dt>Total score</dt><dd>{result.score.total}</dd></div>
      </dl>
      <h6>Why it matches</h6>
      <Explanations explanations={result.explanations} />
    </article>}
  </section>
}

function OverlapResults({
  entry,
  entryNumber,
  items,
}: {
  entry: WorkspaceEntryResult
  entryNumber: number
  items: ReadonlyMap<string, SearchItem>
}) {
  const result = entry.overlap[0]
  const headingId = `overlap-results-${entry.entryId}`

  return <section className="result-category" aria-labelledby={headingId}>
    <h4 id={headingId}>Overlap results for set {entryNumber}</h4>
    {!result ? <p>No complete overlap sequence.</p> : <article className="ranked-result">
      <h5>Best overlap craft</h5>
      <p>Sequence: {result.steps.map(({ query }) => query).join(' → ')}</p>
      <ol className="result-steps">
        {result.steps.map((step, index) => <li className="result-step" key={`${step.query}-${index}`}>
          <h6>Step {index + 1}: <code>{step.query}</code></h6>
          <p>New targets: {itemList(step.newTargetIds, items)}</p>
          <p>All targets matched at this step: {itemList(step.coveredTargetIds, items)}</p>
          <p>Junk: {itemList(step.junkItemIds, items)}</p>
          <p>Retained prefix: “{step.retainedPrefix}”</p>
          <p>Free backspaces: {step.freeBackspaceCount}</p>
          <p>Typed suffix: “{step.typedSuffix}”</p>
          <Explanations explanations={step.explanations} />
        </li>)}
      </ol>
      <p>Junk appearances charged: {result.totalJunkAppearances}</p>
      <p>Combined junk: {itemList(result.junkItemIds, items)}</p>
      <dl className="score-breakdown">
        <div><dt>Initial length penalty</dt><dd>{result.score.initialLengthPenalty}</dd></div>
        <div><dt>Transition typing penalty</dt><dd>{result.score.transitionTypingPenalty}</dd></div>
        <div><dt>Junk presence penalty</dt><dd>{result.score.junkPresencePenalty}</dd></div>
        <div><dt>Junk count penalty</dt><dd>{result.score.junkCountPenalty}</dd></div>
        <div><dt>Total score</dt><dd>{result.score.total}</dd></div>
      </dl>
    </article>}
  </section>
}

function EntryResults({
  entry,
  entryNumber,
  items,
}: {
  entry: WorkspaceEntryResult
  entryNumber: number
  items: ReadonlyMap<string, SearchItem>
}) {
  return <article className="entry-results">
    <header>
      <h3>Target set {entryNumber}</h3>
      <p>{entry.gridSize}x{entry.gridSize} grid · Score contribution: {entry.bestScore}</p>
    </header>

    {entry.availableCompleteMethod === 'overlap' && entry.single.length === 0
      && <p className="result-promotion">Overlap is the available complete method.</p>}
    {entry.availableCompleteMethod && <p className="result-contribution">
      {entry.availableCompleteMethod === 'single' ? 'Single-query' : 'Overlap'} supplies this set’s aggregate contribution.
    </p>}

    {entry.incomplete ? <section className="incomplete-result" aria-label={`Incomplete result for set ${entryNumber}`}>
      <h4>No complete method is available.</h4>
      <p>Matched targets: {itemList(entry.incomplete.matchedTargetIds, items)}</p>
      <p>Unmatched targets: {itemList(entry.incomplete.unmatchedTargetIds, items)}</p>
      <p>Maximum failure score: {entry.incomplete.score}</p>
    </section> : <>
      <SingleResults entry={entry} entryNumber={entryNumber} items={items} />
      <OverlapResults entry={entry} entryNumber={entryNumber} items={items} />
    </>}
  </article>
}

export function ResultPanel({ items, result, pending = false, progress, warning, error }: ResultPanelProps) {
  return <section className="tool-panel result-panel" aria-labelledby="results-heading">
    <div className="tool-panel__heading">
      <p className="eyebrow">Ranked crafts</p>
      <h2 id="results-heading">Optimization results</h2>
      <p>Enabled target sets are scored independently.</p>
    </div>

    {warning && <p className="app-warning" role="alert">{warning}</p>}
    {error && <p className="app-error" role="alert">{error}</p>}
    {pending && !error && <p className="loading-state">
      {progress ? progressMessage(progress) : 'Calculating optimized crafts…'}
    </p>}
    {!pending && !error && !result && <p className="empty-state">Results will appear when crafting data is ready.</p>}
    {result && <>
      <p className="aggregate-score">Aggregate score: {result.aggregateScore}</p>
      {result.skippedEmptyEntryCount > 0 && <p className="empty-state">
        {result.skippedEmptyEntryCount} enabled empty target set{result.skippedEmptyEntryCount === 1 ? ' is' : 's are'} saved but not scored.
      </p>}
      {result.entries.length === 0
        ? result.skippedEmptyEntryCount === 0
          ? <p className="empty-state">Enable a target set to include it in optimization.</p>
          : null
        : result.entries.map((entry) => <EntryResults
          key={entry.entryId}
          entry={entry}
          entryNumber={entry.displayIndex + 1}
          items={items}
        />)}
    </>}
  </section>
}
