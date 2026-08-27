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

export interface NormalizedSearchLine {
  text: string
  originalStarts: number[]
  originalEnds: number[]
  originalCharacterStarts: number[]
}

const MAX_QUERY_LENGTH = 5

export function normalizeSearchText(text: string): string {
  return text.toLocaleLowerCase('en-US')
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

function isSupportedQuery(query: string): boolean {
  return query.length >= 1 && query.length <= MAX_QUERY_LENGTH
}

export function matchItem(item: SearchItem, query: string): MatchExplanation[] {
  if (!isSupportedQuery(query)) return []

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
