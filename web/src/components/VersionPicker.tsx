import { useEffect, useRef, useState } from 'react'

import type { GameVersion } from '../data/gameVersions'
import { isScrollbarPointer } from './outsidePointer'

interface VersionPickerProps {
  versions: readonly GameVersion[]
  selectedVersionId: string
  onVersionChange: (versionId: string) => void
}

export function VersionPicker({ versions, selectedVersionId, onVersionChange }: VersionPickerProps) {
  const [open, setOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const selected = versions.find((version) => version.id === selectedVersionId) ?? versions[0]

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (isScrollbarPointer(event)) return
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress)
  }, [open])

  return <div ref={pickerRef} className="version-picker">
    <button
      type="button"
      className="version-picker__trigger"
      aria-label="Choose Minecraft version"
      aria-expanded={open}
      aria-haspopup="menu"
      onClick={() => setOpen((current) => !current)}
    >
      {selected.id}
    </button>
    {open && <div className="version-picker__menu" role="menu" aria-label="Minecraft versions">
      {versions.map((version) => <button
        key={version.id}
        type="button"
        role="menuitemradio"
        aria-checked={version.id === selectedVersionId}
        aria-label={`Select ${version.label}`}
        onClick={() => {
          onVersionChange(version.id)
          setOpen(false)
        }}
      >
        {version.label}
      </button>)}
    </div>}
  </div>
}
