import type { IconManifest } from '../data/iconManifest'
import type { SearchItem, TargetWorkspaceEntry } from '../domain/types'
import { ItemIcon } from './ItemIcon'

interface ItemSetRowProps {
  entry: TargetWorkspaceEntry
  entryNumber: number
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
  isDragging: boolean
  isDropTarget: boolean
  onToggleEnabled: () => void
  onMove: (direction: -1 | 1) => void
  onDragStart: () => void
  onDragMove: (clientX: number, clientY: number) => void
  onDragEnd: () => void
  onEdit: () => void
}

export function ItemSetRow({
  entry,
  entryNumber,
  items,
  icons,
  isDragging,
  isDropTarget,
  onToggleEnabled,
  onMove,
  onDragStart,
  onDragMove,
  onDragEnd,
  onEdit,
}: ItemSetRowProps) {
  return <article
    className={`item-set-row${isDragging ? ' item-set-row--dragging' : ''}${isDropTarget ? ' item-set-row--drop-target' : ''}`}
    data-item-set-id={entry.id}
    aria-label={`Item set ${entryNumber}`}
  >
    <button
      type="button"
      className="item-set-row__drag-handle"
      aria-label={`Reorder item set ${entryNumber}. Drag to move, or use Alt plus Up or Down Arrow.`}
      onPointerDown={(event) => {
        if (event.isPrimary === false) return
        event.currentTarget.setPointerCapture?.(event.pointerId)
        onDragStart()
      }}
      onPointerMove={(event) => {
        if (event.isPrimary !== false) onDragMove(event.clientX, event.clientY)
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture?.(event.pointerId)
        onDragEnd()
      }}
      onPointerCancel={onDragEnd}
      onKeyDown={(event) => {
        if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
        event.preventDefault()
        onMove(event.key === 'ArrowUp' ? -1 : 1)
      }}
    ><span aria-hidden="true" /></button>
    <button type="button" className="item-set-row__goals" onClick={onEdit} aria-label={`Edit item set ${entryNumber}`}>
      {entry.targetIds.map((itemId) => {
        const item = items.get(itemId)
        return <ItemIcon key={itemId} itemId={itemId} name={item?.name ?? itemId} manifest={icons} />
      })}
      {entry.targetIds.length === 0 && <span>No goals</span>}
    </button>
    <span className="item-set-row__grid" aria-label={`${entry.gridSize} by ${entry.gridSize} crafting grid`}>
      {entry.gridSize}×{entry.gridSize}
    </span>
    <button
      type="button"
      className="item-set-row__enable"
      aria-label={`Enable item set ${entryNumber}`}
      aria-pressed={entry.enabled}
      onClick={onToggleEnabled}
    >
      {entry.enabled ? 'enabled' : 'disabled'}
    </button>
  </article>
}
