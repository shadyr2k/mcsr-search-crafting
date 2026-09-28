import { useMemo, useState } from 'react'

import type { IconManifest } from '../data/iconManifest'
import type { CustomInventoryPreset, EntryOptimizationOutcome, GeneratedData, ItemSetDraft, LanguageMetadata, RankedSearch, TargetWorkspaceEntry } from '../domain/types'
import { useCraftLookupLanguages, type CraftLookupLanguageCategory, type CraftLookupLanguageState } from '../hooks/useCraftLookupLanguages'
import { normalizeExactSearchText } from '../engine/search'
import { newItemSetDraft } from '../workspace/entryDraft'
import { CalculatedSearchRow } from './CalculatedSearchRow'
import { englishLocaleName, languageDisplayName } from './LanguageSelector'
import { ItemSetEditor } from './ItemSetEditor'

interface CraftLookupProps {
  data: GeneratedData
  icons: IconManifest
  session: CraftLookupSession
  languages: readonly LanguageMetadata[]
  enabledBannedLocales: ReadonlySet<string>
  customSlots: Array<CustomInventoryPreset | null>
  onSessionChange: (session: CraftLookupSession) => void
  onSaveCustomSlot: (index: number, preset: CustomInventoryPreset) => void
  onClearCustomSlot: (index: number) => void
  dataBaseUrl?: string
  itemIdSearch?: boolean
  hideNumberCraftsByDefault?: boolean
  removeAnimations?: boolean
  compactLayout?: boolean
}

export interface CraftLookupSession {
  draft: ItemSetDraft
  entry?: TargetWorkspaceEntry
}

export function newCraftLookupSession(): CraftLookupSession {
  return { draft: newItemSetDraft() }
}

const CATEGORY_DETAILS: Array<{ category: CraftLookupLanguageCategory; title: string; description: string }> = [
  { category: 'junkless-single', title: 'junkless, no overlap', description: 'a regular craft w/ no junk' },
  { category: 'junkless-overlap', title: 'junkless overlap', description: 'only an overlap craft can avoid junk' },
  { category: 'requires-junk', title: 'cannot be junkless', description: 'every viable craft includes junk' },
  { category: 'no-viable', title: 'no viable craft', description: 'the selected inventory cannot craft the goal' },
]

type ReadyLookupLanguage = {
  locale: string
  state: Extract<CraftLookupLanguageState, { status: 'ready' }>
}

function previewMode(category: CraftLookupLanguageCategory): 'default' | 'junkless-single' | 'junkless-overlap' {
  if (category === 'junkless-single') return 'junkless-single'
  if (category === 'junkless-overlap') return 'junkless-overlap'
  return 'default'
}

function usesNumber(search: RankedSearch): boolean {
  return search.queries.some((query) => /\p{Number}/u.test(query))
}

function comparableCrafts(outcome: EntryOptimizationOutcome, category: CraftLookupLanguageCategory): RankedSearch[] {
  if (outcome.kind === 'no-viable') return []
  if (category === 'junkless-single') return outcome.rankedSearches.filter((search) => search.kind === 'single' && search.totalJunkAppearances === 0)
  if (category === 'junkless-overlap') return outcome.rankedSearches.filter((search) => search.kind === 'overlap' && search.totalJunkAppearances === 0)
  return outcome.rankedSearches
}

function normalizeLanguageSearch(value: string): string {
  return normalizeExactSearchText(value)
}

