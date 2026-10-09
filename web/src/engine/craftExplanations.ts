import type { CraftingRecipe, RankedSearch, RecipeResultCollection, SearchItem, TargetWorkspaceEntry } from '../domain/types'
import { matchEligibleCollectionOutputs } from './collectionSearch'
import { eligibleRecipes } from './craftability'
import type { CollectionMatchExplanation } from './search'

export type CraftExplanationResolver = (step: RankedSearch['steps'][number]) => CollectionMatchExplanation[]

/** Rebuild omitted cache evidence only for queries the user opens. */
export function createCraftExplanationResolver(
  items: ReadonlyMap<string, SearchItem>,
  recipes: readonly CraftingRecipe[],
  collections: ReadonlyMap<string, RecipeResultCollection>,
  entry: TargetWorkspaceEntry,
  itemIdSearch: boolean,
): CraftExplanationResolver {
  let eligible: CraftingRecipe[] | undefined
  const matchesByQuery = new Map<string, Map<string, CollectionMatchExplanation[]>>()
  return (step) => {
    if (step.explanations.length > 0) return step.explanations
    if (!eligible) {
      const targets = new Set(entry.targetIds)
      eligible = eligibleRecipes(recipes, new Set(entry.inventoryItemIds), entry.gridSize)
        .filter((recipe) => targets.has(recipe.outputItemId))
    }
    let matches = matchesByQuery.get(step.query)
    if (!matches) {
      // Match the full query, including any prefix retained by an overlap craft.
      matches = matchEligibleCollectionOutputs(step.query, eligible, collections, items, { itemIdSearch })
      matchesByQuery.set(step.query, matches)
    }
    return step.coveredTargetIds.flatMap((id) => matches.get(id) ?? [])
  }
}
