import { describe, expect, test } from 'vitest'
import type { RankedSearch } from './types'
import { buildKeyboardSequence, DEFAULT_KEYBOARD_SETTINGS, effectiveKeyboardControls, keyboardConflicts, normalizeKeyboardSettings, translateCharacter, type KeyboardSettings } from './keyboard'

const custom: KeyboardSettings = { mappings: { KeyX: 's', KeyC: 'e' }, controls: {} }

function search(steps: Array<{ query: string; retainedPrefix?: string; freeBackspaceCount?: number; typedSuffix?: string }>): RankedSearch {
  return { kind: 'overlap', queries: steps.map(step => step.query), coveredTargetIds: [], totalJunkAppearances: 0, totalTypedCharacters: 0, totalScore: 0,
    steps: steps.map(step => ({ retainedPrefix: '', freeBackspaceCount: 0, typedSuffix: step.query, coveredTargetIds: [], newTargetIds: [], junkItemIds: [], explanations: [], score: { typingPenalty: 0, junkPresencePenalty: 0, junkCountPenalty: 0, total: 0 }, ...step })) }
}

describe('custom keyboard translation', () => {
  test('uses manually assigned physical control keys even when their original letters were moved', () => {
    const settings: KeyboardSettings = { mappings: { KeyX: 'i', KeyF: 't' }, controls: { shift: 'CapsLock', home: 'KeyI', chat: 'KeyT' } }
    expect(keyboardConflicts(settings).duplicates.size).toBe(0)
    expect(keyboardConflicts(settings).blocked.has('KeyI')).toBe(false)
    expect(translateCharacter('i', settings)).toBe('KeyX')
    expect(translateCharacter('t', settings)).toBe('KeyF')
    const tokens = buildKeyboardSequence(search([{ query: 'a' }, { query: 'b', freeBackspaceCount: 1 }]), settings)
    expect(tokens.filter(token => token.kind !== 'character')).toEqual([
      { codes: ['KeyT'], kind: 'chat', label: 't' },
      { codes: ['CapsLock', 'KeyI'], kind: 'replace', label: 'caps + i' },
    ])
    expect(translateCharacter('i', { mappings: { KeyI: 'i' }, controls: { home: 'KeyI' } })).toBeUndefined()
  })

  test('translates produced characters back to physical keys and blocks displaced defaults', () => {
    expect(translateCharacter('s', custom)).toBe('KeyX')
    expect(translateCharacter('E', custom)).toBe('KeyC')
    expect(translateCharacter('x', custom)).toBeUndefined()
    expect(keyboardConflicts(custom).blocked).toEqual(new Set(['KeyS', 'KeyE']))
    expect(keyboardConflicts(custom).duplicates.size).toBe(0)
  })

  test('accepts swaps but marks both explicit duplicate assignments including case variants', () => {
    const swapped = { mappings: { KeyX: 's', KeyS: 'x' }, controls: {} }
    expect(keyboardConflicts(swapped).blocked.size).toBe(0)
    const duplicate = { mappings: { KeyX: 'S', KeyC: 's' }, controls: {} }
    expect(keyboardConflicts(duplicate).duplicates).toEqual(new Set(['KeyX', 'KeyC']))
    expect(translateCharacter('s', duplicate)).toBeUndefined()
  })

  test('blocks physical keys assigned to multiple controls but permits a mapping and control on the same key', () => {
    const duplicate: KeyboardSettings = { mappings: {}, controls: { shift: 'KeyX', home: 'KeyX' } }
    expect(keyboardConflicts(duplicate)).toEqual({ blocked: new Set(['KeyX', 'Home']), duplicates: new Set(['KeyX']) })
    const shared: KeyboardSettings = { mappings: { KeyX: 's' }, controls: { chat: 'KeyX' } }
    expect(keyboardConflicts(shared).duplicates.size).toBe(0)
    expect(translateCharacter('s', shared)).toBe('KeyX')
    expect(buildKeyboardSequence(search([{ query: 's' }, { query: 's' }]), shared).filter(token => token.kind === 'chat'))
      .toEqual([{ codes: ['KeyX'], kind: 'chat', label: 'x' }])
  })

  test('supports mouse assignments and Unicode and preserves missing characters', () => {
    const settings = { mappings: { Mouse3: 'ø' }, controls: {} }
    expect(translateCharacter('Ø', settings)).toBe('Mouse3')
    expect(buildKeyboardSequence(search([{ query: 'ø中' }]), settings)).toEqual([
      { codes: ['Mouse3'], kind: 'character', label: 'mouse 4' },
      { codes: [], kind: 'character', label: '中', missing: true },
    ])
  })

  test('emits chat only between steps, then partial deletion or simultaneous full replacement', () => {
    const settings: KeyboardSettings = { ...custom, controls: { chat: 'KeyT', backspace: 'Backspace', shift: 'ShiftLeft', home: 'Home' } }
    const sequence = buildKeyboardSequence(search([
      { query: 'l ' }, { query: 'liv', retainedPrefix: 'l', freeBackspaceCount: 1, typedSuffix: 'iv' },
      { query: 'se', freeBackspaceCount: 3 },
    ]), settings)
    expect(sequence.map(token => token.kind)).toEqual(['character', 'character', 'chat', 'backspace', 'character', 'character', 'chat', 'replace', 'character', 'character'])
    expect(sequence[1].label).toBe('space')
    expect(sequence[7].codes).toEqual(['ShiftLeft', 'Home'])
    expect(sequence.slice(-2).map(token => token.label).join('')).toBe('xc')
  })

  test('omits unbound controls and partial shift-home chords and repeats individual backspaces', () => {
    const queries = search([{ query: 'abcd' }, { query: 'ab', retainedPrefix: 'ab', freeBackspaceCount: 2, typedSuffix: '' }, { query: 's', freeBackspaceCount: 2 }])
    expect(buildKeyboardSequence(queries, DEFAULT_KEYBOARD_SETTINGS).every(token => token.kind === 'character')).toBe(true)
    const tokens = buildKeyboardSequence(queries, { mappings: {}, controls: { shift: 'ShiftLeft', backspace: 'Mouse4' } })
    expect(tokens.filter(token => token.kind === 'backspace')).toHaveLength(2)
    expect(tokens.some(token => token.kind === 'replace')).toBe(false)
  })

  test('detects all four controls from custom outputs without enabling untouched default keys', () => {
    expect(Object.values(effectiveKeyboardControls(DEFAULT_KEYBOARD_SETTINGS)).filter(Boolean)).toEqual([])
    const settings: KeyboardSettings = { mappings: { KeyR: 'Backspace', Mouse3: 'Shift', KeyH: 'Home', KeyY: 'T' }, controls: {} }
    expect(effectiveKeyboardControls(settings)).toEqual({ shift: 'Mouse3', home: 'KeyH', chat: 'KeyY', backspace: 'KeyR' })
    const tokens = buildKeyboardSequence(search([{ query: 'ab' }, { query: 'a', retainedPrefix: 'a', freeBackspaceCount: 1, typedSuffix: '' }, { query: 'z', freeBackspaceCount: 1 }]), settings)
    expect(tokens.filter(token => token.kind !== 'character')).toEqual([
      { codes: ['KeyY'], kind: 'chat', label: 'y' }, { codes: ['KeyR'], kind: 'backspace', label: 'r' },
      { codes: ['KeyY'], kind: 'chat', label: 'y' }, { codes: ['Mouse3', 'KeyH'], kind: 'replace', label: 'mouse 4 + h' },
    ])
  })

  test('preserves explicit clears and manual precedence over detected controls', () => {
    const settings = normalizeKeyboardSettings({ mappings: { KeyR: 'Backspace', KeyY: 't' }, controls: { backspace: '', chat: 'Mouse4' } })
    expect(settings.controls.backspace).toBe('')
    expect(effectiveKeyboardControls(settings).backspace).toBeUndefined()
    expect(effectiveKeyboardControls(settings).chat).toBe('Mouse4')
    expect(buildKeyboardSequence(search([{ query: 'ab' }, { query: 'a', retainedPrefix: 'a', freeBackspaceCount: 1, typedSuffix: '' }]), settings).filter(token => token.kind !== 'character'))
      .toEqual([{ codes: ['Mouse4'], kind: 'chat', label: 'mouse 5' }])
  })

  test('manual controls replace inferred actions on that physical key and avoid ambiguous inference', () => {
    const settings: KeyboardSettings = { mappings: { KeyR: 'Shift' }, controls: { home: 'KeyR' } }
    expect(keyboardConflicts(settings).duplicates.size).toBe(0)
    expect(effectiveKeyboardControls(settings)).toEqual({ home: 'KeyR' })
    expect(buildKeyboardSequence(search([{ query: 'a' }, { query: 'b', freeBackspaceCount: 1 }]), settings).some(token => token.kind === 'replace')).toBe(false)
    expect(effectiveKeyboardControls({ mappings: { KeyI: 't' }, controls: { home: 'KeyI' } })).toEqual({ home: 'KeyI' })
    expect(effectiveKeyboardControls({ mappings: { KeyR: 'Backspace', KeyB: 'Backspace' }, controls: {} }).backspace).toBeUndefined()
  })

  test('normalizes only known physical keys and valid outputs without unsafe persisted properties', () => {
    expect(normalizeKeyboardSettings({ mappings: { KeyX: 'S', Mouse4: 'ø', KeyC: 'Unidentified', Unknown: 'x', KeyD: 5 }, controls: { shift: 'ShiftLeft', chat: 'Unknown', home: 'Mouse3', unexpected: 'KeyT' } }))
      .toEqual({ mappings: { KeyX: 's', Mouse4: 'ø' }, controls: { shift: 'ShiftLeft', home: 'Mouse3' } })
    expect(normalizeKeyboardSettings(null)).toEqual(DEFAULT_KEYBOARD_SETTINGS)
  })
})
