import type { GeneratedData, InventoryPreset } from '../domain/types'

export function builtInInventoryPresets(data: GeneratedData): readonly InventoryPreset[] {
  return [...data.presets.values()].sort((left, right) => left.id.localeCompare(right.id))
}
