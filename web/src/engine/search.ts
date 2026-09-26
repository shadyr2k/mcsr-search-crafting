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
  /** Every typeable ASCII alternative, including aliases inside ligatures. */
  candidateStarts: number[]
}

const MAX_QUERY_LENGTH = 5
export const MAX_ITEM_ID_QUERY_LENGTH = 6

export interface SearchOptions {
  itemIdSearch?: boolean
}

/**
 * Minecraft accepts the localized spelling, but runners with a US keyboard
 * often cannot enter its Latin letters directly. Keep those inputs practical
 * by using a deterministic ASCII spelling for matching and candidate search.
 *
 * Expanding a letter preserves every useful single-key alternative. For
 * example, æ becomes ae so a, e, and ae all match; ð becomes dth so d, t, h,
 * and their consecutive combinations all remain usable estimates.
 */
const LATIN_KEYBOARD_ALIASES: Readonly<Record<string, string>> = {
  'æ': 'ae',
  'ǽ': 'ae',
  'œ': 'oe',
  'ß': 'ss',
  'ẞ': 'ss',
  'ð': 'dth',
  'þ': 'th',
  'đ': 'd',
  'ħ': 'h',
  'ı': 'i',
  'ĸ': 'k',
  'ł': 'l',
  'ŋ': 'ng',
  'ŉ': 'n',
  'ø': 'o',
  'ŧ': 't',
  'ſ': 's',
  'ƒ': 'f',
  'ĳ': 'ij',
}

function isCombiningMark(character: string): boolean {
  return /^\p{M}$/u.test(character)
}

function isAsciiLetter(character: string): boolean {
  return /^[a-z]$/i.test(character)
}

function keyboardFold(text: string): string {
  let folded = ''
  for (let start = 0; start < text.length;) {
    const codePoint = text.codePointAt(start)
    let end = start + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1)
    while (end < text.length) {
      const nextCodePoint = text.codePointAt(end)
      const nextEnd = end + (nextCodePoint !== undefined && nextCodePoint > 0xffff ? 2 : 1)
      if (!isCombiningMark(text.slice(end, nextEnd))) break
      end = nextEnd
    }
    const character = text.slice(start, end)
    const alias = LATIN_KEYBOARD_ALIASES[character] ?? LATIN_KEYBOARD_ALIASES[character.toLowerCase()]
    if (alias !== undefined) folded += alias
    else {
      const decomposed = character.normalize('NFD')
      const withoutMarks = decomposed.replace(/\p{M}/gu, '')
      // Only strip marks from Latin letters. Other scripts retain their native
      // matching behavior, including meaningful combining marks.
      folded += Array.from(withoutMarks).length > 0 && Array.from(withoutMarks).every(isAsciiLetter)
        ? withoutMarks
        : decomposed
    }
    start = end
  }
  return folded
}

export function normalizeSearchText(text: string): string {
  return keyboardFold(text).toLowerCase()
}

/** Minecraft's recipe-book simulator keeps the game's literal text matching. */
export function normalizeExactSearchText(text: string): string {
  return text.toLowerCase()
}

export function normalizeSearchLine(line: string): NormalizedSearchLine {
  const originalStarts: number[] = []
  const originalEnds: number[] = []
  const originalCharacterStarts: number[] = []
  const candidateStarts: number[] = []
  let normalizedOffset = 0

  for (let originalStart = 0; originalStart < line.length;) {
    const codePoint = line.codePointAt(originalStart)
    let originalEnd = originalStart + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1)
    while (originalEnd < line.length) {
      const nextCodePoint = line.codePointAt(originalEnd)
      const nextEnd = originalEnd + (nextCodePoint !== undefined && nextCodePoint > 0xffff ? 2 : 1)
      if (!isCombiningMark(line.slice(originalEnd, nextEnd))) break
      originalEnd = nextEnd
    }
    const normalizedCharacter = normalizeSearchText(line.slice(originalStart, originalEnd))

    originalCharacterStarts.push(normalizedOffset)
    if (normalizedCharacter.length > 0) candidateStarts.push(normalizedOffset)
    for (let offset = 0; offset < normalizedCharacter.length; offset += 1) {
      originalStarts.push(originalStart)
      originalEnds.push(originalEnd)
      if (offset > 0 && isAsciiLetter(normalizedCharacter[offset])) candidateStarts.push(normalizedOffset + offset)
    }
    normalizedOffset += normalizedCharacter.length
    originalStart = originalEnd
  }

  return {
    text: normalizeSearchText(line),
    originalStarts,
    originalEnds,
    originalCharacterStarts,
    candidateStarts,
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

export function matchesExactItemId(item: SearchItem, query: string): boolean {
  if (!query.startsWith(':') || query.length === 1) return false
  return normalizeExactSearchText(resourcePath(item.id)).includes(normalizeExactSearchText(query.slice(1)))
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
