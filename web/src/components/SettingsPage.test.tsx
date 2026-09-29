import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { DEFAULT_SCORING_SETTINGS } from '../engine/scoring'
import { SettingsPage } from './SettingsPage'
import { DEFAULT_KEYBOARD_SETTINGS } from '../domain/keyboard'

afterEach(cleanup)

const settings = {
  scoring: DEFAULT_SCORING_SETTINGS,
  itemIdSearch: false,
  hideNumberCraftsByDefault: false,
  removeAnimations: false,
  compactLayout: false,
  catifyItems: false,
  keyboard: DEFAULT_KEYBOARD_SETTINGS,
}

describe('SettingsPage', () => {
  test('detects controls from custom outputs, allows clearing detection, and accepts pasted characters', () => {
    const onSave = vi.fn()
    render(<SettingsPage settings={settings} onSave={onSave} onResetCalculationCache={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Rebind r' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'New output for r' }), { key: 'Backspace', code: 'Backspace' })
    expect(screen.getByRole('button', { name: 'Bind backspace' }).textContent).toBe('r (detected)')
    fireEvent.click(screen.getByRole('button', { name: 'Clear backspace' }))
    expect(screen.getByRole('button', { name: 'Bind backspace' }).textContent).toBe('unbound')
    fireEvent.click(screen.getByRole('button', { name: 'Rebind x' }))
    const input = screen.getByRole('textbox', { name: 'New output for x' })
    fireEvent.keyDown(input, { key: 'Control', code: 'ControlLeft', ctrlKey: true })
    fireEvent.keyDown(input, { key: 'v', code: 'KeyV', ctrlKey: true })
    fireEvent.paste(input, { clipboardData: { getData: () => 'ø' } })
    fireEvent.click(screen.getByRole('button', { name: 'save settings' }))
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ keyboard: { mappings: { KeyR: 'Backspace', KeyX: 'ø' }, controls: { backspace: '' } } }))
  })

  test('captures custom outputs, excludes shadowed defaults, and prevents duplicate custom bindings', () => {
    const onSave = vi.fn()
    render(<SettingsPage settings={settings} onSave={onSave} onResetCalculationCache={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Rebind x' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'New output for x' }), { key: 's', code: 'KeyS' })
    expect(screen.getByRole('button', { name: 'Rebind s (conflict, unused)' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'save settings' }))
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ keyboard: { mappings: { KeyX: 's' }, controls: {} } }))
    fireEvent.click(screen.getByRole('button', { name: 'Rebind c' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'New output for c' }), { key: 's', code: 'KeyS' })
    expect(screen.getByRole('button', { name: 'Rebind x → s (conflict, unused)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Rebind c → s (conflict, unused)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'save settings' }).hasAttribute('disabled')).toBe(true)
    fireEvent.submit(screen.getByRole('button', { name: 'save settings' }).closest('form')!)
    expect(onSave).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Rebind c → s (conflict, unused)' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'New output for c' }), { key: 'e', code: 'KeyE' })
    expect(screen.getByRole('button', { name: 'save settings' }).hasAttribute('disabled')).toBe(false)
  })

  test('binds and clears a mouse chat control and supports mobile text input', () => {
    const onSave = vi.fn()
    render(<SettingsPage settings={settings} onSave={onSave} onResetCalculationCache={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Bind chat key' }))
    fireEvent(screen.getByRole('textbox', { name: 'New binding for chat key' }), new MouseEvent('pointerdown', { button: 3, bubbles: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Rebind x' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New output for x' }), { target: { value: 's' } })
    fireEvent.click(screen.getByRole('button', { name: 'save settings' }))
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ keyboard: { mappings: { KeyX: 's' }, controls: { chat: 'Mouse3' } } }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear chat key' }))
    fireEvent.click(screen.getByRole('button', { name: 'save settings' }))
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ keyboard: { mappings: { KeyX: 's' }, controls: {} } }))
  })

  test('resets calculated scores and crafts without changing the saved workspace controls', () => {
    const onResetCalculationCache = vi.fn()
    render(<SettingsPage settings={settings} onSave={vi.fn()} onResetCalculationCache={onResetCalculationCache} />)

    fireEvent.click(screen.getByRole('button', { name: 'reset calculation cache' }))

    expect(onResetCalculationCache).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/Your item sets, craft-sheet choices, and site settings stay saved/i)).toBeTruthy()
  })

  test('disables the reset action while stored results are being cleared', () => {
    render(<SettingsPage settings={settings} onSave={vi.fn()} onResetCalculationCache={vi.fn()} calculationCacheResetting />)

    expect(screen.getByRole('button', { name: 'resetting cache…' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('status').textContent).toBe('clearing saved results…')
  })

  test('keeps every score setting under search settings and exposes compact step controls', () => {
    const onSave = vi.fn()
    const view = render(<SettingsPage settings={settings} onSave={onSave} onResetCalculationCache={vi.fn()} />)
    const page = within(view.container)

    expect(page.getByRole('heading', { name: 'site settings' })).toBeTruthy()
    expect(page.queryByText('junk settings')).toBeNull()
    fireEvent.click(page.getByRole('button', { name: 'Increase junk item penalty' }))
    fireEvent.click(page.getByRole('button', { name: 'save settings' }))

    expect(page.getByRole('button', { name: 'Increase free initial characters' })).toBeTruthy()
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      scoring: expect.objectContaining({ junkItemPenalty: 1.5 }),
    }))
  })

  test('limits typed penalties to two decimal places and the supported range', () => {
    const view = render(<SettingsPage settings={settings} onSave={vi.fn()} onResetCalculationCache={vi.fn()} />)
    const page = within(view.container)
    const penalty = page.getByRole('textbox', { name: 'junk item penalty' })

    fireEvent.change(penalty, { target: { value: '12.34' } })
    expect((penalty as HTMLInputElement).value).toBe('12.34')
    fireEvent.change(penalty, { target: { value: '12.345' } })
    expect((penalty as HTMLInputElement).value).toBe('12.34')
    fireEvent.change(penalty, { target: { value: '10000' } })
    expect((penalty as HTMLInputElement).value).toBe('9999')
  })
})
