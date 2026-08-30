import type { CraftingRecipe, RecipeResultCollection, SearchItem } from '../domain/types'

import {
  type CollectionMatchExplanation,
  type MatchExplanation,
  matchItem,
} from './search'

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

interface MemberMatch {
  member: SearchItem
  match: MatchExplanation
}

interface MatchAccumulator {
  explanationsByOutput: Map<string, CollectionMatchExplanation[]>
  seenByOutput: Map<string, Set<string>>
}

function groupEligibleRecipes(
  eligible: readonly CraftingRecipe[],
): Map<string, CraftingRecipe[]> {
  const eligibleByCollection = new Map<string, CraftingRecipe[]>()
  for (const recipe of eligible) {
    const recipes = eligibleByCollection.get(recipe.resultCollectionId) ?? []
    recipes.push(recipe)
    eligibleByCollection.set(recipe.resultCollectionId, recipes)
  }
  return eligibleByCollection
}

function matchCollectionMembers(
  query: string,
  collection: RecipeResultCollection,
  items: ReadonlyMap<string, SearchItem>,
): MemberMatch[] {
  return collection.outputItemIds
    .slice()
    .sort()
    .flatMap((memberItemId) => {
      const member = getItem(memberItemId, collection.id, items)
      return matchItem(member, query).map((match) => ({ member, match }))
    })
}

async function matchCollectionMembersCooperatively(
  query: string,
  collection: RecipeResultCollection,
  items: ReadonlyMap<string, SearchItem>,
  checkpointBetweenMembers: () => Promise<void>,
): Promise<MemberMatch[]> {
  const memberItemIds = collection.outputItemIds.slice().sort()
  const memberMatches: MemberMatch[] = []

  for (const [index, memberItemId] of memberItemIds.entries()) {
    const member = getItem(memberItemId, collection.id, items)
    memberMatches.push(...matchItem(member, query).map((match) => ({ member, match })))
    if (index < memberItemIds.length - 1) await checkpointBetweenMembers()
  }

  return memberMatches
}

function addCollectionOutputs(
  query: string,
  collection: RecipeResultCollection,
  eligible: readonly CraftingRecipe[],
  memberMatches: readonly MemberMatch[],
  items: ReadonlyMap<string, SearchItem>,
  accumulator: MatchAccumulator,
): void {
  if (memberMatches.length === 0) return

  const outputIds = [...new Set(eligible.map((recipe) => recipe.outputItemId))].sort()
  for (const outputItemId of outputIds) {
    const visibleOutput = getItem(outputItemId, collection.id, items)
    const explanations = accumulator.explanationsByOutput.get(outputItemId) ?? []
    const seen = accumulator.seenByOutput.get(outputItemId) ?? new Set<string>()

    for (const { member, match } of memberMatches) {
      const explanation: CollectionMatchExplanation = {
        query,
        collectionId: collection.id,
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

    accumulator.explanationsByOutput.set(outputItemId, explanations)
    accumulator.seenByOutput.set(outputItemId, seen)
  }
}

function finishMatches(
  accumulator: MatchAccumulator,
): Map<string, CollectionMatchExplanation[]> {
  return new Map([...accumulator.explanationsByOutput.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([outputId, explanations]) => [outputId, explanations.sort(compareExplanations)]))
}

function matchAccumulator(): MatchAccumulator {
  return {
    explanationsByOutput: new Map<string, CollectionMatchExplanation[]>(),
    seenByOutput: new Map<string, Set<string>>(),
  }
}

export function matchEligibleCollectionOutputs(
  query: string,
  eligible: readonly CraftingRecipe[],
  collections: ReadonlyMap<string, RecipeResultCollection>,
  items: ReadonlyMap<string, SearchItem>,
): Map<string, CollectionMatchExplanation[]> {
  const eligibleByCollection = groupEligibleRecipes(eligible)
  const accumulator = matchAccumulator()

  for (const collectionId of [...eligibleByCollection.keys()].sort()) {
    const collection = getCollection(collectionId, collections)
    addCollectionOutputs(
      query,
      collection,
      eligibleByCollection.get(collectionId)!,
      matchCollectionMembers(query, collection, items),
      items,
      accumulator,
    )
  }

  return finishMatches(accumulator)
}

export async function matchEligibleCollectionOutputsCooperatively(
  query: string,
  eligible: readonly CraftingRecipe[],
  collections: ReadonlyMap<string, RecipeResultCollection>,
  items: ReadonlyMap<string, SearchItem>,
  checkpointBetweenMembers: () => Promise<void>,
): Promise<Map<string, CollectionMatchExplanation[]>> {
  const eligibleByCollection = groupEligibleRecipes(eligible)
  const accumulator = matchAccumulator()

  for (const collectionId of [...eligibleByCollection.keys()].sort()) {
    const collection = getCollection(collectionId, collections)
    addCollectionOutputs(
      query,
      collection,
      eligibleByCollection.get(collectionId)!,
      await matchCollectionMembersCooperatively(
        query,
        collection,
        items,
        checkpointBetweenMembers,
      ),
      items,
      accumulator,
    )
  }

  return finishMatches(accumulator)
}
