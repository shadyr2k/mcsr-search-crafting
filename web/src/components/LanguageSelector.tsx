import { useMemo, useState, type CSSProperties, type Ref } from 'react'

import type { LanguageMetadata, LanguageScoreState } from '../domain/types'
import { normalizeSearchText } from '../engine/search'

const BANNED_LOCALES = new Set([
  'ar_sa',
  'fa_ir',
  'ja_jp',
  'ko_kr',
  'lzh',
  'zh_cn',
  'zh_hk',
  'zh_tw',
])

const RTL_LOCALES = new Set(['ar_sa', 'fa_ir', 'he_il', 'yi_de'])

// Minecraft reuses several ordinary-looking locale prefixes for dialect or novelty packs.
// These must take precedence over platform language-code expansion.
const MINECRAFT_LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  de_at: 'Austrian German',
  de_ch: 'Swiss German',
  en_pt: 'Pirate Speak',
  en_ud: 'Upside-Down English',
  fra_de: 'East Franconian',
  nl_be: 'Flemish',
  no_no: 'Norwegian Bokmål',
  tl_ph: 'Tagalog',
  ba: 'Bashkir',
  bar: 'Bavarian',
  brb: 'Brabantian',
  enp: 'Anglish',
  enws: 'Shakespearean English',
  esan: 'Andalusian',
  fur: 'Friulian',
  gv: 'Manx',
  io: 'Ido',
  isv: 'Interslavic',
  jbo: 'Lojban',
  ksh: 'Colognian',
  li: 'Limburgish',
  lol: 'LOLCAT',
  lmo: 'Lombard',
  lzh: 'Classical Chinese',
  nds: 'Low German',
  ovd: 'Elfdalian',
  qya: 'Quenya',
  rpr: 'Pre-Revolutionary Russian',
  se: 'Northern Sami',
  swg: 'Swabian',
  sxu: 'Saxon',
  szl: 'Silesian',
  tlh: 'Klingon',
  tok: 'Toki Pona',
  val: 'Valencian',
  vec: 'Venetian',
}

const englishLanguageNames = new Intl.DisplayNames('en', { type: 'language', fallback: 'code' })
const englishRegionNames = new Intl.DisplayNames('en', { type: 'region', fallback: 'code' })

type LanguageCategory = 'latin' | 'non_latin' | 'banned'

interface LanguageSelectorProps {
  languages: readonly LanguageMetadata[]
  selectedLocale: string
  enabledBannedLocales: ReadonlySet<string>
  scores: ReadonlyMap<string, LanguageScoreState>
  onSelect: (locale: string) => void
  onBannedLocaleEnabledChange: (locale: string, enabled: boolean) => void
  loadingLocale?: string
  containerRef?: Ref<HTMLElement>
}

export function languageDisplayName(language: LanguageMetadata): string {
  const displayName = language.region ? `${language.name} (${language.region})` : language.name
  return displayName.toLocaleLowerCase()
}

function localeParts(locale: string): [string, string | undefined] {
  const [language, region] = locale.split('_', 2)
  return [language, region]
}

export function englishLanguageName(language: LanguageMetadata): string {
  const [code] = localeParts(language.locale)
  const displayName = MINECRAFT_LANGUAGE_ALIASES[language.locale]
    ?? MINECRAFT_LANGUAGE_ALIASES[code]
    ?? englishLanguageNames.of(code)
    ?? code
  return displayName.toLocaleLowerCase('en-US')
}

export function englishLocaleName(language: LanguageMetadata, languages: readonly LanguageMetadata[]): string {
  const [code, region] = localeParts(language.locale)
  if (Object.prototype.hasOwnProperty.call(MINECRAFT_LANGUAGE_ALIASES, language.locale)) {
    return englishLanguageName(language)
  }
  const variants = languages.filter((candidate) => localeParts(candidate.locale)[0] === code)
  if (variants.length < 2 || !region) return englishLanguageName(language)
  const regionName = region.toLowerCase() === 'us'
    ? 'us'
    : (englishRegionNames.of(region.toUpperCase()) ?? region).toLocaleLowerCase('en-US')
  return `${englishLanguageName(language)} (${regionName})`
}

export function resultsColumnTitle(selectedLocale: string, languages: readonly LanguageMetadata[]): string {
  const selectedLanguage = languages.find((language) => language.locale === selectedLocale)
  return `${selectedLanguage ? englishLocaleName(selectedLanguage, languages) : 'english (us)'} search crafts`
}

function scoreText(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1)
}

function scoreRank(score: LanguageScoreState | undefined): number {
  if (score?.status === 'ready') return 0
  if (score?.status === 'pending') return 1
  if (score?.status === 'unavailable') return 2
  return 3
}

