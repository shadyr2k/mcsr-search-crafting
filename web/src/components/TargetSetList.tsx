import { useId, useMemo, useState } from 'react'

import type { CraftingRecipe, SearchItem, TargetWorkspace, TargetWorkspaceEntry } from '../domain/types'
import { targetSupports2x2 } from '../engine/craftability'

interface TargetSetListProps {
  items: ReadonlyMap<string, SearchItem>
  recipes: readonly CraftingRecipe[]
  workspace: TargetWorkspace
  onWorkspaceChange: (workspace: TargetWorkspace) => void
}

function orderedEntries(entries: readonly TargetWorkspaceEntry[]): TargetWorkspaceEntry[] {
  return [...entries].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
}

function freshEntryId(entries: readonly TargetWorkspaceEntry[]): string {
  const existing = new Set(entries.map((entry) => entry.id))
  const base = globalThis.crypto?.randomUUID?.() ?? String(Date.now())
  let candidate = `target-set-${base}`
  let suffix = 1
  while (existing.has(candidate)) candidate = `target-set-${base}-${suffix++}`
  return candidate
}

function withUpdatedEntry(
  workspace: TargetWorkspace,
  entryId: string,
  update: (entry: TargetWorkspaceEntry) => TargetWorkspaceEntry,
): TargetWorkspace {
  return { entries: workspace.entries.map((entry) => entry.id === entryId ? update(entry) : entry) }
}

function orderedWorkspace(entries: readonly TargetWorkspaceEntry[]): TargetWorkspace {
  return { entries: entries.map((entry, order) => ({ ...entry, order })) }
}

export function TargetSetList({ items, recipes, workspace, onWorkspaceChange }: TargetSetListProps) {
  const [queries, setQueries] = useState<Record<string, string>>({})
  const queryPrefix = useId()
  const entries = orderedEntries(workspace.entries)

  function addSet() {
    const id = freshEntryId(workspace.entries)
    onWorkspaceChange({
      entries: [...workspace.entries, {
        id,
        targetIds: [],
        inventoryItemIds: [],
        enabled: true,
        gridSize: 3,
        order: workspace.entries.length,
      }],
    })
    setQueries((current) => ({ ...current, [id]: '' }))
  }

  function addTarget(entry: TargetWorkspaceEntry, targetId: string) {
    if (entry.targetIds.includes(targetId)) return
    const targetIds = [...entry.targetIds, targetId]
    const allSupport2x2 = targetIds.every((id) => targetSupports2x2(id, [...recipes]))
    onWorkspaceChange(withUpdatedEntry(workspace, entry.id, (current) => ({
      ...current,
      targetIds,
      gridSize: allSupport2x2 ? current.gridSize : 3,
    })))
    setQueries((current) => ({ ...current, [entry.id]: '' }))
  }

  function removeTarget(entry: TargetWorkspaceEntry, targetId: string) {
    onWorkspaceChange(withUpdatedEntry(workspace, entry.id, (current) => ({
      ...current,
      targetIds: current.targetIds.filter((id) => id !== targetId),
    })))
  }

  function moveEntry(entryId: string, delta: number) {
    const index = entries.findIndex((entry) => entry.id === entryId)
    const nextIndex = index + delta
    if (index < 0 || nextIndex < 0 || nextIndex >= entries.length) return
    const next = [...entries]
    ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
    onWorkspaceChange(orderedWorkspace(next))
  }

  return <section className="tool-panel target-set-list" aria-labelledby="target-sets-heading">
    <div className="tool-panel__heading">
      <p className="eyebrow">Search goals</p>
      <h2 id="target-sets-heading">Target sets</h2>
      <p>Each enabled set will be optimized independently.</p>
    </div>
    <button type="button" className="primary-action" onClick={addSet}>Add target set</button>

    <div className="target-set-list__entries">
      {entries.length === 0 && <p className="empty-state">Add a set to start selecting crafted outputs.</p>}
      {entries.map((entry, index) => <TargetSetEditor
        key={entry.id}
        entry={entry}
        entryLabel={String(index + 1)}
        items={items}
        recipes={recipes}
        query={queries[entry.id] ?? ''}
        queryId={`${queryPrefix}-${entry.id}`}
        canMoveUp={index > 0}
        canMoveDown={index < entries.length - 1}
        onQueryChange={(query) => setQueries((current) => ({ ...current, [entry.id]: query }))}
        onAddTarget={(targetId) => addTarget(entry, targetId)}
        onRemoveTarget={(targetId) => removeTarget(entry, targetId)}
        onChange={(update) => onWorkspaceChange(withUpdatedEntry(workspace, entry.id, update))}
        onMove={(delta) => moveEntry(entry.id, delta)}
        onRemoveSet={() => {
          onWorkspaceChange({ entries: workspace.entries.filter((candidate) => candidate.id !== entry.id) })
          setQueries((current) => {
            const remaining = { ...current }
            delete remaining[entry.id]
            return remaining
          })
        }}
      />)}
    </div>
  </section>
}

