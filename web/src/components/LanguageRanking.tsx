import type { aggregateEnglishScore } from '../engine/optimizeWorkspace'

interface LanguageRankingProps {
  aggregate: ReturnType<typeof aggregateEnglishScore>
}

function scoreText(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1)
}

export function LanguageRanking({ aggregate }: LanguageRankingProps) {
  if (aggregate.status === 'blank') return null
  return <section className="language-ranking" aria-label="Language ranking">
    <span>English</span>
    {aggregate.status === 'ready'
      ? <strong className="metric">{scoreText(aggregate.score)}</strong>
      : aggregate.status === 'pending'
        ? <span aria-label="English score calculating">Calculating…</span>
        : <span>Score unavailable</span>}
  </section>
}
