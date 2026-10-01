import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { loadLocalizedGeneratedData } from '../data/schema'
import type { GeneratedData, LanguageMetadata } from '../domain/types'
import { KeyboardCharacterPicker, latinSpecialCharacters } from './KeyboardCharacterPicker'

vi.mock('../data/schema', () => ({ loadLocalizedGeneratedData: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const languages: LanguageMetadata[] = [
  { locale: 'en_us', name: 'English', region: 'US', script: 'latin' },
  { locale: 'no_no', name: 'Norsk', region: 'Norge', script: 'latin' },
  { locale: 'ja_jp', name: '日本語', region: '日本', script: 'non_latin' },
]
const baseData = { items: new Map(), inventoryItems: new Map() } as GeneratedData

test('normalizes and deduplicates special Latin characters without including other scripts', () => {
  expect(latinSpecialCharacters(['Æ Ø Å', 'æ e\u0301 é', 'ж 日 ! 123'])).toEqual(['å', 'æ', 'é', 'ø'])
})

test('loads the independently selected language and provides a copyable character row', async () => {
  vi.mocked(loadLocalizedGeneratedData).mockImplementation(async (locale) => locale === 'no_no' ? {
    ...baseData, items: new Map([['test', { id: 'test', name: 'Blå', searchLines: [{ source: 'name', text: 'æøå' }], confidence: 'test' }]]),
  } : baseData)
  const copy = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } })
  render(<KeyboardCharacterPicker languages={languages} baseData={baseData} />)
  await waitFor(() => expect(screen.getByText(/No special Latin/)).toBeTruthy())
  fireEvent.focus(screen.getByRole('combobox', { name: 'Keyboard character language' }))
  fireEvent.click(screen.getByRole('option', { name: /norwegian/i }))
  await waitFor(() => expect((screen.getByLabelText('Copyable special characters') as HTMLInputElement).value).toBe('å æ ø'))
  fireEvent.click(screen.getByRole('button', { name: 'Copy ø' }))
  expect(copy).toHaveBeenCalledWith('ø')
  fireEvent.focus(screen.getByRole('combobox', { name: 'Keyboard character language' }))
  fireEvent.click(screen.getByRole('option', { name: /japanese/i }))
  expect(screen.getByText(/No character list available for non-Latin languages/)).toBeTruthy()
  expect(loadLocalizedGeneratedData).not.toHaveBeenCalledWith('ja_jp', expect.anything(), expect.anything())
})
