import { useId, useMemo, useState } from 'react'

import type { InventoryItem } from '../domain/types'

interface ItemPickerProps {
  items: ReadonlyMap<string, InventoryItem>
  label: string
  selectedItemIds: readonly string[]
  onSelectedItemIdsChange: (itemIds: string[]) => void
}

function sortItems(items: Iterable<InventoryItem>): InventoryItem[] {
  return [...items].sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
}

export function ItemPicker({ items, label, selectedItemIds, onSelectedItemIdsChange }: ItemPickerProps) {
  const [query, setQuery] = useState('')
  const searchId = useId()
  const selected = useMemo(() => new Set(selectedItemIds), [selectedItemIds])
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matches = useMemo(() => sortItems(items.values()).filter((item) =>
    normalizedQuery === ''
      || item.name.toLocaleLowerCase().includes(normalizedQuery)
      || item.id.toLocaleLowerCase().includes(normalizedQuery),
  ).slice(0, 30), [items, normalizedQuery])

  function toggleItem(itemId: string) {
    const next = new Set(selected)
    if (next.has(itemId)) next.delete(itemId)
    else next.add(itemId)
    onSelectedItemIdsChange([...next].sort())
  }

  return <div className="item-picker">
    <label htmlFor={searchId}>{label}</label>
    <input
      id={searchId}
      type="search"
      value={query}
      onChange={(event) => setQuery(event.target.value)}
    />
    <ul className="item-picker__results" aria-label={`${label} results`}>
      {matches.map((item) => <li key={item.id}>
        <label className="item-picker__option">
          <input
            type="checkbox"
            checked={selected.has(item.id)}
            onChange={() => toggleItem(item.id)}
          />
          <span>{item.name}</span>
          <code>{item.id}</code>
        </label>
      </li>)}
    </ul>
  </div>
}
