import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import './App.css'
import { CalculatedSearchRow } from './components/CalculatedSearchRow'
import { CraftLookup, newCraftLookupSession, type CraftLookupSession } from './components/CraftLookup'
import { CraftingSheet } from './components/CraftingSheet'
import { ItemIcon } from './components/ItemIcon'
import { ItemSetEditor, type ItemSetEditorCommit, type ItemSetEditorState } from './components/ItemSetEditor'
import { ItemSetWorkspace } from './components/ItemSetWorkspace'
import { LanguageInfoPanel } from './components/LanguageInfoPanel'
import { RecipeBookSim } from './components/RecipeBookSim'
import { PageTutorial, pageTutorials } from './components/PageTutorial'
import { englishLocaleName, isBannedLocale, isRtlLocale, LanguageSelector } from './components/LanguageSelector'
import { assertIconCoverage, loadIconManifest, type IconManifest } from './data/iconManifest'
import { gameVersionForId, supportedGameVersions } from './data/gameVersions'
import { loadGeneratedData, loadLanguageMetadata, loadLocalizedGeneratedData } from './data/schema'
import type { CustomInventoryPreset, GeneratedData, ItemSetDraft, LanguageMetadata, TargetWorkspace, TargetWorkspaceEntry } from './domain/types'
import { useRowOptimizations } from './hooks/useRowOptimizations'
import { useCraftingSheet } from './hooks/useCraftingSheet'
import { useLanguageScores } from './hooks/useLanguageScores'
import { clearCustomInventorySlot, loadCustomInventorySlots, loadGameVersionPreference, loadLanguagePreferences, loadTargetWorkspace, loadThemePreference, saveCustomInventorySlot, saveGameVersionPreference, saveLanguagePreferences, saveTargetWorkspace, saveThemePreference, type ThemeColor, type ThemePreference } from './persistence/storage'
import { ThemePicker } from './components/ThemePicker'
import { VersionPicker } from './components/VersionPicker'
import { draftFromEntry, newItemSetDraft } from './workspace/entryDraft'
import type { SharedItemSetDraft } from './workspace/itemSetShare'
import { starterWorkspace } from './workspace/starterWorkspace'

type OpenEditor = (ItemSetEditorState & { entryId?: string }) | null
type AppPage = 'home' | 'language-info' | 'craft-lookup' | 'recipe-book-sim'
type PageTransitionPhase = 'idle' | 'exiting' | 'entering'

const PAGE_EXIT_DURATION_MS = 320
const PAGE_ENTER_DURATION_MS = 420

function sharesLanguageColumn(left: AppPage, right: AppPage): boolean {
  return (left === 'home' && right === 'language-info') || (left === 'language-info' && right === 'home')
}

function canAnimateLanguageColumn(): boolean {
  return typeof window === 'undefined'
    || typeof window.matchMedia !== 'function'
    || !window.matchMedia('(max-width: 72rem)').matches
}

function orderedEntries(entries: readonly TargetWorkspaceEntry[]): TargetWorkspaceEntry[] {
  return [...entries].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
}

function normalizeWorkspaceGridSizes(workspace: TargetWorkspace, data: GeneratedData): TargetWorkspace {
  return { entries: workspace.entries.map((entry) => {
    const supports2x2 = entry.targetIds.every((targetId) => data.recipes.some((recipe) => recipe.outputItemId === targetId && recipe.fits2x2))
    return entry.gridSize === 2 && !supports2x2 ? { ...entry, gridSize: 3 as const } : entry
  }) }
}

function nextEntryId(entries: readonly TargetWorkspaceEntry[]): string {
  const ids = new Set(entries.map((entry) => entry.id))
  for (let number = 1; ; number += 1) if (!ids.has(`item-set-${number}`)) return `item-set-${number}`
}

