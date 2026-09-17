import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { VersionPicker } from './VersionPicker'

afterEach(cleanup)

const versions = [
  { id: '1.16.1', label: 'Minecraft 1.16.1', packageBaseUrl: '/' },
  { id: '26.1.2', label: 'Minecraft 26.1.2', packageBaseUrl: '/versions/26.1.2/' },
]

describe('VersionPicker', () => {
  it('shows the selected version and changes it from the menu', () => {
    const onVersionChange = vi.fn()
    render(<VersionPicker versions={versions} selectedVersionId="1.16.1" onVersionChange={onVersionChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Choose Minecraft version' }))

    expect(screen.getByRole('menu', { name: 'Minecraft versions' })).toBeTruthy()
    expect(screen.getByRole('menuitemradio', { name: 'Select Minecraft 1.16.1' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Select Minecraft 26.1.2' }))
    expect(onVersionChange).toHaveBeenCalledWith('26.1.2')
    expect(screen.queryByRole('menu', { name: 'Minecraft versions' })).toBeNull()
  })
})
