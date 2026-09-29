import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react'

import type { LanguageMetadata, LanguageScoreState } from '../domain/types'
import { normalizeExactSearchText } from '../engine/search'
import { TapOrScrollButton } from './TapOrScrollButton'

import './LanguageDropdown.css'

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

export type LanguageSortMode = 'score-ascending' | 'score-descending' | 'optimal-characters' | 'least-junk'

interface LanguageSelectorProps {
  languages: readonly LanguageMetadata[]
  selectedLocale: string
  enabledBannedLocales: ReadonlySet<string>
  scores: ReadonlyMap<string, LanguageScoreState>
  onSelect: (locale: string) => void
  onBannedLocaleEnabledChange: (locale: string, enabled: boolean) => void
  loadingLocale?: string
  containerRef?: Ref<HTMLElement>
  compactLayout?: boolean
}

export function languageDisplayName(language: LanguageMetadata): string {
  const displayName = language.region ? `${language.name} (${language.region})` : language.name
  return displayName.toLocaleLowerCase()
}

function localeParts(locale: string): [string, string | undefined] {
  const [language, region] = locale.split('_', 2)
  return [language, region]
}

function isRegionCode(value: string): boolean {
  return /^[a-z]{2}$/i.test(value) || /^\d{3}$/.test(value)
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
    : isRegionCode(region)
      ? (englishRegionNames.of(region.toUpperCase()) ?? region).toLocaleLowerCase('en-US')
      : region.toLocaleLowerCase('en-US')
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
  if (score?.status === 'not-calculated') return 1
  if (score?.status === 'pending') return 2
  if (score?.status === 'unavailable') return 3
  return 4
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
    .some((value) => normalizeExactSearchText(value).includes(query))
}

export function isRtlLocale(locale: string): boolean {
  return RTL_LOCALES.has(locale)
}

export function isBannedLocale(locale: string): boolean {
  return BANNED_LOCALES.has(locale)
}

const sortLabels: Readonly<Record<LanguageSortMode, string>> = {
  'score-ascending': 'score: least to greatest',
  'score-descending': 'score: greatest to least',
  'optimal-characters': 'fewest characters in optimal score search',
  'least-junk': 'least overall junk',
}

function useNarrowLanguageSelector(): boolean {
  const [isNarrow, setIsNarrow] = useState(() => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 72rem)').matches
  ))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const media = window.matchMedia('(max-width: 72rem)')
    const update = () => setIsNarrow(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return isNarrow
}

function comparisonForScore(left: LanguageScoreState | undefined, right: LanguageScoreState | undefined, descending = false): number {
  const stateComparison = scoreRank(left) - scoreRank(right)
  if (stateComparison !== 0) return stateComparison
  if (left?.status !== 'ready' || right?.status !== 'ready') return 0
  return (left.score - right.score) * (descending ? -1 : 1)
}

function comparisonForMetric(
  left: LanguageScoreState | undefined,
  right: LanguageScoreState | undefined,
  metric: 'optimalCharacterCount' | 'leastJunk',
): number {
  const leftMetric = left?.status === 'ready' ? left[metric] : undefined
  const rightMetric = right?.status === 'ready' ? right[metric] : undefined
  const leftRank = leftMetric === undefined ? (left?.status === 'ready' ? 1 : 2 + scoreRank(left)) : 0
  const rightRank = rightMetric === undefined ? (right?.status === 'ready' ? 1 : 2 + scoreRank(right)) : 0
  if (leftRank !== rightRank) return leftRank - rightRank
  if (leftMetric !== undefined && rightMetric !== undefined && leftMetric !== rightMetric) return leftMetric - rightMetric
  return comparisonForScore(left, right)
}

function compareLanguages(left: LanguageMetadata, right: LanguageMetadata, scores: ReadonlyMap<string, LanguageScoreState>, sortMode: LanguageSortMode): number {
  const leftScore = scores.get(left.locale)
  const rightScore = scores.get(right.locale)
  const comparison = sortMode === 'score-descending'
    ? comparisonForScore(leftScore, rightScore, true)
    : sortMode === 'optimal-characters'
      ? comparisonForMetric(leftScore, rightScore, 'optimalCharacterCount')
      : sortMode === 'least-junk'
        ? comparisonForMetric(leftScore, rightScore, 'leastJunk')
        : comparisonForScore(leftScore, rightScore)
  return comparison || languageDisplayName(left).localeCompare(languageDisplayName(right))
}

