import { describe, expect, it, vi } from 'vitest'

import type { GeneratedData } from '../domain/types'
import {
  IconManifestError,
  assertIconCoverage,
  iconUrl,
  loadIconManifest,
  loadIconOverrides,
  parseIconManifest,
  withIconOverrides,
} from './iconManifest'


const validPayload = {
  schema_version: 1,
  minecraft_version: '1.16.1',
  icon_width: 16,
  icon_height: 16,
  icons: {
    'minecraft:bucket': 'minecraft/bucket.png',
    'minecraft:stick': 'minecraft/stick.png',
  },
}

function generatedData(
  items: string[],
  inventoryItems: string[],
): GeneratedData {
  return {
    schemaVersion: 3,
    items: new Map(items.map((id) => [id, {
      id,
      name: id,
      confidence: 'exact',
      searchLines: [{ source: 'name', text: id }],
    }])),
    inventoryItems: new Map(inventoryItems.map((id) => [id, { id, name: id }])),
    recipes: [],
    collections: new Map(),
    presets: new Map(),
  }
}

function payloadWithPath(path: unknown) {
  return {
    ...validPayload,
    icons: { 'minecraft:stick': path },
  }
}

describe('parseIconManifest', () => {
  it('parses safe schema-one paths', () => {
    const manifest = parseIconManifest(validPayload)

    expect(manifest.schemaVersion).toBe(1)
    expect(manifest.minecraftVersion).toBe('1.16.1')
    expect(manifest.width).toBe(16)
    expect(manifest.height).toBe(16)
    expect(manifest.icons.get('minecraft:stick')).toBe('minecraft/stick.png')
  })

  it.each([
    ['schema_version', 2, 'schema_version'],
    ['schema_version', true, 'schema_version'],
    ['minecraft_version', '', 'minecraft_version'],
    ['icon_width', 32, 'icon_width'],
    ['icon_height', 8, 'icon_height'],
  ])('rejects invalid %s', (field, value, message) => {
    expect(() => parseIconManifest({ ...validPayload, [field]: value })).toThrow(message)
  })

  it('rejects missing and unknown top-level fields', () => {
    const { icon_height: _height, ...missing } = validPayload
    expect(() => parseIconManifest(missing)).toThrow('missing field icon_height')
    expect(() => parseIconManifest({ ...validPayload, surprise: true })).toThrow('unknown field surprise')
  })

  it.each([
    '../stick.png',
    '/stick.png',
    'C:/stick.png',
    'minecraft\\stick.png',
    'https://example.com/stick.png',
    'data:image/png;base64,abc',
    'minecraft//stick.png',
    'minecraft/./stick.png',
    'minecraft/stick.PNG',
    'minecraft/stick.png?raw=1',
  ])('rejects unsafe browser path %s', (path) => {
    expect(() => parseIconManifest(payloadWithPath(path))).toThrow('unsafe icon path')
  })

  it('rejects duplicate paths and invalid item IDs', () => {
    expect(() => parseIconManifest({
      ...validPayload,
      icons: {
        'minecraft:stick': 'minecraft/stick.png',
        'minecraft:other': 'minecraft/stick.png',
      },
    })).toThrow('duplicate icon path')
    expect(() => parseIconManifest({
      ...validPayload,
      icons: { 'bad item': 'minecraft/stick.png' },
    })).toThrow('invalid item ID')
  })
})

describe('assertIconCoverage', () => {
  it('accepts the exact search/inventory union', () => {
    const manifest = parseIconManifest(validPayload)
    expect(() => assertIconCoverage(
      manifest,
      generatedData(['minecraft:stick'], ['minecraft:bucket', 'minecraft:stick']),
    )).not.toThrow()
  })

  it('rejects missing and unexpected generated IDs', () => {
    const manifest = parseIconManifest(validPayload)
    expect(() => assertIconCoverage(
      manifest,
      generatedData(['minecraft:stick', 'minecraft:apple'], ['minecraft:bucket']),
    )).toThrow('missing icon for minecraft:apple')
    expect(() => assertIconCoverage(
      manifest,
      generatedData(['minecraft:stick'], []),
    )).toThrow('unexpected icon for minecraft:bucket')
  })
})

describe('loadIconManifest', () => {
  it('loads from the normalized item-icons base path', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => validPayload,
    }))
    vi.stubGlobal('fetch', fetchMock)

    const manifest = await loadIconManifest('/mcsr')

    expect(fetchMock).toHaveBeenCalledWith('/mcsr/item-icons/manifest.json')
    expect(manifest.icons.size).toBe(2)
    expect(manifest.assetBaseUrl).toBe('/mcsr/')
    vi.unstubAllGlobals()
  })

  it('rejects an icon package for a different Minecraft version', () => {
    expect(() => parseIconManifest({ ...validPayload, minecraft_version: '1.16.2' }, '1.16.1')).toThrow('expected 1.16.1')
  })

  it('wraps fetch and JSON failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => validPayload,
    })))
    await expect(loadIconManifest('/')).rejects.toBeInstanceOf(IconManifestError)
    vi.unstubAllGlobals()
  })
})

describe('icon overrides', () => {
  it('loads replacements from the cat item-icons package', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => validPayload,
    }))
    vi.stubGlobal('fetch', fetchMock)

    const overrides = await loadIconOverrides('/versions/26.1.2')

    expect(fetchMock).toHaveBeenCalledWith('/versions/26.1.2/cat-item-icons/manifest.json')
    expect(overrides.assetBaseUrl).toBe('/versions/26.1.2/cat-item-icons/')
    vi.unstubAllGlobals()
  })

  it('uses a replacement only when the pack supplies that item', () => {
    const base = { ...parseIconManifest(validPayload), assetBaseUrl: '/base/' }
    const overrides = { ...parseIconManifest({ ...validPayload, icons: { 'minecraft:stick': 'minecraft/cat_stick.png' } }), assetBaseUrl: '/cats/' }
    const merged = withIconOverrides(base, overrides)

    expect(iconUrl(merged, 'minecraft:stick')).toBe('/cats/item-icons/minecraft/cat_stick.png')
    expect(iconUrl(merged, 'minecraft:bucket')).toBe('/base/item-icons/minecraft/bucket.png')
  })
})
