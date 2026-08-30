import type { CraftingRecipe, RecipeResultCollection, SearchItem } from '../domain/types'

import { type CollectionMatchExplanation, matchItem } from './search'

function compareExplanations(
  left: CollectionMatchExplanation,
  right: CollectionMatchExplanation,
): number {
  const comparisons = [
    [left.collectionId, right.collectionId],
    [left.visibleOutputItemId, right.visibleOutputItemId],
    [left.matchedMemberItemId, right.matchedMemberItemId],
    [left.source, right.source],
    [left.line, right.line],
    [left.matchedSpan.start, right.matchedSpan.start],
    [left.matchedSpan.end, right.matchedSpan.end],
    [left.matchedSpan.text, right.matchedSpan.text],
  ] as const

  for (const [leftValue, rightValue] of comparisons) {
    if (leftValue < rightValue) return -1
    if (leftValue > rightValue) return 1
  }
  return 0
}

function explanationKey(explanation: CollectionMatchExplanation): string {
  return JSON.stringify(explanation)
}

function getCollection(
  collectionId: string,
  collections: ReadonlyMap<string, RecipeResultCollection>,
): RecipeResultCollection {
  const collection = collections.get(collectionId)
  if (!collection) {
    throw new Error(`recipe collection ${collectionId} is missing`)
  }
  return collection
}

function getItem(
  itemId: string,
  collectionId: string,
  items: ReadonlyMap<string, SearchItem>,
): SearchItem {
  const item = items.get(itemId)
  if (!item) {
    throw new Error(`${collectionId}: references missing item ${itemId}`)
  }
  return item
}

export function matchEligibleCollectionOutputs(
  query: string,
  eligible: readonly CraftingRecipe[],
  collections: ReadonlyMap<string, RecipeResultCollection>,
  items: ReadonlyMap<string, SearchItem>,
): Map<string, CollectionMatchExplanation[]> {
  const eligibleByCollection = new Map<string, CraftingRecipe[]>()
  for (const recipe of eligible) {
    const recipes = eligibleByCollection.get(recipe.resultCollectionId) ?? []
    recipes.push(recipe)
    eligibleByCollection.set(recipe.resultCollectionId, recipes)
  }

  const explanationsByOutput = new Map<string, CollectionMatchExplanation[]>()
  const seenByOutput = new Map<string, Set<string>>()

  for (const collectionId of [...eligibleByCollection.keys()].sort()) {
    const collection = getCollection(collectionId, collections)
    const memberMatches = collection.outputItemIds
      .slice()
      .sort()
      .flatMap((memberItemId) => {
        const member = getItem(memberItemId, collectionId, items)
        return matchItem(member, query).map((match) => ({ member, match }))
      })
    if (memberMatches.length === 0) continue

    const outputIds = [...new Set(eligibleByCollection.get(collectionId)!.map(
      (recipe) => recipe.outputItemId,
    ))].sort()
    for (const outputItemId of outputIds) {
      const visibleOutput = getItem(outputItemId, collectionId, items)
      const explanations = explanationsByOutput.get(outputItemId) ?? []
      const seen = seenByOutput.get(outputItemId) ?? new Set<string>()

      for (const { member, match } of memberMatches) {
        const explanation: CollectionMatchExplanation = {
          query,
          collectionId,
          recipeGroup: collection.recipeGroup,
          matchedMemberItemId: member.id,
          matchedMemberName: member.name,
          visibleOutputItemId: outputItemId,
          visibleOutputName: visibleOutput.name,
          source: match.source,
          line: match.line,
          matchedSpan: match.matchedSpan,
        }
        const key = explanationKey(explanation)
        if (!seen.has(key)) {
          seen.add(key)
          explanations.push(explanation)
        }
      }

      explanationsByOutput.set(outputItemId, explanations)
      seenByOutput.set(outputItemId, seen)
    }
  }

  return new Map([...explanationsByOutput.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([outputId, explanations]) => [outputId, explanations.sort(compareExplanations)]))
}
