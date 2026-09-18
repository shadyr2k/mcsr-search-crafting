import { describe, expect, test, vi } from 'vitest'

import { isScrollbarPointer } from './outsidePointer'

function scrollbarElement(): HTMLElement {
  const element = document.createElement('div')
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, bottom: 100, right: 100, width: 100, height: 100, toJSON: () => ({}),
  })
  Object.defineProperties(element, {
    offsetWidth: { value: 100 },
    clientWidth: { value: 84 },
    offsetHeight: { value: 100 },
    clientHeight: { value: 100 },
    scrollHeight: { value: 240 },
    scrollWidth: { value: 84 },
  })
  return element
}

describe('isScrollbarPointer', () => {
  test('keeps a press on a scrollable menu’s scrollbar inside the menu', () => {
    const target = scrollbarElement()

    expect(isScrollbarPointer({ target, clientX: 96, clientY: 50 } as unknown as PointerEvent)).toBe(true)
    expect(isScrollbarPointer({ target, clientX: 50, clientY: 50 } as unknown as PointerEvent)).toBe(false)
  })
})

