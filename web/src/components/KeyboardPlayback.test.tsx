import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { RankedSearch } from '../domain/types'
import { KeyboardPlayback } from './KeyboardPlayback'
import { KeyboardVisualization } from './KeyboardVisualization'

afterEach(() => { cleanup(); vi.useRealTimers() })

const search = { steps: [
  { query: 'se', typedSuffix: 'se', retainedPrefix: '', freeBackspaceCount: 0 },
  { query: 'sa', typedSuffix: 'a', retainedPrefix: 's', freeBackspaceCount: 1 },
  { query: 'b', typedSuffix: 'b', retainedPrefix: '', freeBackspaceCount: 2 },
] } as RankedSearch
const settings = { mappings: { KeyX: 's', KeyC: 'e' }, controls: { chat: 'Mouse3', backspace: 'Backspace', shift: 'ShiftLeft', home: 'Home' } }

test('translates keys and plays chat, backspace, and simultaneous replacement in order', () => {
  vi.useFakeTimers()
  const { container } = render(<KeyboardPlayback search={search} settings={settings} />)
  expect(screen.getByLabelText('Your keys').textContent).toBe('your keysxc(mouse 4)(backspace)a(mouse 4)(shift + home)b')
  expect(screen.queryByText(/blue: type/)).toBeNull()
  expect(container.querySelector('.keyboard-playback__actions small')).toBeNull()
  expect(container.querySelectorAll('.keyboard-visual__label')).toHaveLength(0)
  expect(container.querySelector('[data-code="KeyX"]')?.getAttribute('aria-label')).toBe('x')
  expect(container.querySelector('[data-code="Mouse3"]')?.getAttribute('aria-label')).toBe('mouse 4')
  const lit = () => [...container.querySelectorAll('.keyboard-visual__key:has(.keyboard-visual__light)')].map((key) => key.getAttribute('data-code'))
  expect(lit()).toEqual(['KeyX'])
  act(() => vi.advanceTimersByTime(519))
  expect(lit()).toEqual(['KeyX'])
  act(() => vi.advanceTimersByTime(1))
  expect(lit()).toEqual(['KeyC'])
  act(() => vi.advanceTimersByTime(520))
  expect(lit()).toEqual(['Mouse3'])
  act(() => vi.advanceTimersByTime(520))
  expect(lit()).toEqual(['Backspace'])
  expect(container.querySelector('.keyboard-visual__light--backspace')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'pause sequence' }))
  act(() => vi.advanceTimersByTime(3000))
  expect(lit()).toEqual(['Backspace'])
  for (let index = 0; index < 3; index++) fireEvent.click(screen.getByRole('button', { name: 'next key' }))
  expect(lit()).toEqual(['Home', 'ShiftLeft'])
  expect(container.querySelectorAll('.keyboard-visual__light--replace')).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'replay sequence' }))
  expect(lit()).toEqual(['KeyX'])
})

test('shortens the pause between repeats by the same 25 percent speed increase', () => {
  vi.useFakeTimers()
  const { container } = render(<KeyboardPlayback search={{ steps: [search.steps[0]] } as RankedSearch} settings={settings} />)
  const lit = () => container.querySelector('.keyboard-visual__key:has(.keyboard-visual__light)')?.getAttribute('data-code')
  act(() => vi.advanceTimersByTime(520))
  expect(lit()).toBe('KeyC')
  act(() => vi.advanceTimersByTime(1199))
  expect(lit()).toBe('KeyC')
  act(() => vi.advanceTimersByTime(1))
  expect(lit()).toBe('KeyX')
})

test('keeps labels on the editable keyboard and mouse', () => {
  render(<KeyboardVisualization settings={settings} onSelect={() => undefined} />)
  expect(screen.getByRole('button', { name: 'Rebind x → s' }).textContent).toBe('s')
  expect(screen.getByRole('button', { name: 'Rebind mouse 5' }).textContent).toBe('5')
})

test('omits unbound controls and supports manual stepping with animations removed', () => {
  vi.useFakeTimers()
  const { container, rerender } = render(<KeyboardPlayback search={search} settings={{ mappings: {}, controls: {} }} removeAnimations />)
  expect(screen.getByLabelText('Your keys').textContent).toBe('your keysseab')
  expect(screen.queryByRole('button', { name: 'pause sequence' })).toBeNull()
  act(() => vi.advanceTimersByTime(5000))
  expect(container.querySelector('.keyboard-visual__key:has(.keyboard-visual__light)')?.getAttribute('data-code')).toBe('KeyS')
  fireEvent.click(screen.getByRole('button', { name: 'next key' }))
  expect(container.querySelector('.keyboard-visual__key:has(.keyboard-visual__light)')?.getAttribute('data-code')).toBe('KeyE')
  rerender(<KeyboardPlayback search={{ steps: [{ query: 'ø', typedSuffix: 'ø', retainedPrefix: '', freeBackspaceCount: 0 }] } as RankedSearch} settings={{ mappings: {}, controls: {} }} removeAnimations />)
  expect(screen.getByText('Unmapped characters: ø')).toBeTruthy()
  expect(container.querySelector('.keyboard-visual__light')).toBeNull()
})
