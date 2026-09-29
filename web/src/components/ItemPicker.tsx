import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'

import type { IconManifest } from '../data/iconManifest'
import { normalizeExactSearchText } from '../engine/search'
import { ItemIcon } from './ItemIcon'
import { isScrollbarPointer } from './outsidePointer'
import { TapOrScrollButton } from './TapOrScrollButton'

interface PickerItem {
  id: string
  name: string
}

interface ItemPickerProps {
  items: ReadonlyMap<string, PickerItem>
  label: string
  selectedIds: readonly string[]
  manifest?: IconManifest
  preserveSelectionOrder?: boolean
  allowSelection?: (item: PickerItem) => boolean
  className?: string
  trailingAction?: ReactNode
  onOpenChange?: (open: boolean) => void
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
  preserveSelectionOrder = false,
  allowSelection = () => true,
  className,
  trailingAction,
  onOpenChange,
  onChange,
}: ItemPickerProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const scrollbarPointerRef = useRef(false)
  const optionTouchActiveRef = useRef(false)
  const searchId = useId()
  const searchLabel = label.startsWith('Search ') ? label : `Search ${label}`
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const normalizedQuery = normalizeExactSearchText(query.trim())
  const selectedItems = useMemo(() => {
    const uniqueSelectedIds = [...new Set(selectedIds)]
    const selectedItems = uniqueSelectedIds
      .map((itemId) => items.get(itemId))
      .filter((item): item is PickerItem => item !== undefined)

    return preserveSelectionOrder ? selectedItems : sortItems(selectedItems)
  }, [items, preserveSelectionOrder, selectedIds])
  const matches = useMemo(() => sortItems(items.values()).filter((item) =>
    !selected.has(item.id)
    && (normalizedQuery === ''
      || normalizeExactSearchText(item.name).includes(normalizedQuery)
      || normalizeExactSearchText(item.id).includes(normalizedQuery)),
  ).slice(0, 40), [items, normalizedQuery, selected])

  useEffect(() => {
    function closeWhenPointerLeavesPicker(event: PointerEvent) {
      if (isScrollbarPointer(event)) {
        scrollbarPointerRef.current = true
        window.setTimeout(() => { scrollbarPointerRef.current = false })
        return
      }
      if (pickerRef.current && event.target instanceof Node && !pickerRef.current.contains(event.target)) setOpen(false)
    }

    window.addEventListener('pointerdown', closeWhenPointerLeavesPicker)
    return () => window.removeEventListener('pointerdown', closeWhenPointerLeavesPicker)
  }, [])

  useEffect(() => {
    onOpenChange?.(open)
  }, [onOpenChange, open])

  function toggleItem(itemId: string) {
    if (preserveSelectionOrder) {
      const uniqueSelectedIds = [...new Set(selectedIds)]
      onChange(selected.has(itemId)
        ? uniqueSelectedIds.filter((selectedItemId) => selectedItemId !== itemId)
        : [...uniqueSelectedIds, itemId])
      return
    }

    const next = new Set(selected)
    if (next.has(itemId)) next.delete(itemId)
    else next.add(itemId)
    onChange([...next].sort())
  }

  function selectItem(itemId: string) {
    toggleItem(itemId)
    window.setTimeout(() => searchInputRef.current?.focus(), 0)
  }

  function option(item: PickerItem) {
    const selectable = allowSelection(item)
    return <li key={item.id}>
      <TapOrScrollButton
        type="button"
        className="item-picker__option"
        aria-label={item.name}
        disabled={!selectable}
        onTap={() => selectItem(item.id)}
        onTouchGestureChange={(active) => { optionTouchActiveRef.current = active }}
      >
        {manifest && <ItemIcon itemId={item.id} name={item.name} manifest={manifest} size="compact" />}
        <span>{item.name}</span>
      </TapOrScrollButton>
    </li>
  }

  return <div
    ref={pickerRef}
    className={`item-picker${className ? ` ${className}` : ''}`}
    onBlurCapture={(event) => {
      if (scrollbarPointerRef.current || optionTouchActiveRef.current) return
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
    }}
  >
    <label htmlFor={searchId}>{searchLabel}</label>
    <div className={`item-picker__selection-row${trailingAction ? ' item-picker__selection-row--has-action' : ''}`}>
      <div className="item-picker__selected" role="region" aria-label={`${label} selected items`}>
        {selectedItems.length === 0
          ? <span className="item-picker__empty">none selected</span>
          : selectedItems.map((item) => <button
              key={item.id}
              type="button"
              className="item-picker__selected-item"
              aria-label={`Remove ${item.name}`}
              title={`Remove ${item.name}`}
              onClick={() => toggleItem(item.id)}
            >
              {manifest
                ? <ItemIcon itemId={item.id} name={item.name} manifest={manifest} size="compact" />
                : <span>{item.name}</span>}
            </button>)}
      </div>
      {trailingAction}
    </div>
    <input
      id={searchId}
      ref={searchInputRef}
      type="search"
      value={query}
      onFocus={() => setOpen(true)}
      onClick={() => setOpen(true)}
      onChange={(event) => setQuery(event.target.value)}
    />
    {open && <ul className="item-picker__results" aria-label={`${label} results`}>
      {matches.map(option)}
    </ul>}
  </div>
}