function LanguageOption({
  language,
  selectedLocale,
  enabledBannedLocales,
  scores,
  scorePositionByLocale,
  loadingLocale,
  onSelect,
  onBannedLocaleEnabledChange,
  compactLayout = false,
  onOptionTouchGestureChange,
}: {
  language: LanguageMetadata
  selectedLocale: string
  enabledBannedLocales: ReadonlySet<string>
  scores: ReadonlyMap<string, LanguageScoreState>
  scorePositionByLocale: ReadonlyMap<string, number>
  loadingLocale?: string
  onSelect: (locale: string) => void
  onBannedLocaleEnabledChange: (locale: string, enabled: boolean) => void
  compactLayout?: boolean
  onOptionTouchGestureChange?: (active: boolean) => void
}) {
  const displayName = languageDisplayName(language)
  const banned = isBannedLocale(language.locale)
  const enabled = !banned || enabledBannedLocales.has(language.locale)
  const selected = language.locale === selectedLocale
  const score = scores.get(language.locale)
  const scorePosition = scorePositionByLocale.get(language.locale)
  return <li className="language-selector__language">
    <TapOrScrollButton
      type="button"
      dir="ltr"
      aria-pressed={selected}
      aria-label={`${englishLanguageName(language)} - ${displayName}`}
      disabled={!enabled || loadingLocale !== undefined}
      onTap={() => onSelect(language.locale)}
      onTouchGestureChange={onOptionTouchGestureChange}
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
      {score?.status === 'not-calculated' && <span className="language-selector__score" title="Waiting for its background score calculation." aria-hidden="true">—</span>}
    </TapOrScrollButton>
    {banned && (compactLayout
      ? <div className="language-selector__enable-options" role="group" aria-label={`Enable ${displayName} for calculation`}>
        <button type="button" aria-pressed={!enabled} onClick={() => onBannedLocaleEnabledChange(language.locale, false)}>off</button>
        <button type="button" aria-pressed={enabled} onClick={() => onBannedLocaleEnabledChange(language.locale, true)}>on</button>
      </div>
      : <button
        type="button"
        className="language-selector__enable"
        role="switch"
        aria-label={`Enable ${displayName} for calculation`}
        aria-checked={enabled}
        onClick={() => onBannedLocaleEnabledChange(language.locale, !enabled)}
      >
        {enabled ? 'on' : 'off'}
      </button>)}
  </li>
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
  compactLayout = false,
}: LanguageSelectorProps) {
  const narrowViewport = useNarrowLanguageSelector()
  const useCompactLayout = compactLayout || narrowViewport
  const [query, setQuery] = useState('')
  const [narrowChoicesOpen, setNarrowChoicesOpen] = useState(false)
  const narrowOptionTouchActiveRef = useRef(false)
  const [sortMode, setSortMode] = useState<LanguageSortMode>('score-ascending')
  const [sortOpen, setSortOpen] = useState(false)
  const normalizedQuery = normalizeExactSearchText(query.trim())
  const scorePositionByLocale = useMemo(() => scorePositions(scores), [scores])
  const visibleLanguages = useMemo(() => languages
    .filter((language) => languageMatches(language, normalizedQuery))
    .sort((left, right) => compareLanguages(left, right, scores, sortMode)), [languages, normalizedQuery, scores, sortMode])
  const categories = useMemo(() => [
    { id: 'latin', title: 'latin text', languages: visibleLanguages.filter((language) => !isBannedLocale(language.locale) && language.script === 'latin') },
    { id: 'non-latin', title: 'non-latin text', languages: visibleLanguages.filter((language) => !isBannedLocale(language.locale) && language.script !== 'latin') },
    { id: 'banned', title: 'banned', languages: visibleLanguages.filter((language) => isBannedLocale(language.locale)) },
  ].filter((category) => category.languages.length > 0), [visibleLanguages])
  const languageOptionProps = {
    selectedLocale,
    enabledBannedLocales,
    scores,
    scorePositionByLocale,
    loadingLocale,
    onSelect: (locale: string) => {
      setQuery('')
      if (narrowViewport) setNarrowChoicesOpen(false)
      onSelect(locale)
    },
    onBannedLocaleEnabledChange,
    compactLayout: useCompactLayout,
    onOptionTouchGestureChange: narrowViewport ? (active: boolean) => { narrowOptionTouchActiveRef.current = active } : undefined,
  }
  const selectedLanguage = languages.find((language) => language.locale === selectedLocale)
  const selectedScore = selectedLanguage === undefined ? undefined : scores.get(selectedLanguage.locale)
  const selectedScorePosition = selectedLanguage === undefined ? undefined : scorePositionByLocale.get(selectedLanguage.locale)
  const selectedSummary = selectedLanguage === undefined ? undefined : <section className="language-selector__selected-language" aria-label="Selected language">
    <span>selected language</span>
    <strong dir="ltr">{englishLanguageName(selectedLanguage)} - <span dir={isRtlLocale(selectedLanguage.locale) ? 'rtl' : 'ltr'}>{languageDisplayName(selectedLanguage)}</span></strong>
    {selectedScore?.status === 'ready' && <b className="language-selector__score" style={{ '--language-score-position': selectedScorePosition } as CSSProperties}>{scoreText(selectedScore.score)}</b>}
    {selectedScore?.status === 'pending' && <b className="language-selector__score">…</b>}
    {selectedScore?.status === 'not-calculated' && <b className="language-selector__score">—</b>}
  </section>

  const toolbar = <div className="language-selector__toolbar">
    <h2 className="language-selector__title">language list</h2>
    <div className="language-selector__sort">
      <button type="button" aria-label="Sort languages" aria-expanded={sortOpen} aria-controls="language-sort-options" onClick={() => setSortOpen((open) => !open)}>sort by</button>
      {sortOpen && <div id="language-sort-options" className="language-selector__sort-options" role="menu" aria-label="Sort languages by">
        {(Object.keys(sortLabels) as LanguageSortMode[]).map((mode) => <button
          key={mode}
          type="button"
          role="menuitemradio"
          aria-checked={sortMode === mode}
          onClick={() => { setSortMode(mode); setSortOpen(false) }}
        >{sortLabels[mode]}</button>)}
      </div>}
    </div>
  </div>
  const search = <input
    className="language-selector__search"
    type="search"
    aria-label="Search languages"
    placeholder="search languages"
    value={query}
    onFocus={() => { if (narrowViewport) setNarrowChoicesOpen(true) }}
    onChange={(event) => setQuery(event.target.value)}
  />

  if (useCompactLayout) return <section ref={containerRef} className={`language-selector language-selector--compact${narrowViewport ? ' language-selector--narrow' : ''}`} aria-label="Languages" onBlur={(event) => {
    if (narrowViewport && !narrowOptionTouchActiveRef.current && !event.currentTarget.contains(event.relatedTarget as Node | null)) setNarrowChoicesOpen(false)
  }}>
    {!narrowViewport && toolbar}
    {selectedSummary}
    {search}
    {(!narrowViewport || narrowChoicesOpen) && <section className="language-selector__dropdown" aria-label="Language choices">
      {visibleLanguages.length > 0
        ? <ul>{visibleLanguages.map((language) => <LanguageOption key={language.locale} language={language} {...languageOptionProps} />)}</ul>
        : <p className="language-selector__empty">no matching languages</p>}
    </section>}
  </section>

  return <section ref={containerRef} className="language-selector" aria-label="Languages">
    {toolbar}
    {selectedSummary}
    {search}
    <div className="language-selector__categories" role="region" aria-label="Language choices">
      {categories.length > 0
        ? categories.map((category) => <section key={category.id} className="language-selector__category" aria-label={category.title}>
          <h2>{category.title}</h2>
          <ul>{category.languages.map((language) => <LanguageOption key={language.locale} language={language} {...languageOptionProps} />)}</ul>
        </section>)
        : <p className="language-selector__empty">no matching languages</p>}
    </div>
  </section>
}

