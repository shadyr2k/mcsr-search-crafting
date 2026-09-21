import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { IconManifest } from '../data/iconManifest'
import type { GeneratedData } from '../domain/types'
import { RecipeBookSim } from './RecipeBookSim'

const icons: IconManifest = {
  schemaVersion: 1,
  minecraftVersion: '1.16.1',
  width: 16,
  height: 16,
  icons: new Map(),
}

const data: GeneratedData = {
  schemaVersion: 3,
  items: new Map([
    ['minecraft:oak_planks', { id: 'minecraft:oak_planks', name: 'Oak Planks', confidence: 'exact', searchLines: [{ source: 'name', text: 'Oak Planks' }] }],
    ['minecraft:stick', { id: 'minecraft:stick', name: 'Stick', confidence: 'exact', searchLines: [{ source: 'name', text: 'Stick' }] }],
    ['minecraft:iron_sword', { id: 'minecraft:iron_sword', name: 'Iron Sword', confidence: 'exact', searchLines: [{ source: 'name', text: 'Iron Sword' }] }],
  ]),
  inventoryItems: new Map([
    ['minecraft:oak_log', { id: 'minecraft:oak_log', name: 'Oak Log' }],
    ['minecraft:iron_ingot', { id: 'minecraft:iron_ingot', name: 'Iron Ingot' }],
  ]),
  recipes: [
    { id: 'minecraft:oak_planks', recipeGroup: null, recipeBookCategory: 'crafting_building_blocks', resultCollectionId: 'oak_planks', outputItemId: 'minecraft:oak_planks', outputCount: 4, ingredientSlots: [{ acceptedItems: ['minecraft:oak_log'] }], fits2x2: true, fits3x3: false },
    { id: 'minecraft:stick', recipeGroup: null, recipeBookCategory: 'crafting_misc', resultCollectionId: 'stick', outputItemId: 'minecraft:stick', outputCount: 4, ingredientSlots: [{ acceptedItems: ['minecraft:oak_log'] }], fits2x2: true, fits3x3: false },
    { id: 'minecraft:iron_sword', recipeGroup: null, recipeBookCategory: 'crafting_equipment', resultCollectionId: 'iron_sword', outputItemId: 'minecraft:iron_sword', outputCount: 1, ingredientSlots: [{ acceptedItems: ['minecraft:iron_ingot'] }], fits2x2: false, fits3x3: true },
  ],
  collections: new Map([
    ['oak_planks', { id: 'oak_planks', recipeBookCategory: 'crafting_building_blocks', recipeGroup: null, recipeIds: ['minecraft:oak_planks'], outputItemIds: ['minecraft:oak_planks'] }],
    ['stick', { id: 'stick', recipeBookCategory: 'crafting_misc', recipeGroup: null, recipeIds: ['minecraft:stick'], outputItemIds: ['minecraft:stick'] }],
    ['iron_sword', { id: 'iron_sword', recipeBookCategory: 'crafting_equipment', recipeGroup: null, recipeIds: ['minecraft:iron_sword'], outputItemIds: ['minecraft:iron_sword'] }],
  ]),
  presets: new Map([['overworld', { id: 'overworld', name: 'Overworld', itemIds: ['minecraft:oak_log', 'minecraft:iron_ingot'] }]]),
}