function compareLanguages(
  left: ReadyLookupLanguage,
  right: ReadyLookupLanguage,
  languagesByLocale: ReadonlyMap<string, LanguageMetadata>,
  languages: readonly LanguageMetadata[],
): number {
  const leftCrafts = comparableCrafts(left.state.outcome, left.state.category)
  const rightCrafts = comparableCrafts(right.state.outcome, right.state.category)
  const leftCharacters = Math.min(...leftCrafts.map((search) => search.totalTypedCharacters), Number.POSITIVE_INFINITY)
  const rightCharacters = Math.min(...rightCrafts.map((search) => search.totalTypedCharacters), Number.POSITIVE_INFINITY)
  const leftUsesOnlyNumbers = leftCrafts.length > 0 && leftCrafts.every(usesNumber)
  const rightUsesOnlyNumbers = rightCrafts.length > 0 && rightCrafts.every(usesNumber)
  return left.state.outcome.bestScore - right.state.outcome.bestScore
    || leftCharacters - rightCharacters
    || Number(leftUsesOnlyNumbers) - Number(rightUsesOnlyNumbers)
    || englishLocaleName(languagesByLocale.get(left.locale)!, languages).localeCompare(englishLocaleName(languagesByLocale.get(right.locale)!, languages))
}

function lookupEntryFromDraft(draft: ItemSetDraft): TargetWorkspaceEntry {
  return {
    ...draft,
    id: 'craft-lookup',
    order: 0,
    enabled: true,
  }
}

