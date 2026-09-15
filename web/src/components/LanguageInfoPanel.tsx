import { useEffect, useId, useMemo, useState } from 'react'

import { advancementTooltip } from '../data/advancementTooltips'
import { loadLocalizedLanguageInfo } from '../data/schema'
import type { LocalizedLanguageInfo } from '../domain/types'
import { isRtlLocale } from './LanguageSelector'

const SECTION_TITLES: Readonly<Record<string, string>> = {
  difficulties: 'difficulty',
  options: 'options',
  subtitles: 'subtitles',
  game_modes: 'game modes',
  enchantments: 'enchantments',
  advancements: 'advancements',
}

const SECTION_ORDER = [
  'difficulties',
  'options',
  'subtitles',
  'game_modes',
  'enchantments',
  'advancements',
]

interface LanguageInfoPanelProps {
  locale: string
  languageName: string
}

function displayTranslation(entryId: string, translation: string): string {
  if (entryId !== 'video_settings') return translation
  return translation.replace(/\s*(?:\.\s*){3,}$|\s*…\s*$/u, '')
}

export function LanguageInfoPanel({ locale, languageName }: LanguageInfoPanelProps) {
  const [info, setInfo] = useState<LocalizedLanguageInfo>()
  const [error, setError] = useState<string>()
  const [hoveredAdvancement, setHoveredAdvancement] = useState<string>()
  const tooltipPrefix = useId()

  useEffect(() => {
    let active = true
    loadLocalizedLanguageInfo()
      .then((loadedInfo) => { if (active) setInfo(loadedInfo) })
      .catch(() => { if (active) setError('could not load language information') })
    return () => { active = false }
  }, [])

  const sections = useMemo(() => {
    if (!info) return []
    const ordered = new Map(info.sections.map((section) => [section.id, section]))
    return SECTION_ORDER.flatMap((sectionId) => {
      const section = ordered.get(sectionId)
      return section ? [section] : []
    })
  }, [info])

  const heading = <h2>more language info <span>({languageName})</span></h2>
  if (error) return <section className="language-info-panel" aria-label="More language info">{heading}<p role="alert">{error}</p></section>
  if (!info) return <section className="language-info-panel" aria-label="More language info">{heading}<p>loading language information…</p></section>

  const localizedSections = info.locales.get(locale) ?? info.locales.get('en_us')
  const direction = isRtlLocale(locale) ? 'rtl' : 'ltr'
  const renderedSections = sections.map((section) => {
    const localizedEntries = localizedSections?.get(section.id)
    return <section key={section.id} className="language-info-panel__section" aria-labelledby={`language-info-${section.id}`}>
      <h3 id={`language-info-${section.id}`}>{SECTION_TITLES[section.id] ?? section.id}</h3>
      <dl>
        {section.entries.map((entry) => {
          const localized = localizedEntries?.get(entry.id)
          const translation = displayTranslation(entry.id, localized?.name ?? entry.english)
          const isAdvancement = section.id === 'advancements'
          const tooltipId = `${tooltipPrefix}-${entry.id}`
          const tooltipText = isAdvancement ? advancementTooltip(entry.id, entry.englishRequirement) : undefined
          const tooltipVisible = tooltipText !== undefined && hoveredAdvancement === entry.id
          return <div
            key={entry.id}
            className={`language-info-panel__row${isAdvancement ? ' language-info-panel__row--advancement' : ''}`}
            tabIndex={isAdvancement ? 0 : undefined}
            aria-describedby={tooltipVisible ? tooltipId : undefined}
            onPointerEnter={isAdvancement ? () => setHoveredAdvancement(entry.id) : undefined}
            onPointerLeave={isAdvancement ? () => setHoveredAdvancement(undefined) : undefined}
            onFocus={isAdvancement ? () => setHoveredAdvancement(entry.id) : undefined}
            onBlur={isAdvancement ? () => setHoveredAdvancement(undefined) : undefined}
          >
            <dt>{entry.english}</dt>
            <dd dir={direction}>{translation}</dd>
            {tooltipVisible && <span id={tooltipId} className="language-info-panel__tooltip" role="tooltip">{tooltipText}</span>}
          </div>
        })}
      </dl>
    </section>
  })
  return <section className="language-info-panel" aria-label="More language info">
    {heading}
    <div className="language-info-panel__group language-info-panel__group--overview">{renderedSections.slice(0, 4)}</div>
    <div className="language-info-panel__group language-info-panel__group--reference">{renderedSections.slice(4)}</div>
  </section>
}
