import type { IconManifest } from '../data/iconManifest'
import type { SearchItem, TargetWorkspace, TargetWorkspaceEntry } from '../domain/types'
import { ItemSetRow } from './ItemSetRow'

interface ItemSetWorkspaceProps {
  entries: readonly TargetWorkspaceEntry[]
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
  onWorkspaceChange: (workspace: TargetWorkspace) => void
  onEdit: (entryId: string) => void
  onAdd: () => void
}

function ordered(entries: readonly TargetWorkspaceEntry[]): TargetWorkspaceEntry[] {
  return [...entries].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
}

function withOrder(entries: readonly TargetWorkspaceEntry[]): TargetWorkspaceEntry[] {
  return entries.map((entry, order) => ({ ...entry, order }))
}

export function ItemSetWorkspace({ entries, items, icons, onWorkspaceChange, onEdit, onAdd }: ItemSetWorkspaceProps) {
  const visibleEntries = ordered(entries)

  function updateEntry(entryId: string, update: (entry: TargetWorkspaceEntry) => TargetWorkspaceEntry) {
    onWorkspaceChange({ entries: withOrder(visibleEntries.map((entry) => entry.id === entryId ? update(entry) : entry)) })
  }

  function moveEntry(index: number, direction: -1 | 1) {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= visibleEntries.length) return
    const next = [...visibleEntries]
    const [entry] = next.splice(index, 1)
    next.splice(nextIndex, 0, entry)
    onWorkspaceChange({ entries: withOrder(next) })
  }

  return <section className="item-set-workspace" aria-label="Item sets">
    <header>
      <h2>Item sets</h2>
      <button type="button" onClick={onAdd}>Add item set</button>
    </header>
    {visibleEntries.map((entry, index) => <ItemSetRow
      key={entry.id}
      entry={entry}
      entryNumber={index + 1}
      items={items}
      icons={icons}
      canMoveUp={index > 0}
      canMoveDown={index < visibleEntries.length - 1}
      onToggleEnabled={() => updateEntry(entry.id, (current) => ({ ...current, enabled: !current.enabled }))}
      onMove={(direction) => moveEntry(index, direction)}
      onEdit={() => onEdit(entry.id)}
    />)}
  </section>
}
