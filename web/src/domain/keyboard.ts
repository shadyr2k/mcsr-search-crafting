import type { RankedSearch } from './types'

export interface KeyboardSettings {
  /** Physical KeyboardEvent.code (or Mouse0–Mouse4) to produced KeyboardEvent.key. */
  mappings: Record<string, string>
  /** An empty string explicitly disables a control otherwise inferred from mappings. */
  controls: { shift?: string; home?: string; chat?: string; backspace?: string }
}

export interface KeyboardKey {
  code: string
  label: string
  value?: string
  width?: number
}

export const DEFAULT_KEYBOARD_SETTINGS: KeyboardSettings = { mappings: {}, controls: {} }

const key = (code: string, label: string, value = label, width = 1): KeyboardKey => ({ code, label, value, width })
const letters = (value: string): KeyboardKey[] => [...value].map(letter => key(`Key${letter.toUpperCase()}`, letter))

/** Compact 75% keyboard: no number pad or separate six-key navigation block. */
export const KEYBOARD_ROWS: KeyboardKey[][] = [
  [key('Escape', 'esc', 'Escape'), ...Array.from({ length: 12 }, (_, index) => key(`F${index + 1}`, `f${index + 1}`, `F${index + 1}`)), key('Delete', 'del', 'Delete')],
  [key('Backquote', '`'), ...[...'1234567890'].map(number => key(`Digit${number}`, number)), key('Minus', '-'), key('Equal', '='), key('Backspace', 'backspace', 'Backspace', 2), key('Home', 'home', 'Home')],
  [key('Tab', 'tab', 'Tab', 1.5), ...letters('qwertyuiop'), key('BracketLeft', '['), key('BracketRight', ']'), key('Backslash', '\\', '\\', 1.5), key('PageUp', 'pgup', 'PageUp')],
  [key('CapsLock', 'caps', 'CapsLock', 1.75), ...letters('asdfghjkl'), key('Semicolon', ';'), key('Quote', "'"), key('Enter', 'enter', 'Enter', 2.25), key('PageDown', 'pgdn', 'PageDown')],
  [key('ShiftLeft', 'shift', 'Shift', 2.25), ...letters('zxcvbnm'), key('Comma', ','), key('Period', '.'), key('Slash', '/'), key('ShiftRight', 'shift', 'Shift', 1.75), key('ArrowUp', '↑', 'ArrowUp'), key('End', 'end', 'End')],
  [key('ControlLeft', 'ctrl', 'Control', 1.25), key('MetaLeft', 'win', 'Meta', 1.25), key('AltLeft', 'alt', 'Alt', 1.25), key('Space', 'space', ' ', 6.25), key('AltRight', 'alt', 'Alt'), key('ControlRight', 'ctrl', 'Control'), key('ArrowLeft', '←', 'ArrowLeft'), key('ArrowDown', '↓', 'ArrowDown'), key('ArrowRight', '→', 'ArrowRight')],
]

export const MOUSE_KEYS: KeyboardKey[] = [key('Mouse0', 'left mouse', 'Mouse0'), key('Mouse1', 'middle mouse', 'Mouse1'), key('Mouse2', 'right mouse', 'Mouse2'), key('Mouse3', 'mouse 4', 'Mouse3'), key('Mouse4', 'mouse 5', 'Mouse4')]
const allKeys = [...KEYBOARD_ROWS.flat(), ...MOUSE_KEYS]
const keysByCode = new Map(allKeys.map(descriptor => [descriptor.code, descriptor]))
const namedValues = new Set(allKeys.map(descriptor => descriptor.value).filter(value => value && [...value].length > 1))

export function isKeyboardCode(code: unknown): code is string {
  return typeof code === 'string' && keysByCode.has(code)
}

export function keyLabel(code: string): string {
  return keysByCode.get(code)?.label ?? code
}

