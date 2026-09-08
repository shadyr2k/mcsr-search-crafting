import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { englishLanguageName, englishLocaleName, resultsColumnTitle, LanguageSelector } from './LanguageSelector'

const languages = [
  { locale: 'en_us', name: 'English', region: 'United States', script: 'latin' as const },
  { locale: 'de_de', name: 'Deutsch', region: 'Deutschland', script: 'latin' as const },
  { locale: 'en_ud', name: 'ɥsᴉꞁᵷuƎ', region: 'uʍoᗡ ǝpᴉsd∩', script: 'latin' as const },
  { locale: 'ovd', name: 'Övdalska', region: 'Swerre', script: 'latin' as const },
  { locale: 'fr_ca', name: 'Français', region: 'Canada', script: 'latin' as const },
  { locale: 'fr_fr', name: 'Français', region: 'France', script: 'latin' as const },
  { locale: 'he_il', name: 'עברית', region: 'ישראל', script: 'non_latin' as const },
  { locale: 'ar_sa', name: 'العربية', region: 'العالم العربي', script: 'non_latin' as const },
]

afterEach(cleanup)

describe('LanguageSelector', () => {
  test('shows English and Minecraft names in scrollable language categories', () => {
    render(<LanguageSelector languages={languages} selectedLocale="en_us" enabledBannedLocales={new Set()} scores={new Map()} onSelect={vi.fn()} onBannedLocaleEnabledChange={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'language list' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'english - english (united states)' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'elfdalian - övdalska (swerre)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /ɥs/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'show all' })).toBeNull()
  })

  test('uses English dialect names for the results title only when variants exist', () => {
    expect(englishLanguageName(languages[3])).toBe('elfdalian')
    expect(resultsColumnTitle('en_us', languages)).toBe('english (us) search crafts')
    expect(resultsColumnTitle('fr_ca', languages)).toBe('french (canada) search crafts')
    expect(resultsColumnTitle('ovd', languages)).toBe('elfdalian search crafts')
  })

  test('uses explicit Minecraft aliases for locale-specific dialect and novelty packs', () => {
    const specialLocales = [
      ['de_at', 'Austrian German'],
      ['de_ch', 'Swiss German'],
      ['en_pt', 'Pirate Speak'],
      ['en_ud', 'Upside-Down English'],
      ['fra_de', 'East Franconian'],
      ['nl_be', 'Flemish'],
      ['no_no', 'Norwegian Bokmål'],
      ['tl_ph', 'Tagalog'],
    ].map(([locale, expected]) => ({ locale, expected, name: locale, region: 'Minecraft', script: 'latin' as const }))

    specialLocales.forEach((language) => {
      expect(englishLanguageName(language)).toBe(language.expected.toLocaleLowerCase('en-US'))
      expect(englishLocaleName(language, specialLocales)).toBe(language.expected.toLocaleLowerCase('en-US'))
    })
    expect(resultsColumnTitle('fra_de', specialLocales)).toBe('east franconian search crafts')
  })

  test('filters all categories with one Unicode-aware language search and ranks ready scores first', () => {
    render(<LanguageSelector
      languages={languages}
      selectedLocale="en_us"
      enabledBannedLocales={new Set()}
      scores={new Map([
        ['de_de', { status: 'ready', score: 1 }],
        ['en_us', { status: 'ready', score: 3 }],
      ])}
      onSelect={vi.fn()}
      onBannedLocaleEnabledChange={vi.fn()}
    />)

    const latinButtons = screen.getByRole('region', { name: 'latin text' }).getElementsByTagName('button')
    expect(latinButtons[0].getAttribute('aria-label')).toBe('german - deutsch (deutschland)')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search languages' }), { target: { value: 'عرب' } })
    expect(screen.getByRole('button', { name: 'arabic - العربية (العالم العربي)' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'elfdalian - övdalska (swerre)' })).toBeNull()
  })

  test('scales ready language-score colors from the lowest score to the highest score', () => {
    render(<LanguageSelector
      languages={languages}
      selectedLocale="en_us"
      enabledBannedLocales={new Set()}
      scores={new Map([
        ['en_us', { status: 'ready', score: 1 }],
        ['de_de', { status: 'ready', score: 9 }],
      ])}
      onSelect={vi.fn()}
      onBannedLocaleEnabledChange={vi.fn()}
    />)

    expect(screen.getByText('1').getAttribute('style')).toContain('--language-score-position: 0')
    expect(screen.getByText('9').getAttribute('style')).toContain('--language-score-position: 1')
  })

  test('marks RTL locale controls and requires banned languages to be enabled explicitly', () => {
    const enable = vi.fn()
    render(<LanguageSelector languages={languages} selectedLocale="en_us" enabledBannedLocales={new Set()} scores={new Map()} onSelect={vi.fn()} onBannedLocaleEnabledChange={enable} />)

    const hebrewButton = screen.getByRole('button', { name: 'hebrew - עברית (ישראל)' })
    expect(hebrewButton.getAttribute('dir')).toBe('ltr')
    expect(hebrewButton.querySelector('[dir="rtl"]')?.textContent).toBe('עברית (ישראל)')
    const switchControl = screen.getByRole('switch', { name: 'Enable العربية (العالم العربي) for calculation' })
    expect(switchControl.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(switchControl)
    expect(enable).toHaveBeenCalledWith('ar_sa', true)
  })
})
