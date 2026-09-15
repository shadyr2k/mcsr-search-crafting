import { useEffect, useRef, useState } from 'react'

import type { IconManifest } from '../data/iconManifest'
import type { ThemeColor, ThemePreference } from '../persistence/storage'
import { ItemIcon } from './ItemIcon'

const themeOptions: ReadonlyArray<{ color: ThemeColor; label: string; itemId: string }> = [
  { color: 'white', label: 'plain white / black', itemId: 'minecraft:white_dye' },
  { color: 'pink', label: 'pink', itemId: 'minecraft:pink_dye' },
  { color: 'red', label: 'red', itemId: 'minecraft:red_dye' },
  { color: 'orange', label: 'orange', itemId: 'minecraft:orange_dye' },
  { color: 'yellow', label: 'yellow', itemId: 'minecraft:yellow_dye' },
  { color: 'green', label: 'green', itemId: 'minecraft:green_dye' },
  { color: 'blue', label: 'blue', itemId: 'minecraft:blue_dye' },
  { color: 'cyan', label: 'cyan', itemId: 'minecraft:cyan_dye' },
  { color: 'purple', label: 'purple', itemId: 'minecraft:purple_dye' },
  { color: 'gray', label: 'regular gray', itemId: 'minecraft:gray_dye' },
]

interface ThemePickerProps {
  theme: ThemePreference
  icons: IconManifest
  onThemeColorChange: (color: ThemeColor) => void
}

export function ThemePicker({ theme, icons, onThemeColorChange }: ThemePickerProps) {
  const [open, setOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress)
  }, [open])

  return <div ref={pickerRef} className="theme-picker">
    <button
      type="button"
      className="theme-picker__trigger"
      aria-label="Choose color theme"
      aria-expanded={open}
      aria-haspopup="menu"
      onClick={() => setOpen((current) => !current)}
    >
      <ItemIcon itemId="minecraft:painting" name="Color themes" manifest={icons} />
    </button>
    {open && <div className="theme-picker__menu" role="menu" aria-label="Color themes">
      {themeOptions.map((option) => <button
        key={option.color}
        type="button"
        role="menuitemradio"
        aria-checked={theme.color === option.color}
        aria-label={`Select ${option.label} theme`}
        title={option.label}
        onClick={() => {
          onThemeColorChange(option.color)
          setOpen(false)
        }}
      >
        <ItemIcon itemId={option.itemId} name={`${option.label} dye`} manifest={icons} />
      </button>)}
    </div>}
  </div>
}