export function normalizeKeyValue(value: string): string {
  return [...value].length === 1 ? value.toLowerCase() : value
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Ignore malformed persisted members without discarding unrelated site settings. */
export function normalizeKeyboardSettings(value: unknown): KeyboardSettings {
  const result: KeyboardSettings = { mappings: {}, controls: {} }
  if (!record(value)) return result
  if (record(value.mappings)) {
    for (const [code, output] of Object.entries(value.mappings)) {
      if (isKeyboardCode(code) && typeof output === 'string' && (([...output].length === 1 && !/[\u0000-\u001f\u007f]/u.test(output)) || namedValues.has(output))) {
        result.mappings[code] = normalizeKeyValue(output)
      }
    }
  }
  if (record(value.controls)) {
    for (const control of ['shift', 'home', 'chat', 'backspace'] as const) {
      const code = value.controls[control]
      if (code === '' || isKeyboardCode(code)) result.controls[control] = code
    }
  }
  return result
}

/** Resolve manual overrides before controls implied by custom key outputs. */
export function effectiveKeyboardControls(settings: KeyboardSettings): KeyboardSettings['controls'] {
  const outputs = { shift: 'Shift', home: 'Home', chat: 't', backspace: 'Backspace' }
  const mappings = effectiveKeyboardMappings(settings)
  const resolved: KeyboardSettings['controls'] = {}
  for (const control of ['shift', 'home', 'chat', 'backspace'] as const) {
    if (Object.hasOwn(settings.controls, control)) {
      const code = settings.controls[control]
      if (isKeyboardCode(code)) resolved[control] = code
      continue
    }
    const candidates = Object.entries(mappings).filter(([code, output]) => isKeyboardCode(code) && normalizeKeyValue(output) === outputs[control])
    if (candidates.length === 1) resolved[control] = candidates[0][0]
  }
  return resolved
}

/** Manual non-text controls replace the physical key's character output. */
export function effectiveKeyboardMappings(settings: KeyboardSettings): KeyboardSettings['mappings'] {
  const mappings = { ...settings.mappings }
  for (const [control, output] of [['shift', 'Shift'], ['home', 'Home'], ['backspace', 'Backspace']] as const) {
    const code = settings.controls[control]
    if (isKeyboardCode(code)) mappings[code] = output
  }
  return mappings
}

export function keyboardConflicts(settings: KeyboardSettings): { blocked: Set<string>; duplicates: Set<string> } {
  const mappings = effectiveKeyboardMappings(settings)
  const explicitOutputs = new Map<string, string[]>()
  for (const [code, output] of Object.entries(mappings)) {
    if (!isKeyboardCode(code)) continue
    const normalized = normalizeKeyValue(output)
    explicitOutputs.set(normalized, [...(explicitOutputs.get(normalized) ?? []), code])
  }
  const blocked = new Set<string>()
  const duplicates = new Set<string>()
  for (const codes of explicitOutputs.values()) {
    if (codes.length > 1) codes.forEach(code => { duplicates.add(code); blocked.add(code) })
  }
  const controlCodes = new Set<string>()
  for (const code of Object.values(effectiveKeyboardControls(settings))) {
    if (!isKeyboardCode(code)) continue
    if (controlCodes.has(code)) {
      duplicates.add(code)
      blocked.add(code)
    }
    controlCodes.add(code)
  }
  for (const descriptor of allKeys) {
    if (mappings[descriptor.code] === undefined && descriptor.value !== undefined && explicitOutputs.has(normalizeKeyValue(descriptor.value))) {
      blocked.add(descriptor.code)
    }
  }
  return { blocked, duplicates }
}

export function translateCharacter(character: string, settings: KeyboardSettings): string | undefined {
  const normalized = normalizeKeyValue(character)
  const { blocked } = keyboardConflicts(settings)
  const mappings = effectiveKeyboardMappings(settings)
  const explicit = Object.entries(mappings).find(([code, output]) => isKeyboardCode(code) && !blocked.has(code) && normalizeKeyValue(output) === normalized)
  if (explicit) return explicit[0]
  return allKeys.find(descriptor => !blocked.has(descriptor.code) && mappings[descriptor.code] === undefined && descriptor.value !== undefined && normalizeKeyValue(descriptor.value) === normalized)?.code
}

export interface KeyboardSequenceToken {
  codes: string[]
  kind: 'character' | 'backspace' | 'replace' | 'chat'
  label: string
  missing?: boolean
}

export function buildKeyboardSequence(search: RankedSearch, settings: KeyboardSettings): KeyboardSequenceToken[] {
  const tokens: KeyboardSequenceToken[] = []
  const { duplicates } = keyboardConflicts(settings)
  const controls = effectiveKeyboardControls(settings)
  const controlCode = (name: keyof KeyboardSettings['controls']): string | undefined => {
    const code = controls[name]
    return isKeyboardCode(code) && !duplicates.has(code) ? code : undefined
  }
  const chat = controlCode('chat')
  const backspace = controlCode('backspace')
  const shift = controlCode('shift')
  const home = controlCode('home')
  search.steps.forEach((step, index) => {
    if (index > 0) {
      if (chat) tokens.push({ codes: [chat], kind: 'chat', label: keyLabel(chat) })
      const replaces = step.retainedPrefix.length === 0 && step.freeBackspaceCount >= search.steps[index - 1].query.length
      if (replaces) {
        if (shift && home) tokens.push({ codes: [shift, home], kind: 'replace', label: `${keyLabel(shift)} + ${keyLabel(home)}` })
      } else if (backspace) {
        for (let count = 0; count < step.freeBackspaceCount; count++) tokens.push({ codes: [backspace], kind: 'backspace', label: keyLabel(backspace) })
      }
    }
    for (const character of index === 0 ? step.query : step.typedSuffix) {
      const code = translateCharacter(character, settings)
      tokens.push(code ? { codes: [code], kind: 'character', label: keyLabel(code) } : { codes: [], kind: 'character', label: character === ' ' ? 'space' : character, missing: true })
    }
  })
  return tokens
}
