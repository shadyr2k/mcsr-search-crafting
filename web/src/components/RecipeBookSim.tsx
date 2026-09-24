import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'

import recipeNextHoverTexture from '../assets/ui/recipe_arrow_next_disabled.png'
import recipeNextTexture from '../assets/ui/recipe_arrow_next.png'
import recipePreviousHoverTexture from '../assets/ui/recipe_arrow_previous_disabled.png'
import recipePreviousTexture from '../assets/ui/recipe_arrow_previous.png'
import recipeFilterCraftableTexture from '../assets/ui/recipe_filter_craftable.png'
import recipeResultSlotTexture from '../assets/ui/recipe_result_slot.png'
import type { IconManifest } from '../data/iconManifest'
import type { CraftingRecipe, CustomInventoryPreset, GeneratedData, IngredientSlot, InventoryItem, InventoryPreset, LanguageMetadata, LanguageScoreState, SearchItem } from '../domain/types'
import { matchEligibleCollectionOutputs } from '../engine/collectionSearch'
import { eligibleRecipes } from '../engine/craftability'
import { matchesItemId, normalizeSearchText } from '../engine/search'
import { loadRecipeBookInventory, saveRecipeBookInventory } from '../persistence/storage'
import { GridSizeSwitch } from './GridSizeSwitch'
import { ItemIcon } from './ItemIcon'
import { ItemPicker } from './ItemPicker'
import { englishLocaleName, isBannedLocale, LanguageDropdown } from './LanguageSelector'

