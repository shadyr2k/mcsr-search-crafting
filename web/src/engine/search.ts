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

const MAX_QUERY_LENGTH = 5

export function normalizeSearchText(text: string): string {
  return text.toLocaleLowerCase('en-US')
}

function isSupportedQuery(query: string): boolean {
  return query.length >= 1 && query.length <= MAX_QUERY_LENGTH
}

export function matchItem(item: SearchItem, query: string): MatchExplanation[] {
  if (!isSupportedQuery(query)) return []

  const normalizedQuery = normalizeSearchText(query)
  const matches: MatchExplanation[] = []

  for (const { source, text: line } of item.searchLines) {
    const normalizedLine = normalizeSearchText(line)
    let searchStart = 0

    while (searchStart < normalizedLine.length) {
      const start = normalizedLine.indexOf(normalizedQuery, searchStart)
      if (start === -1) break

      const end = start + normalizedQuery.length
      matches.push({
        itemId: item.id,
        source,
        line,
        matchedSpan: { start, end, text: line.slice(start, end) },
      })
      searchStart = start + 1
    }
  }

  return matches
}
