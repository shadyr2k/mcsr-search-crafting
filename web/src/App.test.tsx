import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import App from './App'

const workspaceKey = 'mcsr.target-workspace.v1'

function stubData(icons: Record<string, string> = { 'minecraft:stick': 'minecraft/stick.png', 'minecraft:bucket': 'minecraft/bucket.png' }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => {
    if (url.includes('manifest')) return { schema_version: 1, minecraft_version: '1.16.1', icon_width: 16, icon_height: 16, icons }
    if (url.includes('language-metadata')) return {
      schema_version: 1,
      minecraft_version: '1.16.1',
      locales: {
        en_us: { name: 'English', region: 'United States', script: 'latin' },
        de_de: { name: 'Deutsch', region: 'Deutschland', script: 'latin' },
        en_ud: { name: 'ɥsᴉꞁᵷuƎ', region: 'uʍoᗡ ǝpᴉsd∩', script: 'latin' },
        he_il: { name: 'עברית', region: 'ישראל', script: 'non_latin' },
        ar_sa: { name: 'العربية', region: 'العالم العربي', script: 'non_latin' },
      },
    }
    if (url.includes('localized-search-data')) return {
      schema_version: 1,
      minecraft_version: '1.16.1',
      locales: {
        de_de: {
          search_items: { 'minecraft:stick': { name: 'Stock', confidence: 'exact', search_lines: [{ source: 'name', text: 'Stock' }] } },
          inventory_items: { 'minecraft:bucket': { name: 'Eimer' } },
        },
        he_il: {
          search_items: { 'minecraft:stick': { name: 'מקל', confidence: 'exact', search_lines: [{ source: 'name', text: 'מקל' }] } },
          inventory_items: { 'minecraft:bucket': { name: 'דלי' } },
        },
      },
    }
    if (url.includes('localized-language-info')) return {
      schema_version: 1,
      minecraft_version: '1.16.1',
      sections: {
        difficulties: [{ id: 'easy', key: 'options.difficulty.easy', english: 'Easy' }],
        advancements: [{
          id: 'acquire_hardware',
          key: 'advancements.story.smelt_iron.title',
          english: 'Acquire Hardware',
          requirement_key: 'advancements.story.smelt_iron.description',
          english_requirement: 'Minecraft requirement text should not be displayed',
        }],
      },
      locales: {
        en_us: {
          difficulties: { easy: { name: 'Easy' } },
          advancements: { acquire_hardware: { name: 'Acquire Hardware', requirement: 'Smelt an iron ingot' } },
        },
        de_de: {
          difficulties: { easy: { name: 'Leicht' } },
          advancements: { acquire_hardware: { name: 'Beschaffe dir Hardware', requirement: 'Verhütte einen Eisenbarren' } },
        },
        he_il: {
          difficulties: { easy: { name: 'קל' } },
          advancements: { acquire_hardware: { name: 'השג חומרה', requirement: 'התך מטיל ברזל' } },
        },
      },
    }
    if (url.includes('search-items')) return { schema_version: 3, items: { 'minecraft:stick': { name: 'Stick', confidence: 'exact', search_lines: [{ source: 'name', text: 'Stick' }] } } }
    if (url.includes('inventory-items')) return { schema_version: 3, items: { 'minecraft:bucket': { name: 'Bucket' } } }
    if (url.includes('inventory-presets')) return { schema_version: 3, presets: [] }
    if (url.includes('crafting-recipes')) return { schema_version: 3, recipes: [] }
    return { schema_version: 3, collections: [] }
  } })))
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

