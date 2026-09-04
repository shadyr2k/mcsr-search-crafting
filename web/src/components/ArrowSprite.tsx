import backspace from '../assets/ui/backspace.png'
import horizontalChevron from '../assets/ui/chevron-horizontal.png'
import verticalChevron from '../assets/ui/chevron-vertical.png'
import shiftHome from '../assets/ui/shift-home.png'

export type ArrowDirection = 'left' | 'right' | 'up' | 'down' | 'backspace' | 'shift-home'

const spriteByDirection: Record<ArrowDirection, string> = {
  left: horizontalChevron,
  right: horizontalChevron,
  up: verticalChevron,
  down: verticalChevron,
  backspace,
  'shift-home': shiftHome,
}

const labelByDirection: Record<ArrowDirection, string> = {
  left: 'Rewind',
  right: 'Fast forward',
  up: 'Up',
  down: 'Down',
  backspace: 'Backspace',
  'shift-home': 'Shift+Home',
}

export function ArrowSprite({ direction, className }: { direction: ArrowDirection; className?: string }) {
  return <img
    src={spriteByDirection[direction]}
    alt={labelByDirection[direction]}
    className={['arrow-sprite', `arrow-sprite--${direction}`, className].filter(Boolean).join(' ')}
  />
}
