import { useRef, type ComponentPropsWithoutRef } from 'react'

type TapOrScrollButtonProps = Omit<ComponentPropsWithoutRef<'button'>, 'onClick' | 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'> & {
  onTap: () => void
  onTouchGestureChange?: (active: boolean) => void
}

const TAP_MOVEMENT_THRESHOLD = 8

/**
 * A dropdown option that keeps scrolling and choosing separate on touch
 * screens. A short press selects on release; a vertical pan is left for the
 * menu's scroll area and never becomes a selection.
 */
export function TapOrScrollButton({ onTap, onTouchGestureChange, className, ...buttonProps }: TapOrScrollButtonProps) {
  const activeTouch = useRef<{ id: number; x: number; y: number; moved: boolean } | undefined>(undefined)
  const suppressTouchClick = useRef(false)

  const clearTouchClickSuppression = () => {
    window.setTimeout(() => { suppressTouchClick.current = false }, 0)
  }

  return <button
    {...buttonProps}
    className={`tap-or-scroll-button${className ? ` ${className}` : ''}`}
    onPointerDown={(event) => {
      if (event.pointerType === 'mouse') {
        event.preventDefault()
        return
      }
      activeTouch.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
      suppressTouchClick.current = true
      onTouchGestureChange?.(true)
    }}
    onPointerMove={(event) => {
      const touch = activeTouch.current
      if (touch === undefined || touch.id !== event.pointerId) return
      if (Math.hypot(event.clientX - touch.x, event.clientY - touch.y) >= TAP_MOVEMENT_THRESHOLD) touch.moved = true
    }}
    onPointerCancel={(event) => {
      if (activeTouch.current?.id !== event.pointerId) return
      activeTouch.current = undefined
      onTouchGestureChange?.(false)
      clearTouchClickSuppression()
    }}
    onPointerUp={(event) => {
      const touch = activeTouch.current
      if (touch === undefined || touch.id !== event.pointerId) return
      activeTouch.current = undefined
      onTouchGestureChange?.(false)
      const moved = touch.moved || Math.hypot(event.clientX - touch.x, event.clientY - touch.y) >= TAP_MOVEMENT_THRESHOLD
      if (!moved) onTap()
      clearTouchClickSuppression()
    }}
    onClick={() => {
      if (suppressTouchClick.current) {
        suppressTouchClick.current = false
        return
      }
      onTap()
    }}
  />
}
