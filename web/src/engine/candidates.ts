import type { CraftingRecipe, RecipeResultCollection, SearchItem } from '../domain/types'

import { MAX_ITEM_ID_QUERY_LENGTH, normalizeSearchLine, type SearchOptions } from './search'

const MAX_QUERY_LENGTH = 5

function resourcePath(itemId: string): string {
  const separator = itemId.indexOf(':')
  return separator === -1 ? itemId : itemId.slice(separator + 1)
}

/**
 * Keep generated crafts in the language's own spelling. Keyboard aliases are
 * only for matching a runner's input; they must not replace æ, ð, accents,
 * or other localized letters in the craft that we display.
 */
function searchCharacters(text: string): string[] {
  const characters: string[] = []
  for (let start = 0; start < text.length;) {
    const codePoint = text.codePointAt(start)
    let end = start + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1)
    while (end < text.length) {
      const nextCodePoint = text.codePointAt(end)
      const nextEnd = end + (nextCodePoint !== undefined && nextCodePoint > 0xffff ? 2 : 1)
      if (!/^\p{M}$/u.test(text.slice(end, nextEnd))) break
      end = nextEnd
    }
    characters.push(text.slice(start, end).toLowerCase())
    start = end
  }
  return characters
}

function addLocalizedCandidates(candidates: Set<string>, text: string, maxLength: number): void {
  const characters = searchCharacters(text)
  for (let start = 0; start < characters.length; start += 1) {
    let query = ''
    for (let length = 1; length <= maxLength && start + length <= characters.length; length += 1) {
      query += characters[start + length - 1]
      candidates.add(query)
    }
  }
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
      addLocalizedCandidates(candidates, text, effectiveMaxLength)
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
        const localizedCandidates = new Set<string>()
        addLocalizedCandidates(localizedCandidates, text, effectiveMaxLength)
        localizedCandidates.forEach((query) => candidates.add(`:${query}`))
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