function scorePositions(scores: ReadonlyMap<string, LanguageScoreState>): ReadonlyMap<string, number> {
  const readyScores = [...scores.entries()]
    .filter((entry): entry is [string, Extract<LanguageScoreState, { status: 'ready' }>] => entry[1].status === 'ready')
  if (readyScores.length === 0) return new Map()

  const values = readyScores.map(([, score]) => score.score)
  const lowest = Math.min(...values)
  const range = Math.max(...values) - lowest
  return new Map(readyScores.map(([locale, score]) => [locale, range === 0 ? .5 : (score.score - lowest) / range]))
}

function languageMatches(language: LanguageMetadata, query: string): boolean {
  if (!query) return true
  return [englishLanguageName(language), languageDisplayName(language), language.locale]
    .some((value) => normalizeSearchText(value).includes(query))
}

export function isRtlLocale(locale: string): boolean {
  return RTL_LOCALES.has(locale)
}

export function isBannedLocale(locale: string): boolean {
  return BANNED_LOCALES.has(locale)
}

function categoryFor(language: LanguageMetadata): LanguageCategory {
  if (BANNED_LOCALES.has(language.locale)) return 'banned'
  return language.script
}

function categoryTitle(category: LanguageCategory): string {
  if (category === 'latin') return 'latin text'
  if (category === 'non_latin') return 'non-latin text'
  return 'banned'
}

export function LanguageSelector({
  languages,
  selectedLocale,
  enabledBannedLocales,
  scores,
  onSelect,
  onBannedLocaleEnabledChange,
  loadingLocale,
  containerRef,
}: LanguageSelectorProps) {
  const [query, setQuery] = useState('')
  const normalizedQuery = normalizeSearchText(query.trim())
  const scorePositionByLocale = useMemo(() => scorePositions(scores), [scores])
  const categories = useMemo(() => {
    const grouped: Record<LanguageCategory, LanguageMetadata[]> = {
      latin: [],
      non_latin: [],
      banned: [],
    }
    for (const language of languages) grouped[categoryFor(language)].push(language)
    for (const entries of Object.values(grouped)) entries.sort((left, right) => {
      const leftScore = scores.get(left.locale)
      const rightScore = scores.get(right.locale)
      const scoreDifference = scoreRank(leftScore) - scoreRank(rightScore)
      if (scoreDifference !== 0) return scoreDifference
      if (leftScore?.status === 'ready' && rightScore?.status === 'ready' && leftScore.score !== rightScore.score) {
        return leftScore.score - rightScore.score
      }
      return languageDisplayName(left).localeCompare(languageDisplayName(right))
    })
    return grouped
  }, [languages, scores])

  return <section ref={containerRef} className="language-selector" aria-label="Languages">
    <h2 className="language-selector__title">language list</h2>
    <input
      className="language-selector__search"
      type="search"
      aria-label="Search languages"
      placeholder="search languages"
      value={query}
      onChange={(event) => setQuery(event.target.value)}
    />
    {(['latin', 'non_latin', 'banned'] as const).map((category) => {
      const languagesInCategory = categories[category].filter((language) => languageMatches(language, normalizedQuery))
      return <section key={category} className="language-selector__category" aria-label={categoryTitle(category)}>
        <h2>{categoryTitle(category)}</h2>
        <ul>
          {languagesInCategory.map((language) => {
            const displayName = languageDisplayName(language)
            const banned = category === 'banned'
            const enabled = !banned || enabledBannedLocales.has(language.locale)
            const selected = language.locale === selectedLocale
            const score = scores.get(language.locale)
            const scorePosition = scorePositionByLocale.get(language.locale)
            return <li key={language.locale} className="language-selector__language">
              <button
                type="button"
                dir="ltr"
                aria-pressed={selected}
                aria-label={`${englishLanguageName(language)} - ${displayName}`}
                disabled={!enabled || loadingLocale !== undefined}
                onClick={() => onSelect(language.locale)}
              >
                <span>
                  {englishLanguageName(language)} - <span dir={isRtlLocale(language.locale) ? 'rtl' : 'ltr'}>{displayName}</span>
                </span>
                {score?.status === 'ready' && <strong
                  className="language-selector__score"
                  style={{ '--language-score-position': scorePosition } as CSSProperties}
                  aria-hidden="true"
                >{scoreText(score.score)}</strong>}
                {score?.status === 'pending' && <span className="language-selector__score" aria-hidden="true">…</span>}
              </button>
              {banned && <button
                type="button"
                className="language-selector__enable"
                role="switch"
                aria-label={`Enable ${displayName} for calculation`}
                aria-checked={enabled}
                onClick={() => onBannedLocaleEnabledChange(language.locale, !enabled)}
              >
                {enabled ? 'on' : 'off'}
              </button>}
            </li>
          })}
        </ul>
        {languagesInCategory.length === 0 && <p className="language-selector__empty">no matching languages</p>}
      </section>
    })}
  </section>
}
