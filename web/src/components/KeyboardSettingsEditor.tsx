import { useEffect, useRef, useState } from 'react'
import { DEFAULT_KEYBOARD_SETTINGS, KEYBOARD_ROWS, effectiveKeyboardControls, isKeyboardCode, keyboardConflicts, keyLabel, normalizeKeyboardSettings, type KeyboardSettings } from '../domain/keyboard'
import { KeyboardVisualization } from './KeyboardVisualization'

const controls = [['shift', 'shift'], ['home', 'home'], ['chat', 'chat key'], ['backspace', 'backspace']] as const
type PendingBinding = { kind: 'mapping'; code: string } | { kind: 'control'; code: keyof KeyboardSettings['controls'] }

export function KeyboardSettingsEditor({ value, onChange }: { value: KeyboardSettings; onChange: (value: KeyboardSettings) => void }) {
  const [pending, setPending] = useState<PendingBinding>()
  const [message, setMessage] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const modifier = useRef<{ key: string; code: string } | undefined>(undefined)
  const conflicts = keyboardConflicts(value)
  const resolvedControls = effectiveKeyboardControls(value)
  const blocked = new Set([...conflicts.blocked, ...conflicts.duplicates])
  const pendingLabel = pending?.kind === 'mapping' ? keyLabel(pending.code) : controls.find(([code]) => code === pending?.code)?.[1]

  useEffect(() => { if (pending) input.current?.focus() }, [pending])

  function capture(output: string, physicalCode?: string) {
    if (!pending) return
    if (pending.kind === 'mapping') {
      const normalized = normalizeKeyboardSettings({ mappings: { [pending.code]: output } }).mappings[pending.code]
      if (!normalized) {
        setMessage('Press a key shown on the diagram, or enter one character.')
        return
      }
      onChange({ ...value, mappings: { ...value.mappings, [pending.code]: normalized } })
    } else {
      const code = physicalCode && isKeyboardCode(physicalCode) ? physicalCode : KEYBOARD_ROWS.flat().find((key) => key.value === output.toLowerCase())?.code
      if (!code) { setMessage('Use a key shown on the keyboard or one of the five mouse buttons.'); return }
      onChange({ ...value, controls: { ...value.controls, [pending.code]: code } })
    }
    setPending(undefined)
    setMessage('')
  }

  function clearPending() {
    if (!pending) return
    if (pending.kind === 'mapping') {
      const mappings = { ...value.mappings }
      delete mappings[pending.code]
      onChange({ ...value, mappings })
    } else {
      const next = { ...value.controls }
      delete next[pending.code]
      if (effectiveKeyboardControls({ ...value, controls: next })[pending.code]) next[pending.code] = ''
      onChange({ ...value, controls: next })
    }
    setPending(undefined)
  }

  return <div className="keyboard-editor">
    <p>Click or tap a physical key, then press the character it types. For example, select X and press S if your X key types S. Custom keys turn green.</p>
    <div className="keyboard-editor__scroll"><KeyboardVisualization settings={value} blocked={blocked} selected={pending?.kind === 'mapping' ? pending.code : undefined} onSelect={(code) => {
      if (pending?.kind === 'control') capture('', code)
      else { setPending({ kind: 'mapping', code }); setMessage('') }
    }} /></div>
    <p>Red unchanged keys are unused because a custom key already types that character. Rebind them to use them again. Two custom keys cannot share an output.</p>
    <div className="keyboard-editor__controls">{controls.map(([code, label]) => <div className="keyboard-editor__control" key={code}>
      <span>{label}</span>
      <button type="button" aria-label={`Bind ${label}`} aria-invalid={resolvedControls[code] !== undefined && blocked.has(resolvedControls[code])} onClick={() => { setPending({ kind: 'control', code }); setMessage('') }}>{resolvedControls[code] ? keyLabel(resolvedControls[code]) : 'unbound'}{resolvedControls[code] && value.controls[code] === undefined ? ' (detected)' : ''}</button>
      {resolvedControls[code] && <button type="button" aria-label={`Clear ${label}`} onClick={() => {
        const next = { ...value.controls }
        delete next[code]
        if (effectiveKeyboardControls({ ...value, controls: next })[code]) next[code] = ''
        onChange({ ...value, controls: next })
      }}>clear</button>}
    </div>)}</div>
    <p>Shift, Home, Backspace, and T (default chat) are detected from custom keys. You can override them by pressing a physical key or choosing it on the diagram. Unbound controls are omitted; chat is used between crafts.</p>
    {pending && <div className="keyboard-editor__capture">
      <label htmlFor="keyboard-binding-capture">{pending.kind === 'mapping' ? `New output for ${pendingLabel}` : `New binding for ${pendingLabel}`}</label>
      <input id="keyboard-binding-capture" ref={input} value="" autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="press a key…"
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.key === 'Process' || event.key === 'Dead') return
          if (['Shift', 'Control', 'Meta', 'Alt'].includes(event.key)) { modifier.current = { key: event.key, code: event.code }; return }
          modifier.current = undefined
          if (event.ctrlKey || event.metaKey) return
          event.preventDefault()
          event.stopPropagation()
          if (!event.repeat) capture(event.key, event.code)
        }}
        onKeyUp={(event) => {
          if (modifier.current?.key !== event.key) return
          const released = modifier.current
          modifier.current = undefined
          capture(released.key, released.code)
        }}
        onBlur={() => { modifier.current = undefined }}
        onChange={(event) => {
          if (Array.from(event.target.value).length === 1) capture(event.target.value)
          else if (event.target.value) setMessage('Enter or paste one character at a time.')
        }}
        onPaste={(event) => {
          event.preventDefault()
          const text = event.clipboardData.getData('text')
          if (Array.from(text).length === 1) capture(text)
          else setMessage('Paste one character at a time.')
        }}
        onPointerDown={(event) => {
          if (event.pointerType === 'touch' || event.button < 0 || event.button > 4) return
          event.preventDefault()
          capture(`Mouse${event.button}`, `Mouse${event.button}`)
        }}
        onContextMenu={(event) => event.preventDefault()} />
      <button type="button" onClick={clearPending}>{pending.kind === 'mapping' ? 'restore key' : 'clear binding'}</button>
      <button type="button" onClick={() => { setPending(undefined); setMessage('') }}>cancel</button>
      <p>To capture a mouse button, press it inside the input. On touch screens, tap the input and type a character.</p>
    </div>}
    {message && <p role="status">{message}</p>}
    {conflicts.duplicates.size > 0 && <p role="alert">Duplicate custom bindings: {Array.from(conflicts.duplicates).map(keyLabel).join(', ')}. Change, clear, or restore the red bindings before saving.</p>}
    <div><button type="button" onClick={() => { onChange(DEFAULT_KEYBOARD_SETTINGS); setPending(undefined); setMessage('') }}>reset keyboard inputs</button></div>
  </div>
}
