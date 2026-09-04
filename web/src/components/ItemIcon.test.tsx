import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { parseIconManifest } from '../data/iconManifest'
import { ItemIcon } from './ItemIcon'


const manifest = parseIconManifest({
  schema_version: 1,
  minecraft_version: '1.16.1',
  icon_width: 16,
  icon_height: 16,
  icons: {
    'minecraft:bucket': 'minecraft/bucket.png',
    'minecraft:stick': 'minecraft/stick.png',
  },
})

afterEach(cleanup)

describe('ItemIcon', () => {
  it('renders a labeled nearest-neighbor image', () => {
    render(<ItemIcon itemId="minecraft:stick" name="Stick" manifest={manifest} size="picker" />)

    const image = screen.getByRole('img', { name: 'Stick' }) as HTMLImageElement
    expect(image.alt).toBe('Stick')
    expect(image.title).toBe('Stick')
    expect(image.getAttribute('loading')).toBe('lazy')
    expect(image.classList.contains('item-icon--picker')).toBe(true)
    expect(image.src).toContain('item-icons/minecraft/stick.png')
  })

  it('keeps the English name when the image request fails', () => {
    render(<ItemIcon itemId="minecraft:stick" name="Stick" manifest={manifest} />)
    fireEvent.error(screen.getByRole('img', { name: 'Stick' }))

    const fallback = screen.getByRole('img', { name: 'Stick' })
    expect(fallback.classList.contains('item-icon--fallback')).toBe(true)
    expect(screen.getByText('Stick')).toBeTruthy()
  })

  it('falls back accessibly when the manifest has no item', () => {
    render(<ItemIcon itemId="minecraft:apple" name="Apple" manifest={manifest} />)

    expect(screen.getByRole('img', { name: 'Apple' }).classList.contains('item-icon--fallback')).toBe(true)
    expect(screen.getByText('Apple')).toBeTruthy()
  })

  it('resets the failed state when the item and URL change', () => {
    const rendered = render(<ItemIcon itemId="minecraft:stick" name="Stick" manifest={manifest} />)
    fireEvent.error(screen.getByRole('img', { name: 'Stick' }))
    expect(screen.getByText('Stick')).toBeTruthy()

    rendered.rerender(<ItemIcon itemId="minecraft:bucket" name="Bucket" manifest={manifest} />)

    const image = screen.getByRole('img', { name: 'Bucket' })
    expect(image.tagName).toBe('IMG')
    expect((image as HTMLImageElement).src).toContain('item-icons/minecraft/bucket.png')
  })

  it('loads detail icons eagerly', () => {
    render(<ItemIcon itemId="minecraft:stick" name="Stick" manifest={manifest} size="detail" />)

    expect(screen.getByRole('img', { name: 'Stick' }).getAttribute('loading')).toBe('eager')
  })
})
