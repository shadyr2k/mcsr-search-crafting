import { useEffect, useMemo, useState } from 'react'
import { buildKeyboardSequence, type KeyboardSettings } from '../domain/keyboard'
import type { RankedSearch } from '../domain/types'
import { KeyboardVisualization } from './KeyboardVisualization'

export function KeyboardPlayback({ search, settings, removeAnimations = false }: { search: RankedSearch; settings: KeyboardSettings; removeAnimations?: boolean }) {
  const tokens = useMemo(() => buildKeyboardSequence(search, settings), [search, settings])
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true)
  const still = removeAnimations || reducedMotion
  const [playing, setPlaying] = useState(true)
  const [position, setPosition] = useState(0)
  const [pass, setPass] = useState(0)
  const [visible, setVisible] = useState(!document.hidden)

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media?.matches === true)
    media?.addEventListener?.('change', update)
    const visibility = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', visibility)
    return () => { media?.removeEventListener?.('change', update); document.removeEventListener('visibilitychange', visibility) }
  }, [])

  useEffect(() => { setPosition(0); setPass(0) }, [tokens])
  useEffect(() => {
    if (!playing || still || !visible || tokens.length === 0) return
    const timer = window.setTimeout(() => {
      setPosition((current) => (current + 1) % tokens.length)
      setPass((current) => current + 1)
    }, position === tokens.length - 1 ? 1200 : 520)
    return () => window.clearTimeout(timer)
  }, [playing, position, pass, still, tokens.length, visible])

  const current = tokens[position]
  const missing = [...new Set(tokens.filter((token) => token.missing).map((token) => token.label))]
  return <div className={`keyboard-playback${still || !playing ? ' keyboard-playback--still' : ''}`}>
    <div className="keyboard-playback__translation" aria-label="Your keys" dir="ltr">
      <span>your keys</span>
      {tokens.map((token, index) => <span key={index} className={`keyboard-playback__token keyboard-playback__token--${token.kind}${position === index ? ' keyboard-playback__token--active' : ''}`} title={token.missing ? `No key bound for ${token.label}` : token.kind === 'character' ? undefined : token.kind === 'replace' ? 'Shift + Home' : token.kind}>
        {token.kind === 'character' && token.label.length === 1 ? token.label : `(${token.label})`}{token.missing && '?'}
      </span>)}
    </div>
    <KeyboardVisualization highlights={current ? [current] : []} pulse={pass} showLabels={false} />
    <div className="keyboard-playback__actions">
      {!still && <button type="button" disabled={tokens.length === 0} onClick={() => setPlaying((value) => !value)}>{playing ? 'pause sequence' : 'play sequence'}</button>}
      <button type="button" disabled={tokens.length === 0} onClick={() => { setPosition(0); setPass((value) => value + 1); setPlaying(true) }}>replay sequence</button>
      <button type="button" disabled={tokens.length === 0} onClick={() => { setPlaying(false); setPosition((value) => (value + 1) % tokens.length); setPass((value) => value + 1) }}>next key</button>
    </div>
    {missing.length > 0 && <p>Unmapped characters: {missing.join(', ')}</p>}
  </div>
}
