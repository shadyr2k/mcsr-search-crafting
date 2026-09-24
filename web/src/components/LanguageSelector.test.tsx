import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
  test('groups the normal language list into Latin, non-Latin, and banned categories', () => {
    render(<LanguageSelector languages={languages} selectedLocale="en_us" enabledBannedLocales={new Set()} scores={new Map()} onSelect={vi.fn()} onBannedLocaleEnabledChange={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'language list' })).toBeTruthy()
    const choices = screen.getByRole('region', { name: 'Language choices' })
    expect(screen.getByRole('region', { name: 'latin text' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'non-latin text' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'banned' })).toBeTruthy()
    expect(within(choices).getByRole('button', { name: 'english - english (united states)' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(choices).getByRole('button', { name: 'elfdalian - övdalska (swerre)' })).toBeTruthy()
    expect(within(choices).getByRole('button', { name: /ɥs/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sort languages' })).toBeTruthy()
  })

  test('uses the single searchable language list only in compact layout', () => {
    render(<LanguageSelector languages={languages} selectedLocale="en_us" enabledBannedLocales={new Set()} scores={new Map()} compactLayout onSelect={vi.fn()} onBannedLocaleEnabledChange={vi.fn()} />)

    expect(document.querySelector('.language-selector')?.classList.contains('language-selector--compact')).toBe(true)
    expect(screen.queryByRole('region', { name: 'latin text' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Language choices' }).className).toContain('language-selector__dropdown')
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

  test('uses a script qualifier without passing it to Intl as a region', () => {
    const variants = [
      { locale: 'be_by', name: 'Беларуская', region: 'Беларусь', script: 'non_latin' as const },
      { locale: 'be_latn', name: 'Biełaruskaja', region: 'Biełaruś', script: 'latin' as const },
    ]

    expect(englishLocaleName(variants[1], variants)).toBe(`${englishLanguageName(variants[1])} (latn)`)
  })

  test('filters one dropdown with one Unicode-aware language search and ranks ready scores first', () => {
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

    const choices = screen.getByRole('region', { name: 'Language choices' })
    expect(within(choices).getAllByRole('button')[0].getAttribute('aria-label')).toBe('german - deutsch (deutschland)')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search languages' }), { target: { value: 'عرب' } })
    expect(within(choices).getByRole('button', { name: 'arabic - العربية (العالم العربي)' })).toBeTruthy()
    expect(within(choices).queryByRole('button', { name: 'elfdalian - övdalska (swerre)' })).toBeNull()
  })

  test('keeps every matching language in the scrollable dropdown and includes calculated scores', () => {
    const matchingLanguages = Array.from({ length: 6 }, (_, index) => ({
      locale: `zz_${index}`,
      name: `Test ${index}`,
      region: 'Search',
      script: 'latin' as const,
    }))
    render(<LanguageSelector
      languages={matchingLanguages}
      selectedLocale="zz_0"
      enabledBannedLocales={new Set()}
      scores={new Map([['zz_0', { status: 'ready', score: 3 }]])}
      onSelect={vi.fn()}
      onBannedLocaleEnabledChange={vi.fn()}
    />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search languages' }), { target: { value: 'test' } })
    const results = screen.getByRole('region', { name: 'Language choices' })
    expect(within(results).getAllByRole('listitem')).toHaveLength(6)
    expect(within(results).getByText('3')).toBeTruthy()
  })

  test('clears the language search after selecting a language', () => {
    const onSelect = vi.fn()
    render(<LanguageSelector languages={languages} selectedLocale="en_us" enabledBannedLocales={new Set()} scores={new Map()} onSelect={onSelect} onBannedLocaleEnabledChange={vi.fn()} />)

    const search = screen.getByRole('searchbox', { name: 'Search languages' })
    fireEvent.change(search, { target: { value: 'german' } })
    const choices = screen.getByRole('region', { name: 'Language choices' })
    fireEvent.click(within(choices).getByRole('button', { name: 'german - deutsch (deutschland)' }))

    expect(onSelect).toHaveBeenCalledWith('de_de')
    expect((search as HTMLInputElement).value).toBe('')
    expect(within(choices).getByRole('button', { name: 'elfdalian - övdalska (swerre)' })).toBeTruthy()
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

    const choices = screen.getByRole('region', { name: 'Language choices' })
    expect(within(choices).getByText('1').getAttribute('style')).toContain('--language-score-position: 0')
    expect(within(choices).getByText('9').getAttribute('style')).toContain('--language-score-position: 1')
  })

  test('sorts score-tied language crafts by optimal characters or least overall junk', () => {
    render(<LanguageSelector
      languages={languages.slice(0, 3)}
      selectedLocale="en_us"
      enabledBannedLocales={new Set()}
      scores={new Map([
        ['en_us', { status: 'ready', score: 4, optimalCharacterCount: 9, leastJunk: 2 }],
        ['de_de', { status: 'ready', score: 4, optimalCharacterCount: 5, leastJunk: 3 }],
        ['en_ud', { status: 'ready', score: 4, optimalCharacterCount: 7, leastJunk: 1 }],
      ])}
      onSelect={vi.fn()}
      onBannedLocaleEnabledChange={vi.fn()}
    />)

    const choices = screen.getByRole('region', { name: 'Language choices' })
    fireEvent.click(screen.getByRole('button', { name: 'Sort languages' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'fewest characters in optimal score search' }))
    expect(within(choices).getAllByRole('button')[0].getAttribute('aria-label')).toBe('german - deutsch (deutschland)')

    fireEvent.click(screen.getByRole('button', { name: 'Sort languages' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'least overall junk' }))
    expect(within(choices).getAllByRole('button')[0].getAttribute('aria-label')).toMatch(/^upside-down english -/)
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
