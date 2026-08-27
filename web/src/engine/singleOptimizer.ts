import type { SearchItem } from '../domain/types'

import { candidateQueries } from './candidates'
import { type MatchExplanation, matchItem } from './search'
import { type ScoreBreakdown, scoreStep } from './scoring'

export interface OptimizeInput {
  targetIds: ReadonlySet<string>
  visibleItemIds: ReadonlySet<string>
  items: ReadonlyMap<string, SearchItem>
}

export interface SingleResult {
  query: string
  coveredTargetIds: string[]
  junkItemIds: string[]
  explanations: MatchExplanation[]
  score: ScoreBreakdown
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function optimizeSingle(input: OptimizeInput): SingleResult[] {
  const targetIds = [...input.targetIds].sort(compareText)
  const targetIdSet = new Set(targetIds)
  const targetItems = targetIds
    .map((targetId) => input.items.get(targetId))
    .filter((target): target is SearchItem => target !== undefined)
  const visibleItemIds = [...input.visibleItemIds].sort(compareText)
  const results: SingleResult[] = []

  for (const query of candidateQueries(targetItems)) {
    const matchedItemIds = new Set<string>()
    const explanations: MatchExplanation[] = []

    for (const itemId of visibleItemIds) {
      const item = input.items.get(itemId)
      if (item === undefined) continue

      const itemExplanations = matchItem(item, query)
      if (itemExplanations.length === 0) continue

      matchedItemIds.add(itemId)
      explanations.push(...itemExplanations)
    }

    const coveredTargetIds = targetIds.filter((targetId) => matchedItemIds.has(targetId))
    if (coveredTargetIds.length !== targetIds.length) continue

    const junkItemIds = [...matchedItemIds]
      .filter((itemId) => !targetIdSet.has(itemId))
      .sort(compareText)

    results.push({
      query,
      coveredTargetIds,
      junkItemIds,
      explanations,
      score: scoreStep(query.length, junkItemIds.length),
    })
  }

  return results.sort((left, right) =>
    left.score.total - right.score.total
    || left.junkItemIds.length - right.junkItemIds.length
    || left.query.length - right.query.length
    || compareText(left.query, right.query),
  )
}