/** A compact searchable picker for places that need one language at a time. */
export function LanguageDropdown({
  languages,
  selectedLocale,
  label,
  onSelect,
  renderAccessory,
}: {
  languages: readonly LanguageMetadata[]
  selectedLocale: string
  label: string
  onSelect: (locale: string) => void
  renderAccessory?: (language: LanguageMetadata) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const normalizedQuery = normalizeExactSearchText(query.trim())
  const visibleLanguages = useMemo(() => languages.filter((language) => languageMatches(language, normalizedQuery)), [languages, normalizedQuery])
  const selectedLanguage = languages.find((language) => language.locale === selectedLocale)
  const selectedLabel = selectedLanguage ? `${englishLocaleName(selectedLanguage, languages)} - ${languageDisplayName(selectedLanguage)}` : selectedLocale

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
      setQuery('')
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [open])

  return <div ref={rootRef} className="language-dropdown">
    <div className="language-dropdown__field">
      <input
        type="search"
        className="language-dropdown__input"
        role="combobox"
        aria-label={label}
        aria-controls={listId}
        aria-expanded={open}
        aria-autocomplete="list"
        placeholder="search languages"
        value={open ? query : selectedLabel}
        onFocus={() => {
          if (open) return
          setQuery('')
          setOpen(true)
        }}
        onChange={(event) => {
          if (!open) setOpen(true)
          setQuery(event.target.value)
        }}
      />
      {selectedLanguage && renderAccessory?.(selectedLanguage)}
    </div>
    {open && <section className="language-dropdown__menu" aria-label={`${label} choices`}>
      {visibleLanguages.length > 0
        ? <ul id={listId} role="listbox" aria-label={`${label} choices`}>{visibleLanguages.map((language) => <li key={language.locale}>
          <TapOrScrollButton type="button" role="option" aria-selected={language.locale === selectedLocale} dir="ltr" onTap={() => { onSelect(language.locale); setOpen(false); setQuery('') }}>
            <span className="language-dropdown__option-label">{englishLanguageName(language)} - <span dir={isRtlLocale(language.locale) ? 'rtl' : 'ltr'}>{languageDisplayName(language)}</span></span>
            {renderAccessory?.(language)}
          </TapOrScrollButton>
        </li>)}</ul>
        : <p className="language-dropdown__empty">no matching languages</p>}
    </section>}
  </div>
}
