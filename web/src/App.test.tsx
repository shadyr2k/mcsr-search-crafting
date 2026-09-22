import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import App from './App'
import { createItemSetWorkspaceShareCode } from './workspace/itemSetShare'

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
        options: [{ id: 'video_settings', key: 'options.video', english: 'Video Settings' }],
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
          options: { video_settings: { name: 'Video Settings...' } },
          advancements: { acquire_hardware: { name: 'Acquire Hardware', requirement: 'Smelt an iron ingot' } },
        },
        de_de: {
          difficulties: { easy: { name: 'Leicht' } },
          options: { video_settings: { name: 'Videoeinstellungen…' } },
          advancements: { acquire_hardware: { name: 'Beschaffe dir Hardware', requirement: 'Verhütte einen Eisenbarren' } },
        },
        he_il: {
          difficulties: { easy: { name: 'קל' } },
          options: { video_settings: { name: 'הגדרות וידאו...' } },
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
    ])
    expect(within(screen.getByRole('region', { name: 'Language choices' })).getByRole('button', { name: 'english - english (united states)' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByAltText('Stick')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'english (us) search crafts' })).toBeTruthy()
    expect(screen.getByText('optimize recipe book results')).toBeTruthy()
    expect(document.querySelector('.results-column .crafting-sheet__disclosure .arrow-sprite')?.classList.contains('arrow-sprite--right')).toBe(true)
  })

  test('opens the crafting sheet as a sliding page and returns to the crafts', async () => {
    stubData()
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'english (us) search crafts' }))
    expect(document.querySelector('.page-transition')?.classList.contains('page-transition--slide-left')).toBe(true)

    const back = await screen.findByRole('button', { name: 'Back to english (us) crafts' })
    expect(document.querySelector('.crafting-sheet--page')).toBeTruthy()
    expect(document.querySelector('.app-shell')?.classList.contains('app-shell--crafting-sheet')).toBe(true)
    fireEvent.click(back)
    expect(document.querySelector('.page-transition')?.classList.contains('page-transition--slide-right')).toBe(true)

    await screen.findByRole('region', { name: 'Languages' })
    expect(document.querySelector('.results-column')).toBeTruthy()
    expect(document.querySelector('.app-shell')?.classList.contains('app-shell--crafting-sheet')).toBe(false)
  })

  test('switches to dark mode and restores the saved theme', async () => {
    stubData()
    const first = render(<App />)

    fireEvent.click(screen.getByRole('switch', { name: 'Switch to dark mode' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.themeColor).toBe('pink')
    expect(JSON.parse(localStorage.getItem('mcsr.theme-preference.v1') ?? '{}')).toEqual({ schemaVersion: 2, mode: 'dark', color: 'pink' })

    fireEvent.click(await screen.findByRole('button', { name: 'Choose color theme' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Select cyan theme' }))
    expect(document.documentElement.dataset.themeColor).toBe('cyan')
    expect(JSON.parse(localStorage.getItem('mcsr.theme-preference.v1') ?? '{}')).toEqual({ schemaVersion: 2, mode: 'dark', color: 'cyan' })

    fireEvent.click(screen.getByRole('button', { name: 'Choose color theme' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Select plain white / black theme' }))
    expect(document.documentElement.dataset.themeColor).toBe('white')

    first.unmount()
    stubData()
    render(<App />)

    expect(screen.getByRole('switch', { name: 'Switch to light mode' }).getAttribute('aria-checked')).toBe('true')
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
    expect(document.documentElement.dataset.themeColor).toBe('white')
  })

  test('opens a draft editor and persists a new set only after Save', async () => {
    stubData()
    render(<App />)
    await screen.findByRole('button', { name: 'Add item set' })
    fireEvent.click(screen.getByRole('button', { name: 'Add item set' }))
    expect(screen.getAllByRole('region', { name: 'New item set' })).toHaveLength(1)
    expect(document.querySelector('.item-set-editor-overlay')).toBeTruthy()
    expect(JSON.parse(localStorage.getItem(workspaceKey) ?? '{"entries":[]}').entries).toEqual([])
    fireEvent.click(screen.getByRole('searchbox', { name: 'Search Goals' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stick' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save item set' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem(workspaceKey)!).entries).toEqual([
      expect.objectContaining({ targetIds: ['minecraft:stick'], inventoryItemIds: [] }),
    ]))
  })

  test('replaces and persists the entire item-set column from one collection code', async () => {
    localStorage.setItem(workspaceKey, JSON.stringify({
      schemaVersion: 2,
      entries: [{ id: 'old', targetIds: ['minecraft:stick'], inventoryItemIds: [], enabled: true, gridSize: 3, order: 0 }],
    }))
    stubData()
    render(<App />)
    await screen.findByRole('button', { name: 'Add item set' })

    fireEvent.click(screen.getByRole('button', { name: 'share' }))
    const code = createItemSetWorkspaceShareCode([
      { targetIds: ['minecraft:stick'], inventoryItemIds: ['minecraft:bucket'], enabled: false, gridSize: 3, retainCraftOrder: true },
      { targetIds: ['minecraft:stick'], inventoryItemIds: [], enabled: true, gridSize: 3, retainCraftOrder: false },
    ])
    fireEvent.change(screen.getByLabelText('Import item set collection code'), { target: { value: code } })
    fireEvent.click(screen.getByRole('button', { name: 'replace' }))

    await waitFor(() => expect(JSON.parse(localStorage.getItem(workspaceKey)!).entries).toEqual([
      {
        id: 'item-set-1', targetIds: ['minecraft:stick'], inventoryItemIds: ['minecraft:bucket'], enabled: false, gridSize: 3, retainCraftOrder: true, order: 0,
      },
      {
        id: 'item-set-2', targetIds: ['minecraft:stick'], inventoryItemIds: [], enabled: true, gridSize: 3, order: 1,
      },
    ]))
  })

  test('opens craft lookup with its standalone item-set setup menu', async () => {
    stubData()
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'craft lookup' }))

    expect(await screen.findByRole('region', { name: 'lookup setup' })).toBeTruthy()
    expect(screen.getByRole('searchbox', { name: 'Search Goals' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Look up crafts' }) as HTMLButtonElement).disabled).toBe(true)
    expect(document.querySelector('.craft-lookup__empty')?.textContent).toContain('Choose goals and an inventory')

    fireEvent.click(screen.getByRole('searchbox', { name: 'Search Goals' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stick' }))
    fireEvent.click(screen.getByRole('button', { name: 'Look up crafts' }))
    expect(await screen.findByRole('heading', { name: 'best languages' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'no viable craft' })).toBeTruthy()
  })

  test('keeps the Craft Lookup goals while navigating without persisting them after reload', async () => {
    stubData()
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'craft lookup' }))
    await screen.findByRole('region', { name: 'lookup setup' })
    fireEvent.click(screen.getByRole('searchbox', { name: 'Search Goals' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stick' }))
    expect(screen.getByRole('button', { name: 'Remove Stick' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'recipe book sim' }))
    await screen.findByRole('heading', { name: 'recipe book simulator' })
    fireEvent.click(screen.getByRole('button', { name: 'craft lookup' }))

    expect(await screen.findByRole('button', { name: 'Remove Stick' })).toBeTruthy()
    expect(localStorage.getItem('mcsr.craft-lookup.v1')).toBeNull()
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

    const selectedLanguage = await screen.findByRole('region', { name: 'Language choices' })
    expect(within(selectedLanguage).getByRole('button', { name: 'english - english (united states)' }).getAttribute('aria-pressed')).toBe('true')
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
    expect(within(screen.getByRole('region', { name: 'Language choices' })).getByRole('button', { name: 'german - deutsch (deutschland)' }).getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.language-selector')).toBe(sharedLanguageSelector)
    expect(screen.getByText('Leicht')).toBeTruthy()
    expect(screen.getByText('Video Settings')).toBeTruthy()
    expect(screen.queryByText('Video Settings...')).toBeNull()
    expect(screen.getByText('Videoeinstellungen')).toBeTruthy()
    expect(screen.queryByText('Videoeinstellungen…')).toBeNull()
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

  test('replaces site info with page-specific guided help', async () => {
    stubData()
    render(<App />)
    await screen.findByRole('region', { name: 'Languages' })
    expect(screen.queryByRole('button', { name: 'site info' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Help for search crafting' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Item sets' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'next' }))
    expect(await screen.findByRole('heading', { name: 'Edit an item set' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'close tutorial' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'language info' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'language info' }).getAttribute('aria-current')).toBe('page'))
    expect(screen.queryByRole('button', { name: /Help for/ })).toBeNull()
  })
})
