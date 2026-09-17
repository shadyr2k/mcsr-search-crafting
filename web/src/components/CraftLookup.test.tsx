import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { CraftLookupLanguageCategory, CraftLookupLanguageState } from '../hooks/useCraftLookupLanguages'

const languageStates = vi.hoisted(() => new Map<string, CraftLookupLanguageState>())

vi.mock('../hooks/useCraftLookupLanguages', () => ({
  useCraftLookupLanguages: () => languageStates,
}))

vi.mock('./CalculatedSearchRow', () => ({
  CalculatedSearchRow: ({ summaryLabel }: { summaryLabel: string }) => <div>{summaryLabel}</div>,
}))

vi.mock('./ItemSetEditor', () => ({
  ItemSetEditor: ({ onSave }: { onSave: (commit: { draft: unknown }) => void }) => <button
    type="button"
    onClick={() => onSave({ draft: { targetIds: ['minecraft:stick'], inventoryItemIds: [], enabled: true, gridSize: 3 } })}
  >Look up crafts</button>,
}))

import { CraftLookup } from './CraftLookup'

afterEach(() => {
  cleanup()
  languageStates.clear()
})

const locales = ['en_us', 'de_de', 'fr_fr', 'es_es', 'it_it', 'pt_br', 'nl_nl', 'pl_pl', 'ru_ru', 'ja_jp', 'ko_kr']
const languages = locales.map((locale, index) => ({ locale, name: `Language ${index + 1}`, region: 'Test', script: 'latin' as const }))

function readyState(): Extract<CraftLookupLanguageState, { status: 'ready' }> {
  return {
    status: 'ready',
    category: 'junkless-single',
    data: {} as never,
    outcome: {
      kind: 'ranked',
      bestScore: 0,
      rankedSearches: [{ kind: 'single', totalJunkAppearances: 0, totalTypedCharacters: 1, queries: ['a'] }],
    } as never,
  }
}

function readyStateFor(category: CraftLookupLanguageCategory): CraftLookupLanguageState {
  return { ...readyState(), category }
}

describe('CraftLookup', () => {
  test('shows one category at a time and disables categories without matching languages', () => {
    locales.forEach((locale, index) => languageStates.set(locale, readyStateFor(index < 6 ? 'junkless-single' : 'requires-junk')))

    render(<CraftLookup
      data={{} as never}
      icons={{} as never}
      session={{
        draft: { targetIds: ['minecraft:stick'], inventoryItemIds: [], enabled: true, gridSize: 3 },
        entry: { id: 'craft-lookup', targetIds: ['minecraft:stick'], inventoryItemIds: [], enabled: true, gridSize: 3, order: 0 },
      }}
      languages={languages}
      enabledBannedLocales={new Set()}
      customSlots={[null, null, null]}
      onSessionChange={vi.fn()}
      onSaveCustomSlot={vi.fn()}
      onClearCustomSlot={vi.fn()}
    />)

    const list = screen.getByRole('list', { name: 'junkless, no overlap languages' })
    expect(list.className).toContain('craft-lookup__language-list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(6)
    expect(screen.queryByRole('button', { name: /Show all|Show first/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'junkless overlap' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'no viable craft' }).hasAttribute('disabled')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'cannot be junkless' }))
    expect(screen.queryByRole('list', { name: 'junkless, no overlap languages' })).toBeNull()
    expect(within(screen.getByRole('list', { name: 'cannot be junkless languages' })).getAllByRole('listitem')).toHaveLength(5)

    fireEvent.change(screen.getByRole('searchbox', { name: 'find a language' }), { target: { value: 'language 7' } })
    expect(within(screen.getByRole('list', { name: 'cannot be junkless languages' })).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText(/found 1 matching language/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'junkless, no overlap' }).hasAttribute('disabled')).toBe(true)
  })
})
