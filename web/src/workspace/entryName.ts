import type { TargetWorkspace, TargetWorkspaceEntry } from '../domain/types'

export function itemSetLabel(entry: Pick<TargetWorkspaceEntry, 'name'>, number: number): string {
  return entry.name?.trim() || `item set ${number}`
}

export function renameWorkspaceEntry(workspace: TargetWorkspace, entryId: string, name: string): TargetWorkspace {
  const normalizedName = name.trim()
  const existing = workspace.entries.find((entry) => entry.id === entryId)
  if (!existing || (existing.name ?? '') === normalizedName) return workspace
  return { entries: workspace.entries.map((entry) => {
    if (entry.id !== entryId) return entry
    const { name: _name, ...rest } = entry
    return normalizedName ? { ...rest, name: normalizedName } : rest
  }) }
}
