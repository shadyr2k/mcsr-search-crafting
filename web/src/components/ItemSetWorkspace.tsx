import { useState, type ReactNode } from 'react'

import type { IconManifest } from '../data/iconManifest'
import type { SearchItem, TargetWorkspace, TargetWorkspaceEntry } from '../domain/types'
import { ItemSetRow } from './ItemSetRow'

interface ItemSetWorkspaceProps {
  dir?: 'ltr' | 'rtl'
  entries: readonly TargetWorkspaceEntry[]
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
  onWorkspaceChange: (workspace: TargetWorkspace) => void
  onEdit: (entryId: string) => void
  onAdd: () => void
  editor?: ReactNode
}

function ordered(entries: readonly TargetWorkspaceEntry[]): TargetWorkspaceEntry[] {
  return [...entries].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
}

function withOrder(entries: readonly TargetWorkspaceEntry[]): TargetWorkspaceEntry[] {
  return entries.map((entry, order) => ({ ...entry, order }))
}

export function ItemSetWorkspace({ dir, entries, items, icons, onWorkspaceChange, onEdit, onAdd, editor }: ItemSetWorkspaceProps) {
  const visibleEntries = ordered(entries)
  const [draggedEntryId, setDraggedEntryId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

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

  return <section className="item-set-workspace" dir={dir} aria-label="Item sets">
    <header>
      <h2>Item sets</h2>
      <button type="button" className="item-set-workspace__add" onClick={onAdd} aria-label="Add item set"><span aria-hidden="true">+</span></button>
    </header>
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
    {editor && <div className="item-set-workspace__editor-overlay">{editor}</div>}
  </section>
}
