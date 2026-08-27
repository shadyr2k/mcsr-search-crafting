import type { SearchItem } from '../domain/types'

import { normalizeSearchLine } from './search'

const MAX_QUERY_LENGTH = 5

export function candidateQueries(targets: Iterable<SearchItem>, maxLength = MAX_QUERY_LENGTH): string[] {
  const effectiveMaxLength = Math.min(Math.max(0, maxLength), MAX_QUERY_LENGTH)
  const candidates = new Set<string>()

  for (const target of targets) {
    for (const { text } of target.searchLines) {
      const line = normalizeSearchLine(text)
      for (const start of line.originalCharacterStarts) {
        for (let length = 1; length <= effectiveMaxLength && start + length <= line.text.length; length += 1) {
          candidates.add(line.text.slice(start, start + length))
        }
      }
    }
  }

  return [...candidates].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
}
