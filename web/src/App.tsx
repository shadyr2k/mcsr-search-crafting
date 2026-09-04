import { useEffect, useState } from 'react'

import './App.css'
import { CalculatedSearchRow } from './components/CalculatedSearchRow'
import { ItemSetEditor, type ItemSetEditorCommit, type ItemSetEditorState } from './components/ItemSetEditor'
import { ItemSetWorkspace } from './components/ItemSetWorkspace'
import { LanguageRanking } from './components/LanguageRanking'
import { assertIconCoverage, loadIconManifest, type IconManifest } from './data/iconManifest'
import { loadGeneratedData } from './data/schema'
import type { CustomInventoryPreset, GeneratedData, ItemSetDraft, TargetWorkspace, TargetWorkspaceEntry } from './domain/types'
import { useRowOptimizations } from './hooks/useRowOptimizations'
import { clearCustomInventorySlot, loadCustomInventorySlots, loadTargetWorkspace, saveCustomInventorySlot, saveTargetWorkspace } from './persistence/storage'
import { draftFromEntry, newItemSetDraft } from './workspace/entryDraft'

type OpenEditor = (ItemSetEditorState & { entryId?: string }) | null

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
  const existing = commit.draft.sourceEntryId === undefined ? undefined : workspace.entries.find((entry) => entry.id === commit.draft.sourceEntryId)
  const entry: TargetWorkspaceEntry = existing
    ? { ...commit.draft, id: existing.id, order: existing.order }
    : { ...commit.draft, id: nextEntryId(workspace.entries), order: workspace.entries.length }
  const entries = existing ? workspace.entries.map((candidate) => candidate.id === existing.id ? entry : candidate) : [...workspace.entries, entry]
  return { entries: orderedEntries(entries).map((candidate, order) => ({ ...candidate, order })) }
}

function deleteEntry(workspace: TargetWorkspace, entryId: string): TargetWorkspace {
  return { entries: orderedEntries(workspace.entries.filter((entry) => entry.id !== entryId)).map((entry, order) => ({ ...entry, order })) }
}

function combineWarnings(current: string | undefined, next: string | undefined): string | undefined {
  if (!next || current?.includes(next)) return current
  return current ? `${current} ${next}` : next
}

function App() {
  const [data, setData] = useState<GeneratedData>()
  const [icons, setIcons] = useState<IconManifest>()
  const [error, setError] = useState<string>()
  const [warning, setWarning] = useState<string>()
  const [workspace, setWorkspace] = useState<TargetWorkspace>({ entries: [] })
  const [customSlots, setCustomSlots] = useState<Array<CustomInventoryPreset | null>>([null, null, null])
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false)
  const [editor, setEditor] = useState<OpenEditor>(null)
  const { states, aggregate, retry } = useRowOptimizations(data, workspace.entries)

  useEffect(() => {
    const slots = loadCustomInventorySlots()
    const saved = loadTargetWorkspace()
    setCustomSlots(slots.value)
    setWorkspace(saved.value)
    setWarning([slots.warning, saved.warning].filter(Boolean).join(' ') || undefined)
    setWorkspaceLoaded(true)
    Promise.all([loadGeneratedData(), loadIconManifest()]).then(([loadedData, loadedIcons]) => {
      assertIconCoverage(loadedIcons, loadedData)
      setWorkspace((current) => normalizeWorkspaceGridSizes(current, loadedData))
      setData(loadedData)
      setIcons(loadedIcons)
    }).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'The crafting data could not be loaded.'))
  }, [])

  useEffect(() => {
    if (!workspaceLoaded || !data) return
    const result = saveTargetWorkspace(workspace)
    setWarning((current) => combineWarnings(current, result.warning))
  }, [data, workspace, workspaceLoaded])

  function openEdit(entryId: string) {
    if (editor) return
    const entry = workspace.entries.find((candidate) => candidate.id === entryId)
    if (entry) setEditor({ kind: 'existing', entryId, draft: draftFromEntry(entry) })
  }

  function openAdd() { if (!editor) setEditor({ kind: 'new', draft: newItemSetDraft() }) }
  function updateDraft(draft: ItemSetDraft) { setEditor((current) => current ? { ...current, draft } : null) }
  function saveSlot(index: number, preset: CustomInventoryPreset) {
    const result = saveCustomInventorySlot(index, preset)
    setCustomSlots((current) => current.map((slot, slotIndex) => slotIndex === index ? preset : slot))
    setWarning((current) => combineWarnings(current, result.warning))
  }
  function clearSlot(index: number) {
    const result = clearCustomInventorySlot(index)
    setCustomSlots((current) => current.map((slot, slotIndex) => slotIndex === index ? null : slot))
    setWarning((current) => combineWarnings(current, result.warning))
  }

  const entries = orderedEntries(workspace.entries)
  const editorNumber = editor?.entryId === undefined ? undefined : entries.findIndex((entry) => entry.id === editor.entryId) + 1
  return <main className="app-shell">
    <header className="app-header"><p className="eyebrow">Minecraft Java Edition 1.16.1</p><h1>MCSR Search Crafting</h1></header>
    {warning && <p role="alert">{warning}</p>}{error && <p role="alert">{error}</p>}
    {data && icons && <div className="workspace-grid">
      <LanguageRanking aggregate={aggregate} />
      <ItemSetWorkspace entries={workspace.entries} items={data.items} icons={icons} onWorkspaceChange={setWorkspace} onEdit={openEdit} onAdd={openAdd} />
      <section className="results-column" aria-label={editor ? (editor.kind === 'new' ? 'New item set' : `Edit item set ${editorNumber}`) : 'Calculated searches'}>
        {editor ? <ItemSetEditor
          state={editor} entryNumber={editorNumber} data={data} icons={icons} customSlots={customSlots}
          onDraftChange={updateDraft}
          onSave={(commit) => { setWorkspace((current) => commitDraft(current, commit)); setEditor(null) }}
          onCancel={() => setEditor(null)}
          onDelete={editor.entryId ? () => { setWorkspace((current) => deleteEntry(current, editor.entryId!)); setEditor(null) } : undefined}
          onSaveCustomSlot={saveSlot} onClearCustomSlot={clearSlot}
        /> : entries.map((entry, index) => <CalculatedSearchRow
          key={entry.id} entry={entry} entryNumber={index + 1} state={states.get(entry.id)} items={data.items} icons={icons} onRetry={() => retry(entry.id)}
        />)}
      </section>
    </div>}
  </main>
}

export default App
