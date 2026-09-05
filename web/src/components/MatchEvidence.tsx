import { useId } from 'react'

import type { IconManifest } from '../data/iconManifest'
import type { SearchItem } from '../domain/types'
import type { CollectionMatchExplanation } from '../engine/search'
import { ArrowSprite } from './ArrowSprite'
import { ItemIcon } from './ItemIcon'

interface MatchEvidenceProps {
  explanation: CollectionMatchExplanation
  explanations?: readonly CollectionMatchExplanation[]
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
}

function isValidSpan(line: string, span: CollectionMatchExplanation['matchedSpan']): boolean {
  if (!Number.isInteger(span.start) || !Number.isInteger(span.end)) return false
  if (span.start < 0 || span.end <= span.start || span.end > line.length) return false
  const before = line.charCodeAt(span.start - 1)
  const atStart = line.charCodeAt(span.start)
  const beforeEnd = line.charCodeAt(span.end - 1)
  const atEnd = line.charCodeAt(span.end)
  if (before >= 0xd800 && before <= 0xdbff && atStart >= 0xdc00 && atStart <= 0xdfff) return false
  if (beforeEnd >= 0xd800 && beforeEnd <= 0xdbff && atEnd >= 0xdc00 && atEnd <= 0xdfff) return false
  return line.slice(span.start, span.end) === span.text
}

function uniqueSpans(line: string, explanations: readonly CollectionMatchExplanation[]): CollectionMatchExplanation['matchedSpan'][] {
  const spans = explanations.map(({ matchedSpan }) => matchedSpan).filter((span) => isValidSpan(line, span))
  return [...new Map(spans.map((span) => [`${span.start}:${span.end}:${span.text}`, span])).values()].sort((left, right) => left.start - right.start || left.end - right.end)
}

function HighlightedLine({ line, spans }: { line: string; spans: readonly CollectionMatchExplanation['matchedSpan'][] }) {
  let cursor = 0
  return <>{spans.map((span) => {
    if (span.start < cursor) return null
    const before = line.slice(cursor, span.start)
    cursor = span.end
    return <span key={`${span.start}:${span.end}`}>{before}<mark>{line.slice(span.start, span.end)}</mark></span>
  })}{line.slice(cursor)}</>
}

export function MatchEvidence({ explanation, explanations = [explanation], items: _items, icons }: MatchEvidenceProps) {
  const descriptionId = useId()
  const direct = explanation.matchedMemberItemId === explanation.visibleOutputItemId
  const spans = uniqueSpans(explanation.line, explanations)
  const description = `${explanation.source}: full searchable line ${explanation.line}; matched ${explanation.matchedMemberName}; craftable ${explanation.visibleOutputName}`

  if (spans.length === 0) return <span role="status" className="match-evidence__error">Match evidence unavailable.</span>

  return <span className="match-evidence" aria-describedby={descriptionId} title={description}>
    <span id={descriptionId} hidden>{description}</span>
    {direct
      ? <ItemIcon itemId={explanation.visibleOutputItemId} name={explanation.visibleOutputName} manifest={icons} />
      : <span className="match-evidence__alias" aria-label={`matches craftable ${explanation.matchedMemberName}`}>
        <ItemIcon itemId={explanation.matchedMemberItemId} name={explanation.matchedMemberName} manifest={icons} />
        <ArrowSprite direction="right" />
        <ItemIcon itemId={explanation.visibleOutputItemId} name={explanation.visibleOutputName} manifest={icons} />
      </span>}
    <span><HighlightedLine line={explanation.line} spans={spans} /></span>
  </span>
}