describe('App workspace composition', () => {
  test('defaults to en_us and places item sets before the language column', async () => {
    localStorage.setItem(workspaceKey, JSON.stringify({
      schemaVersion: 2,
      entries: [{ id: 'saved', targetIds: ['minecraft:stick'], inventoryItemIds: [], enabled: true, gridSize: 3, order: 0 }],
    }))
    stubData()
    render(<App />)
    await screen.findByRole('region', { name: 'Languages' })

    expect([...document.querySelector('.workspace-grid')!.children].map((element) => element.className)).toEqual([
      'item-set-workspace',
      'language-selector',
      'results-column',
      'language-info-panel',
      'site-info-panel',
    ])
    expect(screen.getByRole('button', { name: 'english - english (united states)' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByAltText('Stick')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'english (us) search crafts' })).toBeTruthy()
    expect(screen.getByText('optimize recipe book results')).toBeTruthy()
  })

  test('switches to dark mode and restores the saved theme', async () => {
    stubData()
    const first = render(<App />)

    fireEvent.click(screen.getByRole('switch', { name: 'Switch to dark mode' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.themeColor).toBe('pink')
    expect(JSON.parse(localStorage.getItem('mcsr.theme-preference.v1') ?? '{}')).toEqual({ schemaVersion: 2, mode: 'dark', color: 'pink' })

    fireEvent.click(await screen.findByRole('button', { name: 'Choose color theme' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Select green theme' }))
    expect(document.documentElement.dataset.themeColor).toBe('green')
    expect(JSON.parse(localStorage.getItem('mcsr.theme-preference.v1') ?? '{}')).toEqual({ schemaVersion: 2, mode: 'dark', color: 'green' })

    first.unmount()
    stubData()
    render(<App />)

    expect(screen.getByRole('switch', { name: 'Switch to light mode' }).getAttribute('aria-checked')).toBe('true')
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
    expect(document.documentElement.dataset.themeColor).toBe('green')
  })

  test('opens a draft editor and persists a new set only after Save', async () => {
    stubData()
    render(<App />)
    await screen.findByRole('button', { name: 'Add item set' })
    fireEvent.click(screen.getByRole('button', { name: 'Add item set' }))
    expect(screen.getAllByRole('region', { name: 'New item set' })).toHaveLength(1)
    expect(document.querySelector('.item-set-workspace__editor-overlay')).toBeTruthy()
    expect(JSON.parse(localStorage.getItem(workspaceKey) ?? '{"entries":[]}').entries).toEqual([])
    fireEvent.click(screen.getByRole('searchbox', { name: 'Search Goals' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stick' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save item set' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem(workspaceKey)!).entries).toEqual([
      expect.objectContaining({ targetIds: ['minecraft:stick'], inventoryItemIds: [] }),
    ]))
  })

  test('reports an icon manifest coverage error as blocking', async () => {
    stubData({})
    render(<App />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/icon manifest/i)
  })

  test('saves an edited inventory without persisting the draft-only source entry ID', async () => {
    localStorage.setItem(workspaceKey, JSON.stringify({
      schemaVersion: 2,
      entries: [{
        id: 'saved', targetIds: ['minecraft:stick'], inventoryItemIds: [], enabled: true, gridSize: 3, order: 0,
      }],
    }))
    stubData()
    render(<App />)
    await screen.findByRole('button', { name: 'Edit item set 1' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit item set 1' }))
    fireEvent.click(screen.getByRole('searchbox', { name: 'Search Inventory' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bucket' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save item set' }))

    await waitFor(() => expect(JSON.parse(localStorage.getItem(workspaceKey)!).entries).toEqual([
      expect.objectContaining({ id: 'saved', inventoryItemIds: ['minecraft:bucket'] }),
    ]))
    expect(JSON.parse(localStorage.getItem(workspaceKey)!).entries[0]).not.toHaveProperty('sourceEntryId')
    expect(screen.getByRole('region', { name: 'Calculated searches' })).toBeTruthy()
  })

  test('switches result data to a non-English locale while item pickers remain English', async () => {
    localStorage.setItem(workspaceKey, JSON.stringify({
      schemaVersion: 2,
      entries: [{ id: 'saved', targetIds: ['minecraft:stick'], inventoryItemIds: [], enabled: true, gridSize: 3, order: 0 }],
    }))
    stubData()
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'german - deutsch (deutschland)' }))

    expect((await screen.findAllByAltText('Stock')).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'german search crafts' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit item set 1' }))
    expect(screen.getByRole('button', { name: 'Remove Stick' })).toBeTruthy()
    fireEvent.click(screen.getByRole('searchbox', { name: 'Search Inventory' }))
    expect(screen.getByRole('button', { name: 'Bucket' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Eimer' })).toBeNull()
  })

  test('persists a selected locale across reinitialization', async () => {
    localStorage.setItem(workspaceKey, JSON.stringify({
      schemaVersion: 2,
      entries: [{ id: 'saved', targetIds: ['minecraft:stick'], inventoryItemIds: [], enabled: true, gridSize: 3, order: 0 }],
    }))
    stubData()
    const first = render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'german - deutsch (deutschland)' }))
    await screen.findAllByAltText('Stock')
    first.unmount()
    vi.unstubAllGlobals()
    stubData()
    render(<App />)

    expect((await screen.findAllByAltText('Stock')).length).toBeGreaterThan(0)
  })

  test('falls back to en_us for an invalid saved locale', async () => {
    localStorage.setItem('mcsr.language-preferences.v1', JSON.stringify({
      schemaVersion: 1,
      selectedLocale: 'missing_locale',
      enabledBannedLocales: [],
    }))
    stubData()
    render(<App />)

    expect((await screen.findByRole('button', { name: 'english - english (united states)' })).getAttribute('aria-pressed')).toBe('true')
  })

  test('applies RTL direction to Minecraft-derived workspace content', async () => {
    localStorage.setItem(workspaceKey, JSON.stringify({
      schemaVersion: 2,
      entries: [{ id: 'saved', targetIds: ['minecraft:stick'], inventoryItemIds: [], enabled: true, gridSize: 3, order: 0 }],
    }))
    localStorage.setItem('mcsr.language-preferences.v1', JSON.stringify({
      schemaVersion: 1,
      selectedLocale: 'he_il',
      enabledBannedLocales: [],
    }))
    stubData()
    render(<App />)

    expect(await screen.findByAltText('מקל')).toBeTruthy()
    expect(document.querySelector('.item-set-workspace')?.getAttribute('dir')).toBe('rtl')
    expect(document.querySelector('.results-column')?.getAttribute('dir')).toBe('rtl')
  })

  test('shares the selected locale with the more language info page and shows advancement requirements on hover', async () => {
    stubData()
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'german - deutsch (deutschland)' }))
    await screen.findByRole('heading', { name: 'german search crafts' })
    const sharedLanguageSelector = document.querySelector('.language-selector')
    fireEvent.click(screen.getByRole('button', { name: 'language info' }))

    expect(await screen.findByRole('heading', { name: 'more language info (german)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'german - deutsch (deutschland)' }).getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.language-selector')).toBe(sharedLanguageSelector)
    expect(screen.getByText('Leicht')).toBeTruthy()
    fireEvent.pointerEnter(screen.getByText('Beschaffe dir Hardware').closest('.language-info-panel__row')!)
    expect((await screen.findByRole('tooltip')).textContent).toBe('obtain iron')
    expect(document.querySelector('.language-info-panel')).toBeTruthy()
  })

  test('uses RTL direction for translations without mirroring the language-info layout', async () => {
    stubData()
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'hebrew - עברית (ישראל)' }))
    await screen.findByRole('heading', { name: 'hebrew search crafts' })
    fireEvent.click(screen.getByRole('button', { name: 'language info' }))

    expect((await screen.findByText('קל')).getAttribute('dir')).toBe('rtl')
    expect(document.querySelector('.workspace-transition')?.getAttribute('dir')).toBeNull()
  })

  test('opens the site-info draft from the main navigation', async () => {
    stubData()
    render(<App />)
    await screen.findByRole('region', { name: 'Languages' })
    fireEvent.click(screen.getByRole('button', { name: 'site info' }))

    expect(screen.getByRole('heading', { name: 'site info' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'regular and overlap crafts' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'craft order' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'site info' }).getAttribute('aria-current')).toBe('page')
  })
})
