import { useEffect, useRef } from 'react'

import type { CraftingRecipe } from '../domain/types'

interface GridSizeSwitchProps {
  value: 2 | 3
  targetIds: readonly string[]
  recipes: readonly CraftingRecipe[]
  onChange: (gridSize: 2 | 3) => void
}

function needs3x3(targetIds: readonly string[], recipes: readonly CraftingRecipe[]): boolean {
  return targetIds.some((targetId) => !recipes.some((recipe) => (
    recipe.outputItemId === targetId && recipe.fits2x2
  )))
}

export function GridSizeSwitch({ value, targetIds, recipes, onChange }: GridSizeSwitchProps) {
  const requires3x3 = needs3x3(targetIds, recipes)
  const displayedValue = requires3x3 ? 3 : value
  const forcedKey = `${targetIds.join('\u0000')}\u0000${value}`
  const lastForcedKey = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (requires3x3 && value === 2 && lastForcedKey.current !== forcedKey) {
      lastForcedKey.current = forcedKey
      onChange(3)
    }
    if (!requires3x3 || value === 3) lastForcedKey.current = undefined
  }, [forcedKey, onChange, requires3x3, value])

  return <label className="grid-size-switch">
    <span>2×2</span>
    <input
      type="checkbox"
      role="switch"
      aria-label="Crafting grid size"
      aria-checked={displayedValue === 3}
      checked={displayedValue === 3}
      disabled={requires3x3}
      onChange={(event) => onChange(event.target.checked ? 3 : 2)}
    />
    <span>3×3</span>
  </label>
}
