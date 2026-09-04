import { useId, useMemo, useState } from 'react'

import type { IconManifest } from '../data/iconManifest'
import { ItemIcon } from './ItemIcon'

interface PickerItem {
  id: string
  name: string
}

interface ItemPickerProps {
  items: ReadonlyMap<string, PickerItem>
  label: string
  selectedIds: readonly string[]
  manifest?: IconManifest
  allowSelection?: (item: PickerItem) => boolean
  onChange: (itemIds: string[]) => void
}

function sortItems(items: Iterable<PickerItem>): PickerItem[] {
  return [...items].sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
}

export function ItemPicker({
  items,
  label,
  selectedIds,
  manifest,
  allowSelection = () => true,
  onChange,
}: ItemPickerProps) {
  const [query, setQuery] = useState('')
  const searchId = useId()
  const searchLabel = label.startsWith('Search ') ? label : `Search ${label}`
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const selectedItems = useMemo(() => sortItems(
    selectedIds.map((itemId) => items.get(itemId)).filter((item): item is PickerItem => item !== undefined),
  ), [items, selectedIds])
  const matches = useMemo(() => sortItems(items.values()).filter((item) =>
    !selected.has(item.id)
    && (normalizedQuery === ''
      || item.name.toLocaleLowerCase().includes(normalizedQuery)
      || item.id.toLocaleLowerCase().includes(normalizedQuery)),
  ).slice(0, 40), [items, normalizedQuery, selected])

  function toggleItem(itemId: string) {
    const next = new Set(selected)
    if (next.has(itemId)) next.delete(itemId)
    else next.add(itemId)
    onChange([...next].sort())
  }

  function option(item: PickerItem) {
    const selectable = allowSelection(item)
    const accessibleName = `${item.name} ${item.id}`
    return <li key={item.id}>
      <label className="item-picker__option">
        <input
          type="checkbox"
          aria-label={accessibleName}
          checked={selected.has(item.id)}
          disabled={!selectable}
          onChange={() => toggleItem(item.id)}
        />
        {manifest && <ItemIcon itemId={item.id} name={item.name} manifest={manifest} size="picker" />}
        <span>{item.name}</span>
        <code>{item.id}</code>
      </label>
    </li>
  }

  return <div className="item-picker">
    <label htmlFor={searchId}>{searchLabel}</label>
    <input
      id={searchId}
      type="search"
      value={query}
      onChange={(event) => setQuery(event.target.value)}
    />
    <ul className="item-picker__results" aria-label={`${label} results`}>
      {selectedItems.map(option)}
      {matches.map(option)}
    </ul>
  </div>
}
