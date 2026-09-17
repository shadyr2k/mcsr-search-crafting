export interface GameVersion {
  id: string
  label: string
  /** Root containing this version's `data/` and `item-icons/` directories. */
  packageBaseUrl: string
}

const appBaseUrl = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`

// Register a generated data package here only after its data and icon manifest
// have been added to public/versions/<id>/. Keeping this list to complete
// packages means the picker can never select a partially installed version.
export const supportedGameVersions: readonly GameVersion[] = [
  { id: '1.16.1', label: 'Minecraft 1.16.1', packageBaseUrl: appBaseUrl },
]

export const defaultGameVersion = supportedGameVersions[0]

export function gameVersionForId(id: string): GameVersion {
  return supportedGameVersions.find((version) => version.id === id) ?? defaultGameVersion
}
