import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { RankedSearch } from '../domain/types'
import { KeyboardPlayback } from './KeyboardPlayback'

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
  const lit = () => [...container.querySelectorAll('.keyboard-visual__key:has(.keyboard-visual__light)')].map((key) => key.getAttribute('data-code'))
  expect(lit()).toEqual(['KeyX'])
  act(() => vi.advanceTimersByTime(650))
  expect(lit()).toEqual(['KeyC'])
  act(() => vi.advanceTimersByTime(650))
  expect(lit()).toEqual(['Mouse3'])
  act(() => vi.advanceTimersByTime(650))
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
  expect(screen.getByText(/Unmapped characters: ø/)).toBeTruthy()
  expect(container.querySelector('.keyboard-visual__light')).toBeNull()
})