interface RecipeBookSimProps {
  data: GeneratedData
  englishItems?: ReadonlyMap<string, SearchItem>
  englishInventoryItems?: ReadonlyMap<string, InventoryItem>
  icons: IconManifest
  customSlots: Array<CustomInventoryPreset | null>
  languages: readonly LanguageMetadata[]
  selectedLocale: string
  enabledBannedLocales: ReadonlySet<string>
  scores?: ReadonlyMap<string, LanguageScoreState>
  onLocaleChange: (locale: string) => void
  minecraftVersion?: string
  compactLayout?: boolean
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

function scoreText(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1)
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

function matchesTooltip(item: SearchItem, query: string): boolean {
  return item.searchLines.some((line) => normalizeSearchText(line.text).includes(query))
}

function matchesRecipeBookSearch(item: SearchItem, query: string): boolean {
  return query.startsWith(':')
    ? matchesItemId(item, query) || matchesTooltip(item, query.slice(1))
    : matchesTooltip(item, query)
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

function highlightTooltipLine(text: string, query: string): ReactNode {
  if (query === '') return text

  const lowerText = text.toLocaleLowerCase()
  const lowerQuery = query.toLocaleLowerCase()
  const fragments: ReactNode[] = []
  let cursor = 0
  let match = lowerText.indexOf(lowerQuery, cursor)

  while (match !== -1) {
    if (match > cursor) fragments.push(text.slice(cursor, match))
    fragments.push(<mark key={`${match}-${cursor}`}>{text.slice(match, match + query.length)}</mark>)
    cursor = match + query.length
    match = lowerText.indexOf(lowerQuery, cursor)
  }

  if (fragments.length === 0) return text
  if (cursor < text.length) fragments.push(text.slice(cursor))
  return fragments
}

function itemName(itemId: string, data: GeneratedData): string {
  return data.items.get(itemId)?.name ?? data.inventoryItems.get(itemId)?.name ?? itemId.replace('minecraft:', '').replaceAll('_', ' ')
}

function matchedGroupItem(item: SearchItem, recipe: CraftingRecipe, data: GeneratedData, query: string): SearchItem | undefined {
  if (query === '' || matchesRecipeBookSearch(item, query)) return undefined
  const collection = data.collections.get(recipe.resultCollectionId)
  return collection?.outputItemIds
    .map((itemId) => data.items.get(itemId))
    .find((candidate): candidate is SearchItem => candidate !== undefined && matchesRecipeBookSearch(candidate, query))
}

function recipeGridCells(recipe: CraftingRecipe, gridSize: 2 | 3): Array<IngredientSlot | null> {
  const layout = recipe.ingredientLayout ?? recipe.ingredientSlots
  const width = recipe.width ?? Math.min(layout.length, gridSize)
  const height = recipe.height ?? Math.ceil(layout.length / width)
  // Minecraft displays single-column 3×3 recipes in the center column.
  const columnOffset = gridSize === 3 && width === 1 ? 1 : 0

  return Array.from({ length: gridSize ** 2 }, (_, index) => {
    const row = Math.floor(index / gridSize)
    const column = index % gridSize - columnOffset
    return row < height && column >= 0 && column < width ? layout[row * width + column] ?? null : null
  })
}

export function RecipeBookSim({
  data,
  englishItems = data.items,
  englishInventoryItems = data.inventoryItems,
  icons,
  customSlots,
  languages,
  selectedLocale,
  enabledBannedLocales,
  scores = new Map(),
  onLocaleChange,
  minecraftVersion = '1.16.1',
  compactLayout = false,
}: RecipeBookSimProps) {
  const defaultInventory = data.presets.get('overworld')?.itemIds ?? []
  const [inventoryItemIds, setInventoryItemIds] = useState<string[]>(() => (
    loadRecipeBookInventory(defaultInventory, undefined, minecraftVersion).value.filter((itemId) => data.inventoryItems.has(itemId) || data.items.has(itemId))
  ))
  const [gridSize, setGridSize] = useState<2 | 3>(3)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState('')
  async function copyCharacter(character: string) {
    try { await navigator.clipboard.writeText(character); setCopyStatus(`Copied ${character}`) }
    catch { setCopyStatus('Could not copy. Select the character and copy it manually.') }
  }
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
  const scorePositionByLocale = useMemo(() => scorePositions(scores), [scores])
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
  const inventoryPickerItems = useMemo(() => {
    const pickerItems = new Map([...data.inventoryItems].map(([itemId, item]) => {
      const englishName = englishInventoryItems.get(itemId)?.name ?? item.name
      return [itemId, {
        ...item,
        name: englishName === item.name ? englishName : `${englishName} (${item.name})`,
      }]
    }))

    // Recipe results are not necessarily ingredient inventory entries. Keep an
    // added result in the picker so it is visibly present and removable.
    for (const itemId of inventoryItemIds) {
      if (pickerItems.has(itemId)) continue
      const item = data.items.get(itemId)
      if (!item) continue
      const englishName = englishItems.get(itemId)?.name ?? item.name
      pickerItems.set(itemId, {
        id: itemId,
        name: englishName === item.name ? englishName : `${englishName} (${item.name})`,
      })
    }
    return pickerItems
  }, [data.inventoryItems, data.items, englishInventoryItems, englishItems, inventoryItemIds])
  const results = useMemo(() => {
    const eligible = eligibleRecipes(data.recipes, inventory, gridSize)
    const outputCounts = new Map<string, number>()
    const recipesByOutput = new Map<string, CraftingRecipe>()
    for (const recipe of eligible) {
      const priorRecipe = recipesByOutput.get(recipe.outputItemId)
      if (priorRecipe === undefined || recipe.outputCount > priorRecipe.outputCount || (
        recipe.outputCount === priorRecipe.outputCount && recipe.id.localeCompare(priorRecipe.id) < 0
      )) {
        recipesByOutput.set(recipe.outputItemId, recipe)
      }
      outputCounts.set(recipe.outputItemId, Math.max(outputCounts.get(recipe.outputItemId) ?? 0, recipe.outputCount))
    }

    // Recipe-book result collections share their search text: a match for one
    // bed variant, for example, should reveal every craftable bed in that group.
    let matchingOutputIds: Set<string>
    if (normalizedQuery === '') {
      matchingOutputIds = new Set(outputCounts.keys())
    } else if (normalizedQuery.startsWith(':')) {
      matchingOutputIds = new Set(eligible.flatMap((recipe) => {
        const collection = data.collections.get(recipe.resultCollectionId)
        const collectionMatches = collection?.outputItemIds.some((itemId) => {
          const item = data.items.get(itemId)
          return item !== undefined && matchesRecipeBookSearch(item, normalizedQuery)
        })
        return collectionMatches ? [recipe.outputItemId] : []
      }))
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
          return item !== undefined && matchesRecipeBookSearch(item, normalizedQuery)
        })
        return collectionMatches ? [recipe.outputItemId] : []
      }))
    }

    return [...outputCounts].flatMap(([itemId, outputCount]) => {
      const item = data.items.get(itemId)
      const recipe = recipesByOutput.get(itemId)
      return item && recipe && matchingOutputIds.has(itemId) ? [{
        item,
        outputCount,
        recipe,
        matchedGroupItem: matchedGroupItem(item, recipe, data, normalizedQuery),
      }] : []
    }).sort((left, right) => left.item.name.localeCompare(right.item.name) || left.item.id.localeCompare(right.item.id))
  }, [data.collections, data.items, data.recipes, gridSize, inventory, normalizedQuery])
  const pageCount = Math.max(1, Math.ceil(results.length / 20))
  const currentPage = Math.min(page, pageCount - 1)
  const pageResults = results.slice(currentPage * 20, (currentPage + 1) * 20)
  const selectedResult = results.find(({ item }) => item.id === selectedResultId)
  const selectedRecipeGridSize = selectedResult?.recipe.fits2x2 ? 2 : 3
  const selectedRecipeIngredients = selectedResult
    ? recipeGridCells(selectedResult.recipe, selectedRecipeGridSize)
    : []

  function updateInventory(itemIds: readonly string[]) {
    const nextItemIds = [...new Set(itemIds)].sort()
    setInventoryItemIds(nextItemIds)
    saveRecipeBookInventory(nextItemIds, undefined, minecraftVersion)
    setPage(0)
  }

  return <section className={`recipe-book-sim${compactLayout ? ' recipe-book-sim--compact' : ''}`} aria-label="Recipe book simulator">
    <div className="recipe-book-sim__layout">
      <div className="recipe-book-sim__configuration">
        <header className="recipe-book-sim__header">
          <div>
            <h2>recipe book simulator</h2>
            <p>search crafting sandbox</p>
          </div>
        </header>
        <aside className="recipe-book-sim__controls" aria-label="Recipe book controls">
        <div className="recipe-book-sim__language">
          <span>language</span>
          <LanguageDropdown
            label="Simulator language"
            languages={selectableLanguages}
            selectedLocale={selectedLocale}
            onSelect={onLocaleChange}
            renderAccessory={(language) => {
              const score = scores.get(language.locale)
              return score?.status === 'ready'
                ? <strong className="recipe-book-sim__language-score" style={{ '--language-score-position': scorePositionByLocale.get(language.locale) } as CSSProperties}>{scoreText(score.score)}</strong>
                : score?.status === 'pending' ? <span className="recipe-book-sim__language-score">…</span>
                  : score?.status === 'not-calculated' ? <span className="recipe-book-sim__language-score" title="Calculate this language from Compare languages.">—</span> : undefined
            }}
          />
        </div>
        {specialCharacters.length > 0 && <div className="recipe-book-sim__characters" role="region" aria-label="Special characters">
          <span>special characters</span>
          <ul>{specialCharacters.map((character) => <li key={character}><button type="button" aria-label={`Copy ${character}`} onClick={() => { void copyCharacter(character) }}>{character}</button></li>)}</ul>
          {copyStatus && <span role="status">{copyStatus}</span>}
        </div>}
        <div className={`recipe-book-sim__presets${compactLayout ? ' recipe-book-sim__presets--text-only' : ''}`} role="group" aria-label="Inventory presets">
          <span>inventory preset</span>
          <div>
            {inventoryChoices.map((preset) => <button
              key={preset.id}
              type="button"
              aria-pressed={preset.itemIds.length === inventoryItemIds.length && preset.itemIds.every((itemId) => inventory.has(itemId))}
              aria-label={`Use inventory preset ${preset.name}`}
              onClick={() => {
                updateInventory(preset.itemIds)
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
          items={inventoryPickerItems}
          label="Simulator inventory"
          className={compactLayout ? 'item-picker--compact' : undefined}
          selectedIds={inventoryItemIds}
          manifest={icons}
          onChange={updateInventory}
        />
        <GridSizeSwitch
          value={gridSize}
          targetIds={[]}
          recipes={data.recipes}
          compactLayout={compactLayout}
          onChange={(size) => {
            setGridSize(size)
            setPage(0)
          }}
        />
        </aside>
      </div>
      <div className="recipe-book-sim__book-area">
        <div className="recipe-book-sim__book-column">
          <section className="recipe-book-sim__book" aria-label="Recipe book results">
          <div className="recipe-book-sim__book-content">
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
                : <ul>{pageResults.map(({ item }) => <li key={item.id}>
                    <button
                      type="button"
                      aria-label={`View ${item.name} recipe details`}
                      aria-pressed={selectedResultId === item.id}
                      onClick={() => setSelectedResultId(item.id)}
                    >
                      <span className="recipe-book-sim__book-slot" aria-hidden="true">
                        <img src={recipeResultSlotTexture} alt="" />
                      </span>
                      <ItemIcon itemId={item.id} name={item.name} manifest={icons} size="picker" />
                    </button>
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
          </div>
          </section>
          <strong className="recipe-book-sim__result-count">{results.length} {results.length === 1 ? 'result' : 'results'}</strong>
        </div>
        {selectedResult && <aside className="recipe-book-sim__detail" aria-label={`${selectedResult.item.name} recipe details`}>
          <header>
            <ItemIcon itemId={selectedResult.item.id} name={selectedResult.item.name} manifest={icons} size="detail" />
            <div className="recipe-book-sim__detail-title">
              <div className="recipe-book-sim__detail-heading">
                <h3>{englishItems.get(selectedResult.item.id)?.name ?? selectedResult.item.name}</h3>
              </div>
              <p>{selectedResult.item.name}</p>
              <button
                type="button"
                className="recipe-book-sim__detail-add"
                aria-label={`Add ${englishItems.get(selectedResult.item.id)?.name ?? selectedResult.item.name} to simulator inventory`}
                disabled={inventory.has(selectedResult.item.id)}
                onClick={() => updateInventory([...inventoryItemIds, selectedResult.item.id])}
              >{inventory.has(selectedResult.item.id) ? 'added' : 'add'}</button>
            </div>
          </header>
          <section className="recipe-book-sim__detail-recipe" aria-label="Recipe">
            <h4>recipe</h4>
            <div className={`recipe-book-sim__detail-grid recipe-book-sim__detail-grid--${selectedRecipeGridSize}`}>
              {Array.from({ length: selectedRecipeGridSize ** 2 }, (_, index) => {
                const ingredientId = selectedRecipeIngredients[index]?.acceptedItems[0]
                return <span key={index} className="recipe-book-sim__detail-slot">
                  {ingredientId && <ItemIcon itemId={ingredientId} name={itemName(ingredientId, data)} manifest={icons} size="compact" />}
                </span>
              })}
            </div>
            <p className="recipe-book-sim__detail-output">
              <span>makes</span>
              <ItemIcon itemId={selectedResult.item.id} name={selectedResult.item.name} manifest={icons} size="compact" />
              <span>x{selectedResult.outputCount}</span>
            </p>
          </section>
          <section className="recipe-book-sim__detail-tooltip" aria-label="Tooltip">
            <h4>tooltip</h4>
            <div>{selectedResult.item.searchLines.map((line, index) => <p key={`${line.source}-${index}`}>
              {highlightTooltipLine(line.text, query)}
              {line.source === 'name' && selectedResult.matchedGroupItem && <> ({highlightTooltipLine(selectedResult.matchedGroupItem.name, query)})</>}
            </p>)}</div>
          </section>
        </aside>}
      </div>
    </div>
  </section>
}
