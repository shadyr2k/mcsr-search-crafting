import { fireEvent, render, screen } from '@testing-library/react'
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
})
