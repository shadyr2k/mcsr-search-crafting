import { useState } from 'react'

import type { IconManifest } from '../data/iconManifest'
import type { InventoryItem, SearchItem, TargetWorkspace, TargetWorkspaceEntry } from '../domain/types'
import { createItemSetWorkspaceShareCode, parseItemSetWorkspaceShareCode, type SharedItemSetDraft } from '../workspace/itemSetShare'
import { ItemSetRow } from './ItemSetRow'

interface ItemSetWorkspaceProps {
  dir?: 'ltr' | 'rtl'
  entries: readonly TargetWorkspaceEntry[]
  items: ReadonlyMap<string, SearchItem>
  inventoryItems: ReadonlyMap<string, InventoryItem>
  icons: IconManifest
  onWorkspaceChange: (workspace: TargetWorkspace) => void
  onImport: (drafts: readonly SharedItemSetDraft[]) => void
  onEdit: (entryId: string) => void
  onAdd: () => void
}

function ordered(entries: readonly TargetWorkspaceEntry[]): TargetWorkspaceEntry[] {
  return [...entries].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
}

function withOrder(entries: readonly TargetWorkspaceEntry[]): TargetWorkspaceEntry[] {
  return entries.map((entry, order) => ({ ...entry, order }))
}

export function ItemSetWorkspace({ dir, entries, items, inventoryItems, icons, onWorkspaceChange, onImport, onEdit, onAdd }: ItemSetWorkspaceProps) {
  const visibleEntries = ordered(entries)
  const [draggedEntryId, setDraggedEntryId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [sharingOpen, setSharingOpen] = useState(false)
  const [shareCode, setShareCode] = useState('')
  const [shareStatus, setShareStatus] = useState<string>()
  const [importCode, setImportCode] = useState('')
  const [importStatus, setImportStatus] = useState<string>()

  function updateEntry(entryId: string, update: (entry: TargetWorkspaceEntry) => TargetWorkspaceEntry) {
    onWorkspaceChange({ entries: withOrder(visibleEntries.map((entry) => entry.id === entryId ? update(entry) : entry)) })
  }

  function moveEntry(entryId: string, direction: -1 | 1) {
    const index = visibleEntries.findIndex((entry) => entry.id === entryId)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= visibleEntries.length) return
    const next = [...visibleEntries]
    const [entry] = next.splice(index, 1)
    next.splice(nextIndex, 0, entry)
    onWorkspaceChange({ entries: withOrder(next) })
  }

  function moveEntryTo(entryId: string, targetId: string) {
    const index = visibleEntries.findIndex((entry) => entry.id === entryId)
    const targetIndex = visibleEntries.findIndex((entry) => entry.id === targetId)
    if (index < 0 || targetIndex < 0 || index === targetIndex) return
    const next = [...visibleEntries]
    const [entry] = next.splice(index, 1)
    next.splice(targetIndex, 0, entry)
    onWorkspaceChange({ entries: withOrder(next) })
  }

  function beginReorder(entryId: string) {
    setDraggedEntryId(entryId)
    setDropTargetId(entryId)
  }

  function updateDropTarget(clientX: number, clientY: number) {
    const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-item-set-id]')
    if (target?.dataset.itemSetId) setDropTargetId(target.dataset.itemSetId)
  }

  function finishReorder() {
    if (draggedEntryId && dropTargetId) moveEntryTo(draggedEntryId, dropTargetId)
    setDraggedEntryId(null)
    setDropTargetId(null)
  }

  function shareItemSets() {
    setImportStatus(undefined)
    const code = createItemSetWorkspaceShareCode(visibleEntries)
    setShareCode(code)
    if (!navigator.clipboard?.writeText) {
      setShareStatus('Copy the share code below.')
      return
    }
    void navigator.clipboard.writeText(code).then(
      () => setShareStatus('Item-set collection code copied.'),
      () => setShareStatus('Copy the share code below.'),
    )
  }

  function importItemSets() {
    setShareStatus(undefined)
    const result = parseItemSetWorkspaceShareCode(importCode, { items, inventoryItems })
    if (!result.ok) {
      setImportStatus(result.error)
      return
    }
    onImport(result.drafts)
    setImportStatus(`Replaced the column with ${result.drafts.length} item set${result.drafts.length === 1 ? '' : 's'}.`)
  }

  return <section className="item-set-workspace" dir={dir} aria-label="Item sets">
    <header>
      <h2>Item sets</h2>
      <div className="item-set-workspace__header-actions">
        <button type="button" className="item-set-workspace__share" onClick={() => setSharingOpen((open) => !open)} aria-expanded={sharingOpen} aria-controls="item-set-workspace-sharing">share</button>
        <button type="button" className="item-set-workspace__add" onClick={onAdd} aria-label="Add item set"><span aria-hidden="true">+</span></button>
      </div>
    </header>
    {sharingOpen && <section id="item-set-workspace-sharing" className="item-set-workspace__sharing" aria-labelledby="item-set-workspace-sharing-title">
      <div className="item-set-workspace__sharing-header">
        <h3 id="item-set-workspace-sharing-title">share item sets</h3>
        <button type="button" onClick={shareItemSets}>export</button>
      </div>
      {shareStatus && <p className="item-set-workspace__share-status" role="status">{shareStatus}</p>}
      {shareCode && <textarea aria-label="Item set collection share code" value={shareCode} readOnly onFocus={(event) => event.currentTarget.select()} rows={2} />}
      <label htmlFor="item-set-collection-import-code">Import item set collection code</label>
      <div className="item-set-workspace__import-controls">
        <textarea
          id="item-set-collection-import-code"
          aria-label="Import item set collection code"
          placeholder="paste a share code"
          value={importCode}
          onChange={(event) => { setImportCode(event.target.value); setImportStatus(undefined) }}
          rows={2}
        />
        <button type="button" onClick={importItemSets} disabled={importCode.trim() === ''}>replace</button>
      </div>
      <p className="item-set-workspace__sharing-note">Importing replaces every item set in this column.</p>
      {importStatus && <p className={importStatus.startsWith('Replaced') ? 'item-set-workspace__share-status' : 'item-set-workspace__import-error'} role={importStatus.startsWith('Replaced') ? 'status' : 'alert'}>{importStatus}</p>}
    </section>}
    {visibleEntries.map((entry, index) => <ItemSetRow
      key={entry.id}
      entry={entry}
      entryNumber={index + 1}
      items={items}
      icons={icons}
      isDragging={draggedEntryId === entry.id}
      isDropTarget={draggedEntryId !== null && dropTargetId === entry.id && draggedEntryId !== entry.id}
      onToggleEnabled={() => updateEntry(entry.id, (current) => ({ ...current, enabled: !current.enabled }))}
      onMove={(direction) => moveEntry(entry.id, direction)}
      onDragStart={() => beginReorder(entry.id)}
      onDragMove={updateDropTarget}
      onDragEnd={finishReorder}
      onEdit={() => onEdit(entry.id)}
    />)}
  </section>
}
