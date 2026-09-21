import { ArrowSprite } from './ArrowSprite'

export type QueryControlKind = 'shift-home' | 'backspace'

interface QueryControlProps {
  kind: QueryControlKind
  backspaceCount?: number
  textKeycaps?: boolean
  keycapClassName?: string
}

export function QueryControl({ kind, backspaceCount = 1, textKeycaps = false, keycapClassName }: QueryControlProps) {
  const shiftHome = kind === 'shift-home'
  const label = shiftHome
    ? 'Shift+Home: replace search'
    : `${backspaceCount} backspace${backspaceCount === 1 ? '' : 's'}`
  const title = shiftHome
    ? 'Select the previous query, then replace it'
    : label

  if (textKeycaps) return <kbd className={`query-control-keycap${keycapClassName ? ` ${keycapClassName}` : ''}`} aria-label={label} title={title}>
    {shiftHome ? 'SH' : <span aria-hidden="true">←{backspaceCount > 1 ? ` ×${backspaceCount}` : ''}</span>}
  </kbd>

  return shiftHome
    ? <span className="craft-query__shortcut" aria-label="Shift+Home"><ArrowSprite direction="shift" /><ArrowSprite direction="home" /></span>
    : <span className="craft-query__backspaces" aria-label={label}>
      {Array.from({ length: backspaceCount }, (_, index) => <ArrowSprite key={index} direction="backspace" />)}
    </span>
}
