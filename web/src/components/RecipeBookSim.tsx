import { useMemo, useState } from 'react'

import recipeNextHoverTexture from '../assets/ui/recipe_arrow_next_disabled.png'
import recipeNextTexture from '../assets/ui/recipe_arrow_next.png'
import recipePreviousHoverTexture from '../assets/ui/recipe_arrow_previous_disabled.png'
import recipePreviousTexture from '../assets/ui/recipe_arrow_previous.png'
import recipeFilterCraftableTexture from '../assets/ui/recipe_filter_craftable.png'
import recipeResultSlotTexture from '../assets/ui/recipe_result_slot.png'
import type { IconManifest } from '../data/iconManifest'
import type { CustomInventoryPreset, GeneratedData, InventoryPreset, LanguageMetadata, SearchItem } from '../domain/types'
import { matchEligibleCollectionOutputs } from '../engine/collectionSearch'
import { eligibleRecipes } from '../engine/craftability'
import { normalizeSearchText } from '../engine/search'
import { GridSizeSwitch } from './GridSizeSwitch'
import { ItemIcon } from './ItemIcon'
import { ItemPicker } from './ItemPicker'
import { englishLocaleName, isBannedLocale } from './LanguageSelector'

interface RecipeBookSimProps {
  data: GeneratedData
  icons: IconManifest
  customSlots: Array<CustomInventoryPreset | null>
  languages: readonly LanguageMetadata[]
  selectedLocale: string
  enabledBannedLocales: ReadonlySet<string>
  onLocaleChange: (locale: string) => void
}

interface InventoryChoice extends InventoryPreset {
  iconItemId?: string
}

function presetIconId(presetId: string): string | undefined {
  if (presetId === 'overworld') return 'minecraft:chest'
  if (presetId === 'nether-bastion') return 'minecraft:gold_block'
  if (presetId === 'nether-fortress') return 'minecraft:blaze_rod'
  return undefined
}

function matchesTooltip(item: SearchItem, query: string): boolean {
  return item.searchLines.some((line) => normalizeSearchText(line.text).includes(query))
}

function latinSpecialCharacters(items: ReadonlyMap<string, SearchItem>): string[] {
  const characters = new Set<string>()
  for (const item of items.values()) {
    for (const line of item.searchLines) {
      for (const character of line.text.normalize('NFC')) {
        if (/\p{L}/u.test(character) && !/[A-Za-z]/.test(character)) characters.add(character.toLocaleLowerCase())
      }
    }
  }
  return [...characters].sort((left, right) => left.localeCompare(right))
}

