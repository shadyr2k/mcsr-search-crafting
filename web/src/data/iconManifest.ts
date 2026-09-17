import type { GeneratedData } from '../domain/types'


type JsonRecord = Record<string, unknown>

const TOP_LEVEL_FIELDS = new Set([
  'schema_version',
  'minecraft_version',
  'icon_width',
  'icon_height',
  'icons',
])
const ITEM_ID_PATTERN = /^[a-z0-9_.-]+:[a-z0-9/._-]+$/
const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL', 'CLOCK$', 'CONIN$', 'CONOUT$',
  ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`),
])

export interface IconManifest {
  schemaVersion: 1
  minecraftVersion: string
  width: 16
  height: 16
  icons: Map<string, string>
  assetBaseUrl?: string
}

export class IconManifestError extends Error {
  constructor(message: string) {
    super(`Icon manifest validation failed: ${message}`)
    this.name = 'IconManifestError'
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSafeItemId(itemId: string): boolean {
  if (!ITEM_ID_PATTERN.test(itemId)) return false
  const [namespace, itemPath] = itemId.split(':', 2)
  return namespace !== ''
    && namespace !== '.'
    && namespace !== '..'
    && itemPath.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

function isSafeIconPath(path: string): boolean {
  if (path === '' || !path.endsWith('.png')) return false
  if (path.includes('\\') || path.includes(':') || path.includes('?') || path.includes('#') || path.includes('%')) {
    return false
  }
  if (path.startsWith('/') || path.startsWith('//')) return false
  const segments = path.split('/')
  return segments.every((segment) => {
    const basename = segment.split('.', 1)[0].toUpperCase()
    return segment !== ''
      && segment !== '.'
      && segment !== '..'
      && !segment.endsWith('.')
      && !segment.endsWith(' ')
      && !WINDOWS_RESERVED_NAMES.has(basename)
  })
}

export function parseIconManifest(payload: unknown, expectedMinecraftVersion?: string): IconManifest {
  if (!isRecord(payload)) throw new IconManifestError('expected an object')
  for (const field of Object.keys(payload)) {
    if (!TOP_LEVEL_FIELDS.has(field)) throw new IconManifestError(`unknown field ${field}`)
  }
  for (const field of TOP_LEVEL_FIELDS) {
    if (!(field in payload)) throw new IconManifestError(`missing field ${field}`)
  }
  if (payload.schema_version !== 1) throw new IconManifestError('schema_version: expected 1')
  if (typeof payload.minecraft_version !== 'string' || payload.minecraft_version.length === 0) {
    throw new IconManifestError('minecraft_version: expected a version string')
  }
  if (expectedMinecraftVersion !== undefined && payload.minecraft_version !== expectedMinecraftVersion) {
    throw new IconManifestError(`minecraft_version: expected ${expectedMinecraftVersion}`)
  }
  if (payload.icon_width !== 16) throw new IconManifestError('icon_width: expected 16')
  if (payload.icon_height !== 16) throw new IconManifestError('icon_height: expected 16')
  if (!isRecord(payload.icons)) throw new IconManifestError('icons: expected an object')

  const icons = new Map<string, string>()
  const paths = new Set<string>()
  for (const [itemId, path] of Object.entries(payload.icons).sort(([left], [right]) => left.localeCompare(right))) {
    if (!isSafeItemId(itemId)) throw new IconManifestError(`invalid item ID ${itemId}`)
    if (typeof path !== 'string' || !isSafeIconPath(path)) {
      throw new IconManifestError(`unsafe icon path for ${itemId}`)
    }
    if (paths.has(path)) throw new IconManifestError(`duplicate icon path ${path}`)
    paths.add(path)
    icons.set(itemId, path)
  }

  return {
    schemaVersion: 1,
    minecraftVersion: payload.minecraft_version,
    width: 16,
    height: 16,
    icons,
  }
}

export function assertIconCoverage(manifest: IconManifest, data: GeneratedData): void {
  const required = new Set([...data.items.keys(), ...data.inventoryItems.keys()])
  for (const itemId of [...required].sort()) {
    if (!manifest.icons.has(itemId)) throw new IconManifestError(`missing icon for ${itemId}`)
  }
  for (const itemId of [...manifest.icons.keys()].sort()) {
    if (!required.has(itemId)) throw new IconManifestError(`unexpected icon for ${itemId}`)
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
}

export function iconUrl(
  manifest: IconManifest,
  itemId: string,
  baseUrl = manifest.assetBaseUrl ?? import.meta.env.BASE_URL,
): string | undefined {
  const path = manifest.icons.get(itemId)
  return path === undefined ? undefined : `${normalizeBaseUrl(baseUrl)}item-icons/${path}`
}

export async function loadIconManifest(baseUrl = import.meta.env.BASE_URL, expectedMinecraftVersion?: string): Promise<IconManifest> {
  const url = `${normalizeBaseUrl(baseUrl)}item-icons/manifest.json`
  let response: Response
  try {
    response = await fetch(url)
  } catch (error) {
    throw new IconManifestError(`${url}: fetch failed: ${String(error)}`)
  }
  if (!response.ok) {
    throw new IconManifestError(`${url}: fetch failed with ${response.status} ${response.statusText}`)
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new IconManifestError(`${url}: response is not valid JSON`)
  }
  return { ...parseIconManifest(payload, expectedMinecraftVersion), assetBaseUrl: normalizeBaseUrl(baseUrl) }
}