const languages = [
  { locale: 'en_us', name: 'English', region: 'United States', script: 'latin' as const },
  { locale: 'fr_fr', name: 'Français', region: 'France', script: 'latin' as const },
]

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('RecipeBookSim', () => {
  test('copies a special character from the selected language', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const localizedData = { ...data, items: new Map([...data.items, ['minecraft:oak_planks', { ...data.items.get('minecraft:oak_planks')!, name: 'Planches de chêne', searchLines: [{ source: 'name' as const, text: 'Planches de chêne' }] }]]) }
    render(<RecipeBookSim data={localizedData} icons={icons} customSlots={[]} languages={languages} selectedLocale="fr_fr" enabledBannedLocales={new Set()} onLocaleChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy ê' }))
    expect(writeText).toHaveBeenCalledWith('ê')
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Copied ê'))
  })
  test('filters selected-inventory craftable outputs and honors the crafting grid size', () => {
    render(<RecipeBookSim
      data={data}
      icons={icons}
      customSlots={[]}
      languages={languages}
      selectedLocale="en_us"
      enabledBannedLocales={new Set()}
      onLocaleChange={vi.fn()}
    />)

    const results = screen.getByRole('region', { name: 'Recipe book results' })
    expect(within(results).getByRole('img', { name: 'Iron Sword' })).toBeTruthy()
    expect(within(results).getByRole('img', { name: 'Oak Planks' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Previous result page' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Next result page' })).toBeNull()

    fireEvent.change(screen.getByRole('searchbox', { name: 'recipe book search' }), { target: { value: 'plank' } })
    expect(within(results).getByRole('img', { name: 'Oak Planks' })).toBeTruthy()
    expect(within(results).queryByRole('img', { name: 'Iron Sword' })).toBeNull()

    fireEvent.change(screen.getByRole('searchbox', { name: 'recipe book search' }), { target: { value: 'oak pl' } })
    expect(within(results).getByRole('img', { name: 'Oak Planks' })).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: 'recipe book search' }), { target: { value: 'oakpl' } })
    expect(within(results).queryByRole('img', { name: 'Oak Planks' })).toBeNull()

    fireEvent.change(screen.getByRole('searchbox', { name: 'recipe book search' }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('switch', { name: 'Crafting grid size' }))
    expect(within(results).queryByRole('img', { name: 'Iron Sword' })).toBeNull()
    expect(within(results).getByRole('img', { name: 'Oak Planks' })).toBeTruthy()
  })

  test('shows an item detail panel instead of stack overlays when a result is selected', () => {
    const localizedData: GeneratedData = {
      ...data,
      items: new Map([
        ...data.items,
        ['minecraft:oak_planks', {
          id: 'minecraft:oak_planks',
          name: 'Planches de chêne',
          confidence: 'exact',
          searchLines: [
            { source: 'name', text: 'Planches de chêne' },
            { source: 'description', text: 'Planches pour crafting' },
          ],
        }],
      ]),
      inventoryItems: new Map([
        ['minecraft:oak_log', { id: 'minecraft:oak_log', name: 'Bûche de chêne' }],
        ['minecraft:iron_ingot', { id: 'minecraft:iron_ingot', name: 'Lingot de fer' }],
      ]),
    }
    render(<RecipeBookSim
      data={localizedData}
      englishItems={data.items}
      englishInventoryItems={data.inventoryItems}
      icons={icons}
      customSlots={[]}
      languages={languages}
      selectedLocale="fr_fr"
      enabledBannedLocales={new Set()}
      onLocaleChange={vi.fn()}
    />)

    const results = screen.getByRole('region', { name: 'Recipe book results' })
    expect(results.querySelector('small')).toBeNull()
    fireEvent.change(screen.getByRole('searchbox', { name: 'recipe book search' }), { target: { value: 'crafting' } })
    fireEvent.click(screen.getByRole('button', { name: 'View Planches de chêne recipe details' }))

    const detail = screen.getByRole('complementary', { name: 'Planches de chêne recipe details' })
    expect(within(detail).getByText('Oak Planks')).toBeTruthy()
    expect(within(detail).getByText('Planches de chêne', { selector: 'header p' })).toBeTruthy()
    expect(within(detail).getByRole('region', { name: 'Recipe' })).toBeTruthy()
    expect(within(detail).getByText('makes')).toBeTruthy()
    expect(within(detail).getByText('x4')).toBeTruthy()
    expect(within(detail).getByText('crafting', { selector: 'mark' })).toBeTruthy()
    const addItem = within(detail).getByRole('button', { name: 'Add Oak Planks to simulator inventory' })
    fireEvent.click(addItem)
    expect(addItem.hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Remove Oak Planks (Planches de chêne)' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Remove Oak Log (Bûche de chêne)' }))
    fireEvent.click(screen.getByRole('searchbox', { name: 'Search Simulator inventory' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Simulator inventory' }), { target: { value: 'oak' } })
    expect(screen.getByRole('button', { name: 'Oak Log (Bûche de chêne)' })).toBeTruthy()
  })

  test('keeps empty cells in a shaped recipe layout', () => {
    const goldIngot = { acceptedItems: ['minecraft:gold_ingot'] }
    const bootsData: GeneratedData = {
      ...data,
      items: new Map([['minecraft:golden_boots', {
        id: 'minecraft:golden_boots', name: 'Golden Boots', confidence: 'exact', searchLines: [{ source: 'name', text: 'Golden Boots' }],
      }]]),
      inventoryItems: new Map([['minecraft:gold_ingot', { id: 'minecraft:gold_ingot', name: 'Gold Ingot' }]]),
      recipes: [{
        id: 'minecraft:golden_boots', recipeGroup: null, recipeBookCategory: 'crafting_equipment', resultCollectionId: 'golden_boots', outputItemId: 'minecraft:golden_boots', outputCount: 1,
        ingredientSlots: [goldIngot, goldIngot, goldIngot, goldIngot],
        ingredientLayout: [goldIngot, null, goldIngot, goldIngot, null, goldIngot],
        width: 3, height: 2,
        fits2x2: false, fits3x3: true,
      }],
      collections: new Map([['golden_boots', {
        id: 'golden_boots', recipeBookCategory: 'crafting_equipment', recipeGroup: null, recipeIds: ['minecraft:golden_boots'], outputItemIds: ['minecraft:golden_boots'],
      }]]),
      presets: new Map([['overworld', { id: 'overworld', name: 'Overworld', itemIds: ['minecraft:gold_ingot'] }]]),
    }
    render(<RecipeBookSim
      data={bootsData}
      icons={icons}
      customSlots={[]}
      languages={languages}
      selectedLocale="en_us"
      enabledBannedLocales={new Set()}
      onLocaleChange={vi.fn()}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'View Golden Boots recipe details' }))
    const slots = [...screen.getByRole('complementary', { name: 'Golden Boots recipe details' }).querySelectorAll('.recipe-book-sim__detail-slot')]
    expect(slots).toHaveLength(9)
    expect(slots.map((slot) => slot.querySelector('[role="img"]') !== null)).toEqual([
      true, false, true,
      true, false, true,
      false, false, false,
    ])
  })

  test('uses the source recipe dimensions to keep vertical recipes vertical', () => {
    const iron = { acceptedItems: ['minecraft:iron_ingot'] }
    const stick = { acceptedItems: ['minecraft:oak_log'] }
    const swordData: GeneratedData = {
      ...data,
      recipes: [{
        ...data.recipes.find((recipe) => recipe.id === 'minecraft:iron_sword')!,
        ingredientSlots: [iron, iron, stick],
        ingredientLayout: [iron, iron, stick],
        width: 1,
        height: 3,
      }],
      presets: new Map([['overworld', { id: 'overworld', name: 'Overworld', itemIds: ['minecraft:iron_ingot', 'minecraft:oak_log'] }]]),
    }
    render(<RecipeBookSim
      data={swordData}
      icons={icons}
      customSlots={[]}
      languages={languages}
      selectedLocale="en_us"
      enabledBannedLocales={new Set()}
      onLocaleChange={vi.fn()}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'View Iron Sword recipe details' }))
    const slots = [...screen.getByRole('complementary', { name: 'Iron Sword recipe details' }).querySelectorAll('.recipe-book-sim__detail-slot')]
    expect(slots.map((slot) => slot.querySelector('[role="img"]') !== null)).toEqual([
      false, true, false,
      false, true, false,
      false, true, false,
    ])
  })

  test('changes the global language and lists non-basic Latin letters for Latin-script locales', () => {
    const onLocaleChange = vi.fn()
    const frenchData: GeneratedData = {
      ...data,
      items: new Map([
        ...data.items,
        ['minecraft:stick', { id: 'minecraft:stick', name: 'Bâton', confidence: 'exact', searchLines: [{ source: 'name', text: 'Bâton' }] }],
      ]),
    }
    render(<RecipeBookSim
      data={frenchData}
      icons={icons}
      customSlots={[]}
      languages={languages}
      selectedLocale="fr_fr"
      scores={new Map([
        ['fr_fr', { status: 'ready', score: 1 }],
        ['en_us', { status: 'ready', score: 9 }],
      ])}
      enabledBannedLocales={new Set()}
      onLocaleChange={onLocaleChange}
    />)

    expect(within(screen.getByRole('region', { name: 'Special characters' })).getByText('â')).toBeTruthy()
    const languageButton = screen.getByRole('button', { name: 'Simulator language' })
    expect(within(languageButton).getByText('1').getAttribute('style')).toContain('--language-score-position: 0')
    fireEvent.click(languageButton)
    const languageChoices = within(screen.getByRole('listbox', { name: 'Simulator language choices' }))
    expect(languageChoices.getByText('9').getAttribute('style')).toContain('--language-score-position: 1')
    fireEvent.click(languageChoices.getByRole('option', { name: /english - english \(united states\)/ }))
    expect(onLocaleChange).toHaveBeenCalledWith('en_us')
  })

  test('always searches item IDs and tooltip text through colon-prefixed queries', () => {
    const swordWithTooltip: GeneratedData = {
      ...data,
      items: new Map([...data.items, ['minecraft:iron_sword', {
        ...data.items.get('minecraft:iron_sword')!,
        searchLines: [
          { source: 'name', text: 'Iron Sword' },
          { source: 'attribute', text: 'When in Main Hand' },
        ],
      }]]),
    }
    render(<RecipeBookSim
      data={swordWithTooltip}
      icons={icons}
      customSlots={[]}
      languages={languages}
      selectedLocale="en_us"
      enabledBannedLocales={new Set()}
      onLocaleChange={vi.fn()}
    />)

    const search = screen.getByRole('searchbox', { name: 'recipe book search' })
    fireEvent.change(search, { target: { value: ':on_sw' } })
    expect(within(screen.getByRole('region', { name: 'Recipe book results' })).getByRole('img', { name: 'Iron Sword' })).toBeTruthy()

    fireEvent.change(search, { target: { value: ':main' } })
    expect(within(screen.getByRole('region', { name: 'Recipe book results' })).getByRole('img', { name: 'Iron Sword' })).toBeTruthy()
  })

  test('filters the simulator language menu', () => {
    const simulatorLanguages = [...languages, { locale: 'de_de', name: 'Deutsch', region: 'Deutschland', script: 'latin' as const }]
    render(<RecipeBookSim
      data={data}
      icons={icons}
      customSlots={[]}
      languages={simulatorLanguages}
      selectedLocale="fr_fr"
      enabledBannedLocales={new Set()}
      onLocaleChange={vi.fn()}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Simulator language' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search simulator languages' }), { target: { value: 'german' } })
    const languageChoices = within(screen.getByRole('listbox', { name: 'Simulator language choices' }))
    expect(languageChoices.getAllByRole('option')).toHaveLength(1)
    expect(languageChoices.getByRole('option', { name: /german/i })).toBeTruthy()
  })

  test('shows craftable members of a result group when another member matches the search', () => {
    const groupedData: GeneratedData = {
      ...data,
      items: new Map([
        ...data.items,
        ['minecraft:brown_bed', { id: 'minecraft:brown_bed', name: 'Brown Bed', confidence: 'exact', searchLines: [{ source: 'name', text: 'Brown Bed' }] }],
        ['minecraft:white_bed', { id: 'minecraft:white_bed', name: 'White Bed', confidence: 'exact', searchLines: [{ source: 'name', text: 'White Bed' }] }],
      ]),
      inventoryItems: new Map([
        ...data.inventoryItems,
        ['minecraft:white_wool', { id: 'minecraft:white_wool', name: 'White Wool' }],
      ]),
      recipes: [
        ...data.recipes,
        { id: 'minecraft:white_bed', recipeGroup: 'bed', recipeBookCategory: 'crafting_misc', resultCollectionId: 'bed', outputItemId: 'minecraft:white_bed', outputCount: 1, ingredientSlots: [{ acceptedItems: ['minecraft:oak_log'] }, { acceptedItems: ['minecraft:white_wool'] }], fits2x2: true, fits3x3: true },
      ],
      collections: new Map([
        ...data.collections,
        ['bed', { id: 'bed', recipeBookCategory: 'crafting_misc', recipeGroup: 'bed', recipeIds: ['minecraft:white_bed'], outputItemIds: ['minecraft:brown_bed', 'minecraft:white_bed'] }],
      ]),
      presets: new Map([['overworld', { id: 'overworld', name: 'Overworld', itemIds: ['minecraft:oak_log', 'minecraft:iron_ingot', 'minecraft:white_wool'] }]]),
    }
    render(<RecipeBookSim
      data={groupedData}
      icons={icons}
      customSlots={[]}
      languages={languages}
      selectedLocale="en_us"
      enabledBannedLocales={new Set()}
      onLocaleChange={vi.fn()}
    />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'recipe book search' }), { target: { value: 'wn' } })
    expect(within(screen.getByRole('region', { name: 'Recipe book results' })).getByRole('img', { name: 'White Bed' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'View White Bed recipe details' }))
    const detail = screen.getByRole('complementary', { name: 'White Bed recipe details' })
    expect(detail.querySelector('.recipe-book-sim__detail-tooltip p')?.textContent).toBe('White Bed (Brown Bed)')
    expect(within(detail).getByText('wn', { selector: 'mark' })).toBeTruthy()
  })
})
