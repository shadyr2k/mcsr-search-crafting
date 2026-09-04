import type { IconManifest } from '../data/iconManifest'
import type { SearchItem, TargetWorkspaceEntry } from '../domain/types'
import { ItemIcon } from './ItemIcon'

interface ItemSetRowProps {
  entry: TargetWorkspaceEntry
  entryNumber: number
  items: ReadonlyMap<string, SearchItem>
  icons: IconManifest
  canMoveUp: boolean
  canMoveDown: boolean
  onToggleEnabled: () => void
  onMove: (direction: -1 | 1) => void
  onEdit: () => void
}

export function ItemSetRow({
  entry,
  entryNumber,
  items,
  icons,
  canMoveUp,
  canMoveDown,
  onToggleEnabled,
  onMove,
  onEdit,
}: ItemSetRowProps) {
  return <article className="item-set-row" aria-label={`Item set ${entryNumber}`}>
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
    <label>
      <input
        type="checkbox"
        checked={entry.enabled}
        onChange={onToggleEnabled}
        aria-label={`Enable item set ${entryNumber}`}
      />
      Enabled
    </label>
      <button type="button" disabled={!canMoveUp} onClick={() => onMove(-1)} aria-label={`Move item set ${entryNumber} up`}>↟</button>
      <button type="button" disabled={!canMoveDown} onClick={() => onMove(1)} aria-label={`Move item set ${entryNumber} down`}>↡</button>
  </article>
}
