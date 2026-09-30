import type { RankedSearch } from '../domain/types'
import { normalizeManualCraftQuery } from './manualCraft'
import { normalizeSearchLine, normalizeSearchText } from './search'

const MAX_MATCHES = 48
const MAX_CACHED_QUERIES = 32
const CHUNK_CANDIDATES = 256
const CHUNK_MILLISECONDS = 4

interface CachedMatches {
  matches: RankedSearch[]
  exhaustive: boolean
}

const normalizedCrafts = new WeakMap<RankedSearch, ReturnType<typeof normalizeSearchLine>>()
// Source arrays are immutable ranked results; a different calculation naturally
// gets a different cache, without retaining obsolete language/item contexts.
const queryCaches = new WeakMap<readonly RankedSearch[], Map<string, CachedMatches>>()

function normalizedCraft(search: RankedSearch): ReturnType<typeof normalizeSearchLine> {
  let normalized = normalizedCrafts.get(search)
  if (!normalized) {
    normalized = normalizeSearchLine(search.queries[0] ?? '', true)
    normalizedCrafts.set(search, normalized)
  }
  return normalized
}

/** Return a ranked surplus for the dropdown's final de-duplication to ten rows. */
export function matchingCraftQuerySearches(searches: readonly RankedSearch[], query: string, signal: AbortSignal): Promise<RankedSearch[]> {
  if (signal.aborted) return Promise.reject(new DOMException('Craft query cancelled', 'AbortError'))
  const normalizedQuery = normalizeSearchText(normalizeManualCraftQuery(query))
  if (!normalizedQuery) return Promise.resolve([])

  let cache = queryCaches.get(searches)
  if (!cache) {
    cache = new Map()
    queryCaches.set(searches, cache)
  }
  const cached = cache.get(normalizedQuery)
  if (cached) {
    cache.delete(normalizedQuery)
    cache.set(normalizedQuery, cached)
    return Promise.resolve([...cached.matches])
  }

  let candidates = searches
  let prefixLength = 0
  for (const [prefix, result] of cache) {
    // A truncated bucket may omit lower-ranked results that match the longer
    // query. Only a completed scan can safely replace the original source.
    if (result.exhaustive && prefix.length > prefixLength && normalizedQuery.startsWith(prefix)) {
      candidates = result.matches
      prefixLength = prefix.length
    }
  }
  const queryCache = cache

  return new Promise((resolve, reject) => {
    const matches: RankedSearch[] = []
    let index = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const abort = () => {
      if (timer !== undefined) clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      reject(new DOMException('Craft query cancelled', 'AbortError'))
    }

    const scan = () => {
      if (signal.aborted) {
        abort()
        return
      }
      const started = performance.now()
      let scanned = 0
      while (index < candidates.length && matches.length < MAX_MATCHES) {
        const search = candidates[index++]
        const normalized = normalizedCraft(search)
        const firstCharacterEnd = normalized.originalCharacterStarts[1] ?? normalized.text.length
        if (normalized.candidateStarts.some((start) => start < firstCharacterEnd && normalized.text.startsWith(normalizedQuery, start))) matches.push(search)
        scanned += 1
        if (scanned >= CHUNK_CANDIDATES || performance.now() - started >= CHUNK_MILLISECONDS) break
      }

      if (index === candidates.length || matches.length === MAX_MATCHES) {
        signal.removeEventListener('abort', abort)
        queryCache.set(normalizedQuery, { matches, exhaustive: index === candidates.length })
        if (queryCache.size > MAX_CACHED_QUERIES) queryCache.delete(queryCache.keys().next().value!)
        resolve([...matches])
      } else {
        timer = setTimeout(scan, 0)
      }
    }

    signal.addEventListener('abort', abort, { once: true })
    scan()
  })
}
