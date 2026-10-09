import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'

import type { IconManifest } from '../data/iconManifest'
import { normalizeExactSearchText } from '../engine/search'
import { ItemIcon } from './ItemIcon'
import { isScrollbarPointer } from './outsidePointer'
import { TapOrScrollButton } from './TapOrScrollButton'
import './ItemPicker.css'

interface PickerItem {
  id: string
  name: string
}

interface ItemPickerProps {
  items: ReadonlyMap<string, PickerItem>
  label: string
  displayLabel?: string
  revealOnAdd?: boolean
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
  displayLabel,
  revealOnAdd = false,
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
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const scrollbarPointerRef = useRef(false)
  const optionTouchActiveRef = useRef(false)
  const pointerActiveRef = useRef(false)
  const pointerStartedInsideRef = useRef(false)
  const suppressTouchClickRef = useRef(false)
  const pointerStartRef = useRef({ x: 0, y: 0 })
  const searchId = useId()
  const searchLabel = label.startsWith('Search ') ? label : `Search ${label}`
  const itemLabel = (displayLabel ?? label).toLowerCase()
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
    function recordPointerStart(event: PointerEvent) {
      pointerActiveRef.current = true
      suppressTouchClickRef.current = false
      pointerStartRef.current = { x: event.clientX, y: event.clientY }
      pointerStartedInsideRef.current = !!pickerRef.current && event.composedPath().includes(pickerRef.current)
      if (isScrollbarPointer(event)) {
        scrollbarPointerRef.current = true
        window.setTimeout(() => { scrollbarPointerRef.current = false })
        return
      }
    }

    function closeOutside() {
      setOpen(false)
      if (document.activeElement === searchInputRef.current) searchInputRef.current?.blur()
    }

    function finishPointer(event: PointerEvent) {
      window.setTimeout(() => { pointerActiveRef.current = false }, 0)
      // A tap that stops touch momentum may have no compatibility click.
      // Defer collapse until after any normal click has activated its target.
      if (event.type === 'pointerup' && event.pointerType === 'touch'
        && !pointerStartedInsideRef.current && pickerRef.current
        && !event.composedPath().includes(pickerRef.current)
        && Math.hypot(event.clientX - pointerStartRef.current.x, event.clientY - pointerStartRef.current.y) < 8) {
        window.requestAnimationFrame(() => {
          if (!pointerStartedInsideRef.current) closeOutside()
        })
      }
    }

    function suppressCompatibilityClick(event: MouseEvent) {
      if (event.detail !== 0 && suppressTouchClickRef.current) {
        // The item was already selected on touch release. Its removed tile can
        // retarget this click to another item or a control underneath the menu.
        suppressTouchClickRef.current = false
        pointerStartedInsideRef.current = false
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }

    // Inline pickers change the document height when dismissed. Wait until the
    // outside click completes so its target does not move between press/release.
    function closeAfterOutsideClick(event: MouseEvent) {
      const startedInside = event.detail !== 0 && pointerStartedInsideRef.current
      pointerStartedInsideRef.current = false
      if (pickerRef.current && !startedInside && !event.composedPath().includes(pickerRef.current)) {
        closeOutside()
      }
    }

    window.addEventListener('pointerdown', recordPointerStart, true)
    window.addEventListener('pointerup', finishPointer)
    window.addEventListener('pointercancel', finishPointer)
    window.addEventListener('click', closeAfterOutsideClick)
    window.addEventListener('click', suppressCompatibilityClick, true)
    return () => {
      window.removeEventListener('pointerdown', recordPointerStart, true)
      window.removeEventListener('pointerup', finishPointer)
      window.removeEventListener('pointercancel', finishPointer)
      window.removeEventListener('click', closeAfterOutsideClick)
      window.removeEventListener('click', suppressCompatibilityClick, true)
    }
  }, [])

  useEffect(() => {
    onOpenChange?.(open)
  }, [onOpenChange, open])

  useEffect(() => {
    if (revealOnAdd && open) searchInputRef.current?.focus()
  }, [revealOnAdd, open])

  function dismissPicker() {
    setOpen(false)
    addButtonRef.current?.focus()
  }

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
        onTouchGestureChange={(active) => {
          optionTouchActiveRef.current = active
          if (active) suppressTouchClickRef.current = true
        }}
      >
        {manifest && <ItemIcon itemId={item.id} name={item.name} manifest={manifest} size="compact" />}
        <span>{item.name}</span>
      </TapOrScrollButton>
    </li>
  }

  return <div
    ref={pickerRef}
    className={`item-picker${revealOnAdd ? ' item-picker--add' : ''}${className ? ` ${className}` : ''}`}
    onKeyDown={(event) => {
      if (open && event.key === 'Escape') {
        event.stopPropagation()
        dismissPicker()
      }
    }}
    onBlurCapture={(event) => {
      if (scrollbarPointerRef.current || optionTouchActiveRef.current || pointerActiveRef.current) return
      // Mobile keyboards and removed touch options can blur without a new
      // focus target. Only a definite move outside (or an outside tap) dismisses.
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false)
    }}
  >
    {revealOnAdd
      ? <span className="item-picker__title">{displayLabel ?? searchLabel}</span>
      : <label htmlFor={searchId}>{displayLabel ?? searchLabel}</label>}
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
        {revealOnAdd && <button
          ref={addButtonRef}
          type="button"
          className="item-picker__add"
          aria-label={`Add ${itemLabel}`}
          aria-expanded={open}
          aria-controls={open ? `${searchId}-picker` : undefined}
          onClick={() => open ? searchInputRef.current?.focus() : setOpen(true)}
        >+</button>}
      </div>
      {trailingAction}
    </div>
    {(!revealOnAdd || open) && <div id={`${searchId}-picker`} className="item-picker__search-panel">
      <div className="item-picker__search-controls">
        <input
          id={searchId}
          ref={searchInputRef}
          type="search"
          aria-label={searchLabel}
          placeholder={displayLabel ? `Search to add ${displayLabel.toLowerCase()}` : undefined}
          value={query}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {open && <ul className="item-picker__results" aria-label={`${label} results`}>
        {matches.map(option)}
      </ul>}
    </div>}
  </div>
}
