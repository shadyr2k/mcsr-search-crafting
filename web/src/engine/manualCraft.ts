import type { GeneratedData, RankedSearch, TargetWorkspaceEntry } from '../domain/types'

import { eligibleRecipes } from './craftability'
import { matchEligibleCollectionOutputs } from './collectionSearch'
import { rankedFromSingle } from './rankedSearch'
import { scoreStep, type ScoringSettings } from './scoring'

/**
 * The sheet displays spaces as underscores. Keep that convenient text form
 * for ordinary searches, without changing underscores in Minecraft item IDs.
 */
export function normalizeManualCraftQuery(value: string): string {
  const query = value.trim()
  return query.startsWith(':') ? query : query.replaceAll('_', ' ')
}

/**
 * Validate exactly one runner-supplied query for one requested item. This
 * checks the same eligible recipe-book results as the optimizer, but does not
 * enumerate any alternative queries.
 */
export function validateManualItemCraft(
  data: GeneratedData,
  entry: TargetWorkspaceEntry,
  itemId: string,
  value: string,
  scoringSettings: ScoringSettings,
  itemIdSearch: boolean,
): RankedSearch | undefined {
  const query = normalizeManualCraftQuery(value)
  if (query.length === 0 || !entry.targetIds.includes(itemId)) return undefined

  const eligible = eligibleRecipes(data.recipes, new Set(entry.inventoryItemIds), entry.gridSize)
  const matches = matchEligibleCollectionOutputs(query, eligible, data.collections, data.items, { itemIdSearch })
  const explanations = matches.get(itemId)
  if (explanations === undefined) return undefined

  const targets = new Set(entry.targetIds)
  const junkItemIds = [...matches.keys()].filter((candidate) => !targets.has(candidate)).sort()
  return rankedFromSingle({
    query,
    coveredTargetIds: [itemId],
    junkItemIds,
    explanations,
    score: scoreStep(query.length, junkItemIds.length, scoringSettings),
  }, scoringSettings)
}
