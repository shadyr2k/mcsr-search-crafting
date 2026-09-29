import type { CSSProperties } from 'react'
import { KEYBOARD_ROWS, MOUSE_KEYS, keyLabel, type KeyboardSettings } from '../domain/keyboard'
import './KeyboardVisualization.css'

const compactOutputs: Record<string, string> = {
  Backspace: 'BS', Shift: 'SH', Control: 'ctrl', Meta: 'win', Enter: 'ent',
  Home: 'hm', PageUp: 'pgup', PageDown: 'pgdn', CapsLock: 'caps', Delete: 'del', Escape: 'esc',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Mouse0: 'L', Mouse1: 'M', Mouse2: 'R', Mouse3: '4', Mouse4: '5',
}
const mouseLabels: Record<string, string> = { Mouse0: 'L', Mouse1: 'M', Mouse2: 'R', Mouse3: '4', Mouse4: '5' }

export interface KeyboardHighlight {
  codes: readonly string[]
  kind: 'character' | 'backspace' | 'replace' | 'chat'
}

/** Shared physical layout for the editor and craft playback. */
export function KeyboardVisualization({ settings, onSelect, selected, blocked = new Set(), highlights = [], pulse = 0 }: {
  settings?: KeyboardSettings
  onSelect?: (code: string) => void
  selected?: string
  blocked?: ReadonlySet<string>
  highlights?: readonly KeyboardHighlight[]
  pulse?: number
}) {
  function renderKey(key: { code: string; label: string; width?: number }) {
    const custom = settings?.mappings[key.code]
    const highlight = highlights.find((item) => item.codes.includes(key.code))
    const conflict = blocked.has(key.code)
    const className = ['keyboard-visual__key', custom !== undefined && 'keyboard-visual__key--custom', conflict && 'keyboard-visual__key--conflict', selected === key.code && 'keyboard-visual__key--selected'].filter(Boolean).join(' ')
    const label = custom === ' ' ? 'space' : custom === undefined ? mouseLabels[key.code] ?? key.label : compactOutputs[custom] ?? custom
    const contents = <>{highlight && <span key={pulse} className={`keyboard-visual__light keyboard-visual__light--${highlight.kind}`} aria-hidden="true" />}<span key={`label-${pulse}`} className="keyboard-visual__label">{label}</span></>
    const description = `${keyLabel(key.code)}${custom !== undefined ? ` → ${custom === ' ' ? 'space' : custom}` : ''}${conflict ? ' (conflict, unused)' : ''}`
    const style = { flex: key.width ?? 1 } as CSSProperties
    return onSelect
      ? <button key={key.code} type="button" className={className} style={style} data-code={key.code} aria-label={`Rebind ${description}`} aria-pressed={selected === key.code} onClick={() => onSelect(key.code)} title={description}>{contents}</button>
      : <span key={key.code} className={className} style={style} data-code={key.code} title={description}>{contents}</span>
  }

  return <div className={`keyboard-visual${onSelect ? ' keyboard-visual--editable' : ''}`} role="group" aria-label="75% keyboard and five-button mouse" dir="ltr">
    <div className="keyboard-visual__board">{KEYBOARD_ROWS.map((row, index) => <div className="keyboard-visual__row" key={index}>{row.map(renderKey)}</div>)}</div>
    <div className="keyboard-visual__mouse" aria-label="Five-button mouse">{MOUSE_KEYS.map(renderKey)}</div>
  </div>
}