export function commitDraft(workspace: TargetWorkspace, commit: ItemSetEditorCommit): TargetWorkspace {
  const { sourceEntryId, ...draft } = commit.draft
  const existing = sourceEntryId === undefined ? undefined : workspace.entries.find((entry) => entry.id === sourceEntryId)
  const entry: TargetWorkspaceEntry = existing
    ? { ...draft, id: existing.id, order: existing.order }
    : { ...draft, id: nextEntryId(workspace.entries), order: workspace.entries.length }
  const entries = existing ? workspace.entries.map((candidate) => candidate.id === existing.id ? entry : candidate) : [...workspace.entries, entry]
  return { entries: orderedEntries(entries).map((candidate, order) => ({ ...candidate, order })) }
}

export function workspaceFromSharedDrafts(drafts: readonly SharedItemSetDraft[]): TargetWorkspace {
  return {
    entries: drafts.map((draft, order) => ({
      ...draft,
      id: `item-set-${order + 1}`,
      order,
    })),
  }
}

function deleteEntry(workspace: TargetWorkspace, entryId: string): TargetWorkspace {
  return { entries: orderedEntries(workspace.entries.filter((entry) => entry.id !== entryId)).map((entry, order) => ({ ...entry, order })) }
}

function combineWarnings(current: string | undefined, next: string | undefined): string | undefined {
  if (!next || current?.includes(next)) return current
  return current ? `${current} ${next}` : next
}

