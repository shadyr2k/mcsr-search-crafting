import { useId, useState } from 'react'

import type { IconManifest } from '../data/iconManifest'
import type { RankedSearch, SearchItem } from '../domain/types'

interface ScoreBreakdownPopoverProps {
  search: RankedSearch
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
}

function scoreText(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1)
}

function stepText(search: RankedSearch): string[] {
  return search.steps.map((step) => {
    const count = step.junkItemIds.length
    const itemLabel = count === 1 ? 'junk item' : 'junk items'
    const controls = [
      step.score.backspacePenalty ? `backspace +${scoreText(step.score.backspacePenalty)}` : undefined,
      step.score.shiftHomePenalty ? `shift home +${scoreText(step.score.shiftHomePenalty)}` : undefined,
    ].filter((value): value is string => value !== undefined)
    return `${step.query}: typing +${scoreText(step.score.typingPenalty)}, junk present +${scoreText(step.score.junkPresencePenalty)}, ${count} ${itemLabel} +${scoreText(step.score.junkCountPenalty)}${controls.length > 0 ? `, ${controls.join(', ')}` : ''}`
  })
}

export function ScoreBreakdownPopover({ search }: ScoreBreakdownPopoverProps) {
  const [pinned, setPinned] = useState(false)
  const [transient, setTransient] = useState(false)
  const popoverId = useId()
  const visible = pinned || transient

  return <span className="score-breakdown">
    <button
      type="button"
      className="metric"
      aria-label={`Score ${scoreText(search.totalScore)}; show calculation`}
      aria-controls={popoverId}
      aria-expanded={visible}
      onPointerEnter={() => setTransient(true)}
      onPointerLeave={() => setTransient(false)}
      onFocus={() => setTransient(true)}
      onBlur={() => setTransient(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setPinned(false)
      }}
      onClick={() => setPinned((current) => !current)}
    >
      {scoreText(search.totalScore)}
    </button>
    {visible && <span id={popoverId} role="tooltip" className="score-breakdown__popover">
      {stepText(search).map((line) => <span key={line}>{line}</span>)}
    </span>}
  </span>
}