export function RecipeBookSim({
  data,
  icons,
  customSlots,
  languages,
  selectedLocale,
  enabledBannedLocales,
  onLocaleChange,
}: RecipeBookSimProps) {
  const defaultInventory = data.presets.get('overworld')?.itemIds ?? []
  const [inventoryItemIds, setInventoryItemIds] = useState<string[]>(defaultInventory)
  const [gridSize, setGridSize] = useState<2 | 3>(3)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  // Match Minecraft's localized tooltip text literally. In particular, a
  // space is a searchable character rather than formatting to discard.
  const normalizedQuery = normalizeSearchText(query)
  const inventory = useMemo(() => new Set(inventoryItemIds), [inventoryItemIds])
  const selectableLanguages = useMemo(() => languages.filter((language) => (
    !isBannedLocale(language.locale) || enabledBannedLocales.has(language.locale)
  )).sort((left, right) => (
    englishLocaleName(left, languages).localeCompare(englishLocaleName(right, languages))
  )), [enabledBannedLocales, languages])
  const selectedLanguage = languages.find((language) => language.locale === selectedLocale)
  const specialCharacters = useMemo(() => (
    selectedLanguage?.script === 'latin' ? latinSpecialCharacters(data.items) : []
  ), [data.items, selectedLanguage?.script])
  const inventoryChoices = useMemo<InventoryChoice[]>(() => [
    ...[...data.presets.values()].sort((left, right) => left.name.localeCompare(right.name)).map((preset) => ({
      ...preset,
      iconItemId: presetIconId(preset.id),
    })),
    ...customSlots.flatMap((preset, index) => preset ? [{
      id: `custom-${index}`,
      name: preset.name || `custom inventory ${index + 1}`,
      itemIds: preset.itemIds,
    }] : []),
  ], [customSlots, data.presets])
  const results = useMemo(() => {
    const eligible = eligibleRecipes(data.recipes, inventory, gridSize)
    const outputCounts = new Map<string, number>()
    for (const recipe of eligible) {
      outputCounts.set(recipe.outputItemId, Math.max(outputCounts.get(recipe.outputItemId) ?? 0, recipe.outputCount))
    }

    // Recipe-book result collections share their search text: a match for one
    // bed variant, for example, should reveal every craftable bed in that group.
    let matchingOutputIds: Set<string>
    if (normalizedQuery === '') {
      matchingOutputIds = new Set(outputCounts.keys())
    } else if (Array.from(normalizedQuery).length <= 5) {
      matchingOutputIds = new Set(matchEligibleCollectionOutputs(
        normalizedQuery,
        eligible,
        data.collections,
        data.items,
      ).keys())
    } else {
      // The craft-search engine intentionally caps shortcut queries at five
      // characters. The simulator also accepts ordinary longer text searches.
      matchingOutputIds = new Set(eligible.flatMap((recipe) => {
        const collection = data.collections.get(recipe.resultCollectionId)
        const collectionMatches = collection?.outputItemIds.some((itemId) => {
          const item = data.items.get(itemId)
          return item !== undefined && matchesTooltip(item, normalizedQuery)
        })
        return collectionMatches ? [recipe.outputItemId] : []
      }))
    }

    return [...outputCounts].flatMap(([itemId, outputCount]) => {
      const item = data.items.get(itemId)
      return item && matchingOutputIds.has(itemId) ? [{ item, outputCount }] : []
    }).sort((left, right) => left.item.name.localeCompare(right.item.name) || left.item.id.localeCompare(right.item.id))
  }, [data.collections, data.items, data.recipes, gridSize, inventory, normalizedQuery])
  const pageCount = Math.max(1, Math.ceil(results.length / 20))
  const currentPage = Math.min(page, pageCount - 1)
  const pageResults = results.slice(currentPage * 20, (currentPage + 1) * 20)

  return <section className="recipe-book-sim" aria-label="Recipe book simulator">
    <header className="recipe-book-sim__header">
      <div>
        <h2>recipe book sim</h2>
        <p>search the items craftable from the selected inventory</p>
      </div>
      <strong>{results.length} {results.length === 1 ? 'match' : 'matches'}</strong>
    </header>
    <div className="recipe-book-sim__layout">
      <aside className="recipe-book-sim__controls" aria-label="Recipe book controls">
        <label className="recipe-book-sim__language">
          <span>language</span>
          <select value={selectedLocale} onChange={(event) => onLocaleChange(event.target.value)} aria-label="Simulator language">
            {selectableLanguages.map((language) => <option key={language.locale} value={language.locale}>
              {englishLocaleName(language, languages)}
            </option>)}
          </select>
        </label>
        {specialCharacters.length > 0 && <div className="recipe-book-sim__characters" role="region" aria-label="Special characters">
          <span>special characters</span>
          <ul>{specialCharacters.map((character) => <li key={character}>{character}</li>)}</ul>
        </div>}
        <div className="recipe-book-sim__presets" role="group" aria-label="Inventory presets">
          <span>inventory preset</span>
          <div>
            {inventoryChoices.map((preset) => <button
              key={preset.id}
              type="button"
              aria-pressed={preset.itemIds.length === inventoryItemIds.length && preset.itemIds.every((itemId) => inventory.has(itemId))}
              aria-label={`Use inventory preset ${preset.name}`}
              onClick={() => {
                setInventoryItemIds([...new Set(preset.itemIds)].sort())
                setPage(0)
              }}
            >
              {preset.iconItemId
                ? <ItemIcon itemId={preset.iconItemId} name={`${preset.name} preset icon`} manifest={icons} />
                : <span className="recipe-book-sim__custom-preset" aria-hidden="true">◆</span>}
              <span>{preset.name}</span>
            </button>)}
          </div>
        </div>
        <ItemPicker
          items={data.inventoryItems}
          label="Simulator inventory"
          selectedIds={inventoryItemIds}
          manifest={icons}
          onChange={(itemIds) => {
            setInventoryItemIds(itemIds)
            setPage(0)
          }}
        />
        <GridSizeSwitch
          value={gridSize}
          targetIds={[]}
          recipes={data.recipes}
          onChange={(size) => {
            setGridSize(size)
            setPage(0)
          }}
        />
      </aside>
      <section className="recipe-book-sim__book" aria-label="Recipe book results">
        <span className="recipe-book-sim__craftable-indicator" role="img" aria-label="Craftable recipes shown" title="Craftable recipes shown">
          <img src={recipeFilterCraftableTexture} alt="" />
        </span>
        <label className="recipe-book-sim__book-search">
          <span className="recipe-book-sim__book-search-icon" aria-hidden="true" />
          <input
            type="search"
            aria-label="recipe book search"
            placeholder="search..."
            spellCheck={false}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(0)
            }}
          />
        </label>
        <div className="recipe-book-sim__book-items">
          {results.length === 0
            ? <p>no craftable items match this search</p>
            : <ul>{pageResults.map(({ item, outputCount }) => <li key={item.id} aria-label={item.name}>
                <span className="recipe-book-sim__book-slot" aria-hidden="true">
                  <img src={recipeResultSlotTexture} alt="" />
                </span>
                <ItemIcon itemId={item.id} name={item.name} manifest={icons} size="picker" />
                {outputCount > 1 && <small>{outputCount}</small>}
              </li>)}</ul>}
        </div>
        <nav className="recipe-book-sim__book-pages" aria-label="Result pages">
          {currentPage > 0
            ? <button type="button" aria-label="Previous result page" onClick={() => setPage(currentPage - 1)}>
                <img className="recipe-book-sim__book-page-icon recipe-book-sim__book-page-icon--normal" src={recipePreviousTexture} alt="" aria-hidden="true" />
                <img className="recipe-book-sim__book-page-icon recipe-book-sim__book-page-icon--hover" src={recipePreviousHoverTexture} alt="" aria-hidden="true" />
              </button>
            : <span className="recipe-book-sim__book-page-spacer" aria-hidden="true" />}
          <strong>{currentPage + 1}/{pageCount}</strong>
          {currentPage < pageCount - 1
            ? <button type="button" aria-label="Next result page" onClick={() => setPage(currentPage + 1)}>
                <img className="recipe-book-sim__book-page-icon recipe-book-sim__book-page-icon--normal" src={recipeNextTexture} alt="" aria-hidden="true" />
                <img className="recipe-book-sim__book-page-icon recipe-book-sim__book-page-icon--hover" src={recipeNextHoverTexture} alt="" aria-hidden="true" />
              </button>
            : <span className="recipe-book-sim__book-page-spacer" aria-hidden="true" />}
        </nav>
      </section>
    </div>
  </section>
}
