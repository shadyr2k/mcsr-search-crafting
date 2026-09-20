import type { SearchItem } from '../domain/types'

export interface MatchExplanation {
  itemId: string
  source: string
  line: string
  matchedSpan: {
    start: number
    end: number
    text: string
  }
}

export interface CollectionMatchExplanation {
  query: string
  collectionId: string
  recipeGroup: string | null
  matchedMemberItemId: string
  matchedMemberName: string
  visibleOutputItemId: string
  visibleOutputName: string
  source: string
  line: string
  matchedSpan: {
    start: number
    end: number
    text: string
  }
}

export interface NormalizedSearchLine {
  text: string
  originalStarts: number[]
  originalEnds: number[]
  originalCharacterStarts: number[]
}

const MAX_QUERY_LENGTH = 5
export const MAX_ITEM_ID_QUERY_LENGTH = 6

export interface SearchOptions {
  itemIdSearch?: boolean
}

export function normalizeSearchText(text: string): string {
  return text.toLowerCase()
}

export function normalizeSearchLine(line: string): NormalizedSearchLine {
  const originalStarts: number[] = []
  const originalEnds: number[] = []
  const originalCharacterStarts: number[] = []
  let normalizedOffset = 0

  for (let originalStart = 0; originalStart < line.length;) {
    const codePoint = line.codePointAt(originalStart)
    const originalEnd = originalStart + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1)
    const normalizedCharacter = normalizeSearchText(line.slice(originalStart, originalEnd))

    originalCharacterStarts.push(normalizedOffset)
    for (let offset = 0; offset < normalizedCharacter.length; offset += 1) {
      originalStarts.push(originalStart)
      originalEnds.push(originalEnd)
    }
    normalizedOffset += normalizedCharacter.length
    originalStart = originalEnd
  }

  return {
    text: normalizeSearchText(line),
    originalStarts,
    originalEnds,
    originalCharacterStarts,
  }
}

function isSupportedQuery(query: string, options: SearchOptions): boolean {
  const characterCount = Array.from(query).length
  if (options.itemIdSearch && query.startsWith(':')) {
    return characterCount >= 2 && characterCount <= MAX_ITEM_ID_QUERY_LENGTH
  }
  return characterCount >= 1 && characterCount <= MAX_QUERY_LENGTH
}

function resourcePath(itemId: string): string {
  const separator = itemId.indexOf(':')
  return separator === -1 ? itemId : itemId.slice(separator + 1)
}

export function matchesItemId(item: SearchItem, query: string): boolean {
  if (!query.startsWith(':') || query.length === 1) return false
  return normalizeSearchText(resourcePath(item.id)).includes(normalizeSearchText(query.slice(1)))
}

export function matchItem(item: SearchItem, query: string, options: SearchOptions = {}): MatchExplanation[] {
  if (!isSupportedQuery(query, options)) return []

  if (options.itemIdSearch && query.startsWith(':')) {
    const normalizedQuery = normalizeSearchText(query.slice(1))
    const line = resourcePath(item.id)
    const start = normalizeSearchText(line).indexOf(normalizedQuery)
    const matches: MatchExplanation[] = start === -1 ? [] : [{
      itemId: item.id,
      source: 'item_id',
      line,
      matchedSpan: {
        start,
        end: start + normalizedQuery.length,
        text: line.slice(start, start + normalizedQuery.length),
      },
    }]
    for (const match of matchItem(item, query.slice(1))) matches.push(match)
    return matches
  }

  const normalizedQuery = normalizeSearchText(query)
  const matches: MatchExplanation[] = []

  for (const { source, text: line } of item.searchLines) {
    const normalizedLine = normalizeSearchLine(line)
    let searchStart = 0

    while (searchStart < normalizedLine.text.length) {
      const start = normalizedLine.text.indexOf(normalizedQuery, searchStart)
      if (start === -1) break

      const normalizedEnd = start + normalizedQuery.length
      const originalStart = normalizedLine.originalStarts[start]
      const originalEnd = normalizedLine.originalEnds[normalizedEnd - 1]
      matches.push({
        itemId: item.id,
        source,
        line,
        matchedSpan: {
          start: originalStart,
          end: originalEnd,
          text: line.slice(originalStart, originalEnd),
        },
      })
      searchStart = start + 1
    }
  }

  return matches
}
