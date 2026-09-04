import { useId } from 'react'

import type { IconManifest } from '../data/iconManifest'
import type { SearchItem } from '../domain/types'
import type { CollectionMatchExplanation } from '../engine/search'
import { ItemIcon } from './ItemIcon'

interface MatchEvidenceProps {
  explanation: CollectionMatchExplanation
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

export function MatchEvidence({ explanation, items: _items, icons }: MatchEvidenceProps) {
  const descriptionId = useId()
  const direct = explanation.matchedMemberItemId === explanation.visibleOutputItemId
  const validSpan = isValidSpan(explanation.line, explanation.matchedSpan)
  const description = `${explanation.source}: full searchable line ${explanation.line}; matched ${explanation.matchedMemberName}; craftable ${explanation.visibleOutputName}`

  if (!validSpan) return <span role="status" className="match-evidence__error">Match evidence unavailable.</span>

  const { start, end } = explanation.matchedSpan
  return <span className="match-evidence" aria-describedby={descriptionId} title={description}>
    <span id={descriptionId} hidden>{description}</span>
    {direct
      ? <ItemIcon itemId={explanation.visibleOutputItemId} name={explanation.visibleOutputName} manifest={icons} />
      : <span aria-label={`matches craftable ${explanation.matchedMemberName}`}>
        <ItemIcon itemId={explanation.matchedMemberItemId} name={explanation.matchedMemberName} manifest={icons} />
        <span aria-hidden="true">→</span>
        <ItemIcon itemId={explanation.visibleOutputItemId} name={explanation.visibleOutputName} manifest={icons} />
      </span>}
    <span>
      {explanation.line.slice(0, start)}<mark>{explanation.line.slice(start, end)}</mark>{explanation.line.slice(end)}
    </span>
  </span>
}
