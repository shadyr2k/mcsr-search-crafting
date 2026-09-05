import horizontalChevron from '../assets/ui/chevron-horizontal.png'
import verticalChevron from '../assets/ui/chevron-vertical.png'
import keyBackspace from '../assets/ui/key-backspace.png'
import keyHome from '../assets/ui/key-home.png'
import keyShift from '../assets/ui/key-shift.png'

export type ArrowDirection = 'left' | 'right' | 'up' | 'down' | 'backspace' | 'home' | 'shift'

const spriteByDirection: Record<ArrowDirection, string> = {
  left: horizontalChevron,
  right: horizontalChevron,
  up: verticalChevron,
  down: verticalChevron,
  backspace: keyBackspace,
  home: keyHome,
  shift: keyShift,
}

const labelByDirection: Record<ArrowDirection, string> = {
  left: 'Rewind',
  right: 'Fast forward',
  up: 'Up',
  down: 'Down',
  backspace: 'Backspace',
  home: 'Home',
  shift: 'Shift',
}

export function ArrowSprite({ direction, className }: { direction: ArrowDirection; className?: string }) {
  return <img
    src={spriteByDirection[direction]}
    alt={labelByDirection[direction]}
    className={['arrow-sprite', `arrow-sprite--${direction}`, className].filter(Boolean).join(' ')}
  />
}
