function isDocumentScrollbar(event: PointerEvent): boolean {
  const target = event.target
  if (target !== document.documentElement && target !== document.body) return false
  const root = document.documentElement
  return event.clientX >= root.clientWidth || event.clientY >= root.clientHeight
}

export function isScrollbarPointer(event: PointerEvent): boolean {
  if (isDocumentScrollbar(event)) return true
  if (!(event.target instanceof HTMLElement)) return false

  const target = event.target
  const bounds = target.getBoundingClientRect()
  const verticalScrollbarWidth = target.offsetWidth - target.clientWidth
  if (
    target.scrollHeight > target.clientHeight
    && verticalScrollbarWidth > 0
    && event.clientX >= bounds.right - verticalScrollbarWidth
    && event.clientX <= bounds.right
    && event.clientY >= bounds.top
    && event.clientY <= bounds.bottom
  ) return true

  const horizontalScrollbarHeight = target.offsetHeight - target.clientHeight
  return target.scrollWidth > target.clientWidth
    && horizontalScrollbarHeight > 0
    && event.clientY >= bounds.bottom - horizontalScrollbarHeight
    && event.clientY <= bounds.bottom
    && event.clientX >= bounds.left
    && event.clientX <= bounds.right
}

