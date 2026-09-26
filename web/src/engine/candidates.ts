import type { CraftingRecipe, RecipeResultCollection, SearchItem } from '../domain/types'

import { MAX_ITEM_ID_QUERY_LENGTH, normalizeSearchLine, type SearchOptions } from './search'

const MAX_QUERY_LENGTH = 5

function resourcePath(itemId: string): string {
  const separator = itemId.indexOf(':')
  return separator === -1 ? itemId : itemId.slice(separator + 1)
}

export function candidateQueries(
  targets: Iterable<SearchItem>,
  maxLength = MAX_QUERY_LENGTH,
  options: SearchOptions = {},
): string[] {
  const effectiveMaxLength = Math.min(Math.max(0, maxLength), MAX_QUERY_LENGTH)
  const candidates = new Set<string>()

  for (const target of targets) {
    for (const { text } of target.searchLines) {
      const line = normalizeSearchLine(text)
      for (const start of line.candidateStarts) {
        for (let length = 1; length <= effectiveMaxLength && start + length <= line.text.length; length += 1) {
          candidates.add(line.text.slice(start, start + length))
        }
      }
    }
    if (options.itemIdSearch) {
      const path = normalizeSearchLine(resourcePath(target.id))
      const idMaxLength = Math.min(MAX_ITEM_ID_QUERY_LENGTH - 1, path.text.length)
      for (const start of path.candidateStarts) {
        for (let length = 1; length <= idMaxLength && start + length <= path.text.length; length += 1) {
          candidates.add(`:${path.text.slice(start, start + length)}`)
        }
      }
      for (const { text } of target.searchLines) {
        const line = normalizeSearchLine(text)
        for (const start of line.candidateStarts) {
          for (let length = 1; length <= effectiveMaxLength && start + length <= line.text.length; length += 1) {
            candidates.add(`:${line.text.slice(start, start + length)}`)
          }
        }
      }
    }
  }

  return [...candidates].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
}

export function candidateQueriesForTargets(
  targetIds: ReadonlySet<string>,
  recipes: readonly CraftingRecipe[],
  collections: ReadonlyMap<string, RecipeResultCollection>,
  items: ReadonlyMap<string, SearchItem>,
  maxLength = MAX_QUERY_LENGTH,
  options: SearchOptions = {},
): string[] {
  const targetCollections = new Set<string>()
  for (const recipe of recipes) {
    if (targetIds.has(recipe.outputItemId)) {
      targetCollections.add(recipe.resultCollectionId)
    }
  }

  const memberItems: SearchItem[] = []
  for (const collectionId of [...targetCollections].sort()) {
    const collection = collections.get(collectionId)
    if (!collection) {
      throw new Error(`recipe collection ${collectionId} is missing`)
    }
    for (const itemId of collection.outputItemIds) {
      const item = items.get(itemId)
      if (!item) {
        throw new Error(`${collectionId}: references missing item ${itemId}`)
      }
      memberItems.push(item)
    }
  }

  return candidateQueries(memberItems, maxLength, options)
}
