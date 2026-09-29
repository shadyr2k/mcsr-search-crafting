import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { DEFAULT_SCORING_SETTINGS } from '../engine/scoring'
import { SettingsPage } from './SettingsPage'

const settings = {
  scoring: DEFAULT_SCORING_SETTINGS,
  itemIdSearch: false,
  hideNumberCraftsByDefault: false,
  removeAnimations: false,
  compactLayout: false,
  catifyItems: false,
}

describe('SettingsPage', () => {
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
    fireEvent.click(page.getByRole('button', { name: 'Decrease junk item penalty' }))
    fireEvent.click(page.getByRole('button', { name: 'save settings' }))

    expect(page.getByRole('button', { name: 'Increase free initial characters' })).toBeTruthy()
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      scoring: expect.objectContaining({ junkItemPenalty: .25 }),
    }))
  })
})
