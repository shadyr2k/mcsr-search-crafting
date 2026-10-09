import { describe, expect, test } from 'vitest'

import type { TargetWorkspace } from '../domain/types'
import { entryOptimizationFingerprint } from '../hooks/useRowOptimizations'
import { languageCraftEntryKey } from '../persistence/languageCraftCache'
import { languageScoreEntryKey } from '../persistence/languageScoreCache'
import { DEFAULT_SCORING_SETTINGS } from '../engine/scoring'
import { draftFromEntry } from './entryDraft'
import { itemSetLabel, renameWorkspaceEntry } from './entryName'

const workspace: TargetWorkspace = { entries: [{ id: 'one', targetIds: ['minecraft:stick'], inventoryItemIds: [], enabled: true, gridSize: 3, order: 0 }] }

describe('item-set names', () => {
  test('trims names, preserves them while editing, and clears to the numbered default', () => {
    const renamed = renameWorkspaceEntry(workspace, 'one', '  Tools & arrows  ')
    expect(renamed.entries[0].name).toBe('Tools & arrows')
    expect(itemSetLabel(renamed.entries[0], 1)).toBe('Tools & arrows')
    expect(draftFromEntry(renamed.entries[0]).name).toBe('Tools & arrows')
    expect(workspace.entries[0].name).toBeUndefined()
    const cleared = renameWorkspaceEntry(renamed, 'one', '   ')
    expect(cleared.entries[0]).not.toHaveProperty('name')
    expect(itemSetLabel(cleared.entries[0], 1)).toBe('item set 1')
    expect(renameWorkspaceEntry(renamed, 'one', 'Tools & arrows')).toBe(renamed)
    expect(renameWorkspaceEntry(workspace, 'missing', 'Unknown')).toBe(workspace)
  })

  test('renaming keeps calculation and language cache identities unchanged', () => {
    const original = workspace.entries[0]
    const renamed = renameWorkspaceEntry(workspace, 'one', 'Tools').entries[0]
    expect(entryOptimizationFingerprint(renamed)).toBe(entryOptimizationFingerprint(original))
    expect(languageScoreEntryKey(renamed)).toBe(languageScoreEntryKey(original))
    expect(languageCraftEntryKey(renamed, DEFAULT_SCORING_SETTINGS, false)).toBe(languageCraftEntryKey(original, DEFAULT_SCORING_SETTINGS, false))
  })
})