export function CraftLookup({
  data,
  icons,
  session,
  languages,
  enabledBannedLocales,
  customSlots,
  onSessionChange,
  onSaveCustomSlot,
  onClearCustomSlot,
  dataBaseUrl,
  itemIdSearch = false,
  hideNumberCraftsByDefault = false,
  removeAnimations = false,
  compactLayout = false,
}: CraftLookupProps) {
  const { draft, entry } = session
  const [languageSearch, setLanguageSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<CraftLookupLanguageCategory>('junkless-single')
  const languageStates = useCraftLookupLanguages(data, languages, entry, enabledBannedLocales, dataBaseUrl, itemIdSearch)
  const languagesByLocale = useMemo(() => new Map(languages.map((language) => [language.locale, language])), [languages])
  const readyLanguages = useMemo<ReadyLookupLanguage[]>(() => [...languageStates.entries()].flatMap(([locale, state]) => (
    state.status === 'ready' ? [{ locale, state }] : []
  )).sort((left, right) => compareLanguages(left, right, languagesByLocale, languages)), [languageStates, languages, languagesByLocale])
  const normalizedLanguageSearch = normalizeLanguageSearch(languageSearch.trim())
  const matchedLanguages = useMemo(() => normalizedLanguageSearch === '' ? readyLanguages : readyLanguages.filter(({ locale }) => {
    const language = languagesByLocale.get(locale)!
    return normalizeLanguageSearch(`${locale} ${englishLocaleName(language, languages)} ${languageDisplayName(language)}`).includes(normalizedLanguageSearch)
  }), [languages, languagesByLocale, normalizedLanguageSearch, readyLanguages])
  const pending = entry !== undefined && [...languageStates.values()].some((state) => state.status === 'pending')
  const unavailableCount = [...languageStates.values()].filter((state) => state.status === 'unavailable').length
  const categories = CATEGORY_DETAILS.map((detail) => ({
    ...detail,
    allMatches: readyLanguages.filter((language) => language.state.category === detail.category),
    matches: matchedLanguages.filter((language) => language.state.category === detail.category),
  }))
  const visibleCategory = categories.find(({ category, matches }) => category === selectedCategory && matches.length > 0)
    ?? categories.find(({ matches }) => matches.length > 0)

  return <section className="craft-lookup" aria-label="Craft lookup">
    <header className="craft-lookup__header">
      <h2>craft lookup</h2>
      <p>Compare one item set across every available language.</p>
    </header>
    <div className="craft-lookup__layout">
      <aside className="craft-lookup__editor" aria-label="Craft lookup settings">
        <ItemSetEditor
          state={{ kind: 'new', draft }}
          data={data}
          icons={icons}
          customSlots={customSlots}
          title="lookup setup"
          saveLabel="🔍"
          saveAriaLabel="Look up crafts"
          cancelLabel="Clear"
          showDismiss={false}
          cancelOnOutsidePointer={false}
          saveNextToGoals
          compactLayout={compactLayout}
          hidePresetIcons={compactLayout}
          onDraftChange={(nextDraft) => onSessionChange({ ...session, draft: nextDraft })}
          onSave={({ draft: nextDraft }) => {
            onSessionChange({ draft: nextDraft, entry: lookupEntryFromDraft(nextDraft) })
          }}
          onCancel={() => {
            onSessionChange(newCraftLookupSession())
          }}
          onSaveCustomSlot={onSaveCustomSlot}
          onClearCustomSlot={onClearCustomSlot}
        />
      </aside>
      <div className="craft-lookup__content">
        {entry === undefined
          ? <p className="craft-lookup__empty">Choose goals and an inventory, then select <strong>Look up crafts</strong>.</p>
          : <>
            <section className="craft-lookup__languages" aria-label="Best languages">
              <header>
                <h2>best languages</h2>
                {pending && <span>calculating…</span>}
              </header>
              <div className="craft-lookup__language-search">
                <label htmlFor="craft-lookup-language-search">find a language</label>
                <input
                  id="craft-lookup-language-search"
                  type="search"
                  placeholder="search language or locale"
                  value={languageSearch}
                  onChange={(event) => setLanguageSearch(event.target.value)}
                />
              </div>
              <div className="craft-lookup__category-picker" role="group" aria-label="Craft categories">
                {categories.map(({ category, title, matches }) => <button
                  key={category}
                  type="button"
                  aria-pressed={visibleCategory?.category === category}
                  disabled={matches.length === 0}
                  onClick={() => setSelectedCategory(category)}
                >{title}</button>)}
              </div>
              {visibleCategory && <div className="craft-lookup__language-groups">
                <section className={`craft-lookup__language-group craft-lookup__language-group--${visibleCategory.category}`} aria-label={visibleCategory.title}>
                  <h3>{visibleCategory.title}</h3>
                  <p>{visibleCategory.description} - found {normalizedLanguageSearch === '' ? visibleCategory.allMatches.length : visibleCategory.matches.length} {normalizedLanguageSearch === '' ? 'language' : 'matching language'}{(normalizedLanguageSearch === '' ? visibleCategory.allMatches.length : visibleCategory.matches.length) === 1 ? '' : 's'}</p>
                  <ol className="craft-lookup__language-list" aria-label={`${visibleCategory.title} languages`}>{visibleCategory.matches.map(({ locale, state }) => {
                        const language = languagesByLocale.get(locale)!
                        const languageName = `${englishLocaleName(language, languages)} - ${languageDisplayName(language)}`
                        return <li key={locale}><CalculatedSearchRow
                          entry={entry}
                          entryNumber={1}
                          state={{ status: 'ready', fingerprint: `craft-lookup:${locale}`, outcome: state.outcome }}
                          items={state.data.items}
                          icons={icons}
                          collections={state.data.collections}
                          summaryLabel={`${languageName} crafts`}
                          summaryLead={<span className="craft-lookup__language-name" title={languageName}>{languageName}</span>}
                          hidePreviewDecorations
                          hideOutcomeScore
                          hideOverflowingPreviews
                          previewMode={previewMode(visibleCategory.category)}
                          hideNumberCraftsByDefault={hideNumberCraftsByDefault}
                          removeAnimations={removeAnimations}
                          className="calculated-search-row--craft-lookup"
                        /></li>
                      })}</ol>
                </section>
              </div>}
              {normalizedLanguageSearch !== '' && matchedLanguages.length === 0 && !pending && <p className="craft-lookup__no-language-match">No calculated language matches “{languageSearch.trim()}”.</p>}
              {unavailableCount > 0 && <p className="craft-lookup__unavailable">{unavailableCount} language{unavailableCount === 1 ? '' : 's'} unavailable.</p>}
            </section>
          </>}
      </div>
    </div>
  </section>
}