interface TargetSetEditorProps {
  entry: TargetWorkspaceEntry
  entryLabel: string
  items: ReadonlyMap<string, SearchItem>
  recipes: readonly CraftingRecipe[]
  query: string
  queryId: string
  canMoveUp: boolean
  canMoveDown: boolean
  onQueryChange: (query: string) => void
  onAddTarget: (targetId: string) => void
  onRemoveTarget: (targetId: string) => void
  onChange: (update: (entry: TargetWorkspaceEntry) => TargetWorkspaceEntry) => void
  onMove: (delta: number) => void
  onRemoveSet: () => void
}

function TargetSetEditor({
  entry,
  entryLabel,
  items,
  recipes,
  query,
  queryId,
  canMoveUp,
  canMoveDown,
  onQueryChange,
  onAddTarget,
  onRemoveTarget,
  onChange,
  onMove,
  onRemoveSet,
}: TargetSetEditorProps) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const candidates = useMemo(() => [...items.values()].filter((item) =>
    !entry.targetIds.includes(item.id) && (normalizedQuery === ''
      || item.name.toLocaleLowerCase().includes(normalizedQuery)
      || item.id.toLocaleLowerCase().includes(normalizedQuery)),
  ).sort((left, right) => left.name.localeCompare(right.name)).slice(0, 12), [entry.targetIds, items, normalizedQuery])
  const incompatibleTargets = entry.targetIds.filter((targetId) => !targetSupports2x2(targetId, [...recipes]))
  const canUse2x2 = incompatibleTargets.length === 0

  return <article className="target-set" aria-labelledby={`target-set-${entry.id}`}>
    <header>
      <h3 id={`target-set-${entry.id}`}>Target set {entryLabel}</h3>
      <div className="target-set__controls">
        <button type="button" onClick={() => onMove(-1)} disabled={!canMoveUp}>Move set {entryLabel} up</button>
        <button type="button" onClick={() => onMove(1)} disabled={!canMoveDown}>Move set {entryLabel} down</button>
        <button type="button" onClick={onRemoveSet}>Remove set {entryLabel}</button>
      </div>
    </header>

    <label className="toggle-control">
      <input
        type="checkbox"
        checked={entry.enabled}
        onChange={(event) => onChange((current) => ({ ...current, enabled: event.target.checked }))}
      />
      Enable set {entryLabel}
    </label>

    <fieldset className="grid-choice">
      <legend>Crafting grid</legend>
      <label><input type="radio" name={`grid-${entry.id}`} checked={entry.gridSize === 3}
        onChange={() => onChange((current) => ({ ...current, gridSize: 3 }))} />3x3 grid</label>
      <label><input type="radio" name={`grid-${entry.id}`} checked={entry.gridSize === 2} disabled={!canUse2x2}
        onChange={() => onChange((current) => ({ ...current, gridSize: 2 }))} />2x2 grid</label>
    </fieldset>

    {!canUse2x2 && <p className="grid-error" role="alert">
      {incompatibleTargets.map((targetId) => `${items.get(targetId)?.name ?? targetId} cannot be crafted in a 2x2 grid.`).join(' ')}
    </p>}

    <label htmlFor={queryId}>Search targets for set {entryLabel}</label>
    <input id={queryId} type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} />
    {candidates.length > 0 && <ul className="target-candidates" aria-label={`Target candidates for set ${entryLabel}`}>
      {candidates.map((candidate) => <li key={candidate.id}>
        <button type="button" onClick={() => onAddTarget(candidate.id)}>Add {candidate.name}</button>
        <code>{candidate.id}</code>
      </li>)}
    </ul>}

    {entry.targetIds.length === 0 ? <>
      <p>No targets yet.</p>
      <p className="empty-target-note">Empty sets are saved but are not scored until you add a target.</p>
    </> : <ul className="target-list">
      {entry.targetIds.map((targetId) => <li key={targetId}>
        <span>{items.get(targetId)?.name ?? targetId}</span>
        <button type="button" onClick={() => onRemoveTarget(targetId)}>Remove {items.get(targetId)?.name ?? targetId} from set {entryLabel}</button>
      </li>)}
    </ul>}
  </article>
}