function App() {
  const [gameVersionId, setGameVersionId] = useState(() => loadGameVersionPreference(
    new Set(supportedGameVersions.map((version) => version.id)),
    supportedGameVersions[0].id,
  ).value)
  const [baseData, setBaseData] = useState<GeneratedData>()
  const [data, setData] = useState<GeneratedData>()
  const [icons, setIcons] = useState<IconManifest>()
  const [languages, setLanguages] = useState<LanguageMetadata[]>([])
  const [selectedLocale, setSelectedLocale] = useState('en_us')
  const [enabledBannedLocales, setEnabledBannedLocales] = useState<ReadonlySet<string>>(new Set())
  const [theme, setTheme] = useState<ThemePreference>({ mode: 'light', color: 'pink' })
  const [page, setPage] = useState<AppPage>('home')
  const [pageTransitionPhase, setPageTransitionPhase] = useState<PageTransitionPhase>('idle')
  const [usesSharedLanguageTransition, setUsesSharedLanguageTransition] = useState(false)
  const [loadingLocale, setLoadingLocale] = useState<string>()
  const [error, setError] = useState<string>()
  const [warning, setWarning] = useState<string>()
  const [workspace, setWorkspace] = useState<TargetWorkspace>({ entries: [] })
  const [customSlots, setCustomSlots] = useState<Array<CustomInventoryPreset | null>>([null, null, null])
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false)
  const [editor, setEditor] = useState<OpenEditor>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [tutorialIndex, setTutorialIndex] = useState<number | null>(null)
  const tutorialPriorView = useRef<{ editor: OpenEditor; sheetOpen: boolean } | undefined>(undefined)
  const helpRef = useRef<HTMLButtonElement>(null)
  const resultsRef = useRef<HTMLElement>(null)
  const [craftLookupSession, setCraftLookupSession] = useState<CraftLookupSession>(newCraftLookupSession)
  const languageSelectorRef = useRef<HTMLElement>(null)
  const workspaceTransitionRef = useRef<HTMLDivElement>(null)
  const priorLanguagePositionRef = useRef<DOMRect | undefined>(undefined)
  const languageAnimationFrameRef = useRef<number | undefined>(undefined)
  const pendingPageRef = useRef<AppPage | undefined>(undefined)
  const pageTransitionTimeoutRef = useRef<number | undefined>(undefined)
  const entries = useMemo(() => orderedEntries(workspace.entries), [workspace.entries])
  const gameVersion = gameVersionForId(gameVersionId)
  const { states, retry } = useRowOptimizations(data, workspace.entries)
  const craftingSheet = useCraftingSheet(selectedLocale, entries, states, gameVersion.id)
  const languageScores = useLanguageScores(baseData, languages, workspace.entries, enabledBannedLocales, gameVersion.packageBaseUrl, gameVersion.id)

  useLayoutEffect(() => {
    if (tutorialIndex === null) return
    const step = pageTutorials[page]?.[tutorialIndex]
    if (!step) return
    if (step.editor) {
      const entry = entries[0]
      setEditor((current) => current ?? tutorialPriorView.current?.editor ?? (entry
        ? { kind: 'existing', entryId: entry.id, draft: draftFromEntry(entry) }
        : { kind: 'new', draft: newItemSetDraft() }))
    } else setEditor(null)
    setSheetOpen(step.sheet === true)
  }, [tutorialIndex, page])

  useEffect(() => {
    if (!sheetOpen || tutorialIndex !== null) return
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !resultsRef.current?.querySelector('.crafting-sheet')?.contains(event.target)) setSheetOpen(false)
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented) { setSheetOpen(false); resultsRef.current?.querySelector<HTMLButtonElement>('.crafting-sheet__toggle')?.focus() }
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape) }
  }, [sheetOpen, tutorialIndex])

  function closeTutorial() {
    setTutorialIndex(null)
    if (tutorialPriorView.current) { setEditor(tutorialPriorView.current.editor); setSheetOpen(tutorialPriorView.current.sheetOpen) }
    tutorialPriorView.current = undefined
    helpRef.current?.focus()
  }

  useEffect(() => {
    let active = true
    const slots = loadCustomInventorySlots(undefined, gameVersion.id)
    const saved = loadTargetWorkspace(undefined, gameVersion.id)
    const savedTheme = loadThemePreference()
    setCustomSlots(slots.value)
    setWorkspace(saved.value)
    setTheme(savedTheme.value)
    setWarning([slots.warning, saved.warning, savedTheme.warning].filter(Boolean).join(' ') || undefined)
    setError(undefined)
    setWorkspaceLoaded(false)
    setBaseData(undefined)
    setData(undefined)
    setIcons(undefined)
    setLanguages([])
    setEditor(null)
    setSheetOpen(false)
    setCraftLookupSession(newCraftLookupSession())
    Promise.all([
      loadGeneratedData(gameVersion.packageBaseUrl),
      loadIconManifest(gameVersion.packageBaseUrl, gameVersion.id),
      loadLanguageMetadata(gameVersion.packageBaseUrl),
    ]).then(([loadedData, loadedIcons, loadedLanguages]) => {
      if (!active) return
      assertIconCoverage(loadedIcons, loadedData)
      const availableLocales = new Set(loadedLanguages.map((language) => language.locale))
      const languagePreferences = loadLanguagePreferences(availableLocales, undefined, gameVersion.id)
      const enabledLocales = new Set(languagePreferences.value.enabledBannedLocales)
      const locale = isBannedLocale(languagePreferences.value.selectedLocale) && !enabledLocales.has(languagePreferences.value.selectedLocale)
        ? 'en_us'
        : languagePreferences.value.selectedLocale
      const initialWorkspace = saved.isFirstVisit ? starterWorkspace(loadedData) : saved.value
      setWorkspace(normalizeWorkspaceGridSizes(initialWorkspace, loadedData))
      setWorkspaceLoaded(true)
      setBaseData(loadedData)
      setData(loadedData)
      setIcons(loadedIcons)
      setLanguages(loadedLanguages)
      setEnabledBannedLocales(enabledLocales)
      setSelectedLocale(locale)
      setWarning([slots.warning, saved.warning, savedTheme.warning, languagePreferences.warning].filter(Boolean).join(' ') || undefined)
      if (locale !== 'en_us') {
        setLoadingLocale(locale)
        loadLocalizedGeneratedData(locale, loadedData, gameVersion.packageBaseUrl).then((localizedData) => {
          if (active) setData(localizedData)
        }).catch((loadError: unknown) => {
          if (!active) return
          setSelectedLocale('en_us')
          setWarning((current) => combineWarnings(current, `Could not load ${locale}; English (US) was selected instead.`))
        }).finally(() => { if (active) setLoadingLocale(undefined) })
      }
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'The crafting data could not be loaded.')
    })
    return () => { active = false }
  }, [gameVersion])

  useEffect(() => {
    document.documentElement.dataset.theme = theme.mode
    document.documentElement.dataset.themeColor = theme.color
    return () => {
      delete document.documentElement.dataset.theme
      delete document.documentElement.dataset.themeColor
    }
  }, [theme])

  useEffect(() => {
    if (!workspaceLoaded || !data) return
    const result = saveTargetWorkspace(workspace, undefined, gameVersion.id)
    setWarning((current) => combineWarnings(current, result.warning))
  }, [data, gameVersion.id, workspace, workspaceLoaded])

  useLayoutEffect(() => {
    const selector = languageSelectorRef.current
    const workspaceTransition = workspaceTransitionRef.current
    const priorPosition = priorLanguagePositionRef.current
    if (!selector || !workspaceTransition || !priorPosition) return
    priorLanguagePositionRef.current = undefined

    // Make the layout reach its destination before the next paint, then keep the
    // list visually in its old position and animate that measured difference.
    // CSS grid tracks can otherwise resolve discretely, which makes the list snap.
    workspaceTransition.style.transition = 'none'
    void workspaceTransition.offsetWidth
    const nextPosition = selector.getBoundingClientRect()
    const offsetX = priorPosition.left - nextPosition.left
    const offsetY = priorPosition.top - nextPosition.top
    if (Math.abs(offsetX) < 1 && Math.abs(offsetY) < 1) {
      workspaceTransition.style.transition = ''
      return
    }

    selector.style.transition = 'none'
    selector.style.transform = `translate(${offsetX}px, ${offsetY}px)`
    void selector.offsetWidth
    languageAnimationFrameRef.current = requestAnimationFrame(() => {
      workspaceTransition.style.transition = ''
      selector.style.transition = 'transform 900ms cubic-bezier(.4, 0, .2, 1)'
      selector.style.transform = 'translate(0, 0)'
      const finishLanguageTransition = (event: TransitionEvent) => {
        if (event.target !== selector || event.propertyName !== 'transform') return
        selector.style.transition = ''
        selector.style.transform = ''
        selector.removeEventListener('transitionend', finishLanguageTransition)
      }
      selector.addEventListener('transitionend', finishLanguageTransition)
    })
  }, [page])

  useEffect(() => () => {
    if (languageAnimationFrameRef.current !== undefined) cancelAnimationFrame(languageAnimationFrameRef.current)
    if (pageTransitionTimeoutRef.current !== undefined) clearTimeout(pageTransitionTimeoutRef.current)
  }, [])

  function openEdit(entryId: string) {
    if (editor) return
    const entry = workspace.entries.find((candidate) => candidate.id === entryId)
    if (entry) setEditor({ kind: 'existing', entryId, draft: draftFromEntry(entry) })
  }

  function openAdd() { if (!editor) setEditor({ kind: 'new', draft: newItemSetDraft() }) }
  function updateDraft(draft: ItemSetDraft) { setEditor((current) => current ? { ...current, draft } : null) }
  function saveSlot(index: number, preset: CustomInventoryPreset) {
    const result = saveCustomInventorySlot(index, preset, undefined, gameVersion.id)
    setCustomSlots((current) => current.map((slot, slotIndex) => slotIndex === index ? preset : slot))
    setWarning((current) => combineWarnings(current, result.warning))
  }
  function clearSlot(index: number) {
    const result = clearCustomInventorySlot(index, undefined, gameVersion.id)
    setCustomSlots((current) => current.map((slot, slotIndex) => slotIndex === index ? null : slot))
    setWarning((current) => combineWarnings(current, result.warning))
  }

  function selectLocale(locale: string) {
    if (!baseData || locale === selectedLocale || loadingLocale) return
    if (locale === 'en_us') {
      setData(baseData)
      setSelectedLocale(locale)
      const result = saveLanguagePreferences({ selectedLocale: locale, enabledBannedLocales: [...enabledBannedLocales] }, undefined, gameVersion.id)
      setWarning((current) => combineWarnings(current, result.warning))
      return
    }
    setLoadingLocale(locale)
    loadLocalizedGeneratedData(locale, baseData, gameVersion.packageBaseUrl).then((localizedData) => {
      setData(localizedData)
      setSelectedLocale(locale)
      const result = saveLanguagePreferences({ selectedLocale: locale, enabledBannedLocales: [...enabledBannedLocales] }, undefined, gameVersion.id)
      setWarning((current) => combineWarnings(current, result.warning))
    }).catch(() => {
      setData(baseData)
      setSelectedLocale('en_us')
      const result = saveLanguagePreferences({ selectedLocale: 'en_us', enabledBannedLocales: [...enabledBannedLocales] }, undefined, gameVersion.id)
      setWarning((current) => combineWarnings(
        combineWarnings(current, `Could not load ${locale}; English (US) was selected instead.`),
        result.warning,
      ))
    }).finally(() => setLoadingLocale(undefined))
  }

  function setBannedLocaleEnabled(locale: string, enabled: boolean) {
    const next = new Set(enabledBannedLocales)
    if (enabled) next.add(locale)
    else next.delete(locale)
    const nextLocale = !enabled && selectedLocale === locale ? 'en_us' : selectedLocale
    setEnabledBannedLocales(next)
    if (nextLocale !== selectedLocale && baseData) {
      setSelectedLocale(nextLocale)
      setData(baseData)
    }
    const result = saveLanguagePreferences({ selectedLocale: nextLocale, enabledBannedLocales: [...next] }, undefined, gameVersion.id)
    setWarning((current) => combineWarnings(current, result.warning))
  }

  function toggleTheme() {
    const nextTheme: ThemePreference = { ...theme, mode: theme.mode === 'light' ? 'dark' : 'light' }
    setTheme(nextTheme)
    const result = saveThemePreference(nextTheme)
    setWarning((current) => combineWarnings(current, result.warning))
  }

  function selectGameVersion(versionId: string) {
    if (versionId === gameVersion.id) return
    setGameVersionId(versionId)
    const result = saveGameVersionPreference(versionId)
    setWarning((current) => combineWarnings(current, result.warning))
  }

  function selectThemeColor(color: ThemeColor) {
    const nextTheme: ThemePreference = { ...theme, color }
    setTheme(nextTheme)
    const result = saveThemePreference(nextTheme)
    setWarning((current) => combineWarnings(current, result.warning))
  }

  function selectPage(nextPage: AppPage) {
    if (tutorialIndex !== null) closeTutorial()
    setSheetOpen(false)
    const clearPageTransitionTimer = () => {
      if (pageTransitionTimeoutRef.current === undefined) return
      clearTimeout(pageTransitionTimeoutRef.current)
      pageTransitionTimeoutRef.current = undefined
    }

    if (nextPage === page) {
      if (pageTransitionPhase === 'exiting') {
        clearPageTransitionTimer()
        pendingPageRef.current = undefined
        setPageTransitionPhase('idle')
      }
      return
    }
    if (pageTransitionPhase === 'exiting') {
      pendingPageRef.current = nextPage
      return
    }

    if (languageAnimationFrameRef.current !== undefined) cancelAnimationFrame(languageAnimationFrameRef.current)
    const selector = languageSelectorRef.current
    const shareLanguageColumn = sharesLanguageColumn(page, nextPage) && canAnimateLanguageColumn()
    if (shareLanguageColumn) {
      clearPageTransitionTimer()
      priorLanguagePositionRef.current = selector?.getBoundingClientRect()
      setPageTransitionPhase('idle')
      setUsesSharedLanguageTransition(true)
      setPage(nextPage)
    } else {
      priorLanguagePositionRef.current = undefined
      if (selector) {
        selector.style.transition = ''
        selector.style.transform = ''
      }
      clearPageTransitionTimer()
      pendingPageRef.current = nextPage
      setUsesSharedLanguageTransition(false)
      setPageTransitionPhase('exiting')
      pageTransitionTimeoutRef.current = window.setTimeout(() => {
        const pendingPage = pendingPageRef.current
        pendingPageRef.current = undefined
        if (pendingPage === undefined) return
        setPage(pendingPage)
        setPageTransitionPhase('entering')
        pageTransitionTimeoutRef.current = window.setTimeout(() => {
          setPageTransitionPhase('idle')
          pageTransitionTimeoutRef.current = undefined
        }, PAGE_ENTER_DURATION_MS)
      }, PAGE_EXIT_DURATION_MS)
    }
  }

  const editorNumber = editor?.entryId === undefined ? undefined : entries.findIndex((entry) => entry.id === editor.entryId) + 1
  const selectedLanguage = languages.find((language) => language.locale === selectedLocale)
  const selectedLanguageName = selectedLanguage ? englishLocaleName(selectedLanguage, languages) : 'english (us)'
  return <main className={`app-shell${tutorialIndex !== null ? ' app-shell--tutorial' : ''}`}>
    <header className="app-header">
      <div className="app-header__brand">
        {icons && <ItemIcon itemId="minecraft:smithing_table" name="smithing table" manifest={icons} size="detail" className="app-header__icon" />}
        <div className="app-header__title">
          <h1>MCSR search crafting</h1>
          <p className="app-header__subtitle">optimize recipe book results</p>
        </div>
        <nav className="app-header__nav" aria-label="Main navigation">
          <button type="button" className="app-header__nav-search-crafting" aria-current={page === 'home' ? 'page' : undefined} onClick={() => selectPage('home')}>search crafting</button>
          <button type="button" aria-current={page === 'language-info' ? 'page' : undefined} onClick={() => selectPage('language-info')}>language info</button>
          <button type="button" aria-current={page === 'craft-lookup' ? 'page' : undefined} onClick={() => selectPage('craft-lookup')}>craft lookup</button>
          <button type="button" aria-current={page === 'recipe-book-sim' ? 'page' : undefined} onClick={() => selectPage('recipe-book-sim')}>recipe book sim</button>
        </nav>
      </div>
      <div className="app-header__menu">
        {pageTutorials[page] && <button ref={helpRef} type="button" className="app-header__help" aria-label={`Help for ${page === 'home' ? 'search crafting' : page.replaceAll('-', ' ')}`} disabled={!data || !icons || pageTransitionPhase !== 'idle'} onClick={() => { tutorialPriorView.current = { editor, sheetOpen }; setTutorialIndex(0) }}>?</button>}
        <VersionPicker versions={supportedGameVersions} selectedVersionId={gameVersion.id} onVersionChange={selectGameVersion} />
        {icons && <ThemePicker theme={theme} icons={icons} onThemeColorChange={selectThemeColor} />}
        <button
          type="button"
          className="theme-switch"
          role="switch"
          aria-checked={theme.mode === 'dark'}
          aria-label={`Switch to ${theme.mode === 'dark' ? 'light' : 'dark'} mode`}
          onClick={toggleTheme}
        >
          <span className="theme-switch__light" aria-hidden="true">☀</span>
          <span className="theme-switch__dark" aria-hidden="true">☾</span>
          <span className="theme-switch__thumb" aria-hidden="true" />
        </button>
      </div>
    </header>
    {warning && <p role="alert">{warning}</p>}{error && <p role="alert">{error}</p>}
    <div className={`page-transition${pageTransitionPhase === 'idle' ? '' : ` page-transition--${pageTransitionPhase}`}`}>
    {data && icons && page === 'recipe-book-sim' && <RecipeBookSim
      key={gameVersion.id}
      data={data}
      englishItems={baseData?.items ?? data.items}
      englishInventoryItems={baseData?.inventoryItems ?? data.inventoryItems}
      icons={icons}
      customSlots={customSlots}
      languages={languages}
      selectedLocale={selectedLocale}
      enabledBannedLocales={enabledBannedLocales}
      scores={languageScores}
      onLocaleChange={selectLocale}
      minecraftVersion={gameVersion.id}
    />}
    {baseData && icons && page === 'craft-lookup' && <CraftLookup
      data={baseData}
      icons={icons}
      session={craftLookupSession}
      languages={languages}
      enabledBannedLocales={enabledBannedLocales}
      customSlots={customSlots}
      onSessionChange={setCraftLookupSession}
      onSaveCustomSlot={saveSlot}
      onClearCustomSlot={clearSlot}
      dataBaseUrl={gameVersion.packageBaseUrl}
    />}
    {data && icons && page !== 'recipe-book-sim' && page !== 'craft-lookup' && <div ref={workspaceTransitionRef} className={`workspace-grid workspace-transition workspace-transition--${page}${usesSharedLanguageTransition ? ' workspace-transition--shared-language' : ''}`}>
      <ItemSetWorkspace
        dir={isRtlLocale(selectedLocale) ? 'rtl' : 'ltr'}
        entries={workspace.entries}
        items={data.items}
        inventoryItems={data.inventoryItems}
        icons={icons}
        onWorkspaceChange={setWorkspace}
        onImport={(drafts) => setWorkspace(normalizeWorkspaceGridSizes(workspaceFromSharedDrafts(drafts), data))}
        onEdit={openEdit}
        onAdd={openAdd}
      />
      <LanguageSelector containerRef={languageSelectorRef} languages={languages} selectedLocale={selectedLocale} enabledBannedLocales={enabledBannedLocales} scores={languageScores} loadingLocale={loadingLocale} onSelect={selectLocale} onBannedLocaleEnabledChange={setBannedLocaleEnabled} />
      <section ref={resultsRef} inert={!!editor} aria-hidden={!!editor} className={`results-column${sheetOpen ? ' results-column--sheet-open' : ''}${editor ? ' results-column--editing' : ''}`} dir={isRtlLocale(selectedLocale) ? 'rtl' : 'ltr'} aria-label="Calculated searches">
        <CraftingSheet
          open={sheetOpen}
          onOpenChange={(open) => { setSheetOpen(open); if (open) setEditor(null) }}
          languageName={selectedLanguageName}
          entries={craftingSheet.entries}
          disabledEntries={craftingSheet.disabledEntries}
          characterSet={craftingSheet.characterSet}
          characterUsages={craftingSheet.characterUsages}
          totalTypedCharacters={craftingSheet.totalTypedCharacters}
          totalScore={craftingSheet.totalScore}
          scoreDelta={craftingSheet.scoreDelta}
          items={data.items}
          icons={icons}
          isCalculating={craftingSheet.isCalculating}
          warning={craftingSheet.warning}
          onSelectItemCraft={craftingSheet.selectItemCraft}
          onMoveItemCraft={craftingSheet.moveItemCraft}
          onSetEntryDisabled={craftingSheet.setEntryDisabled}
          onReset={craftingSheet.reset}
        />
        {entries.map((entry, index) => <CalculatedSearchRow
          key={entry.id} entry={entry} entryNumber={index + 1} state={states.get(entry.id)} items={data.items} icons={icons} collections={data.collections} onRetry={() => retry(entry.id)}
        />)}
      </section>
      {editor && <div className="item-set-editor-overlay">
        <ItemSetEditor
          state={editor} entryNumber={editorNumber} data={data} pickerData={baseData} icons={icons} customSlots={customSlots}
          cancelOnOutsidePointer={tutorialIndex === null}
          onDraftChange={updateDraft}
          onSave={(commit) => { setWorkspace((current) => commitDraft(current, commit)); setEditor(null) }}
          onCancel={() => setEditor(null)}
          onDelete={editor.entryId ? () => { setWorkspace((current) => deleteEntry(current, editor.entryId!)); setEditor(null) } : undefined}
          onSaveCustomSlot={saveSlot} onClearCustomSlot={clearSlot}
        />
      </div>}
      {languages.length > 0 && <LanguageInfoPanel locale={selectedLocale} languageName={selectedLanguageName} dataBaseUrl={gameVersion.packageBaseUrl} />}
    </div>}
    </div>
    {tutorialIndex !== null && pageTutorials[page] && <PageTutorial steps={pageTutorials[page]} index={tutorialIndex} onChange={setTutorialIndex} onClose={closeTutorial} />}
  </main>
}

export default App
