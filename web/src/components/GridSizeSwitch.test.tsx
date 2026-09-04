import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { CraftingRecipe } from '../domain/types'
import { GridSizeSwitch } from './GridSizeSwitch'

afterEach(cleanup)

const recipes: CraftingRecipe[] = [{
  id: 'minecraft:iron_sword',
  recipeGroup: null,
  recipeBookCategory: 'crafting_equipment',
  resultCollectionId: 'crafting_equipment/recipe/sword',
  outputItemId: 'minecraft:iron_sword',
  outputCount: 1,
  ingredientSlots: [{ acceptedItems: ['minecraft:iron_ingot'] }],
  fits2x2: false,
  fits3x3: true,
}]

describe('GridSizeSwitch', () => {
  test('silently forces and locks 3x3 when any goal needs it', () => {
    const onChange = vi.fn()
    render(<GridSizeSwitch value={2} targetIds={['minecraft:iron_sword']} recipes={recipes} onChange={onChange} />)

    const switchControl = screen.getByRole('switch', { name: 'Crafting grid size' }) as HTMLInputElement
    expect(switchControl.getAttribute('aria-checked')).toBe('true')
    expect(switchControl.disabled).toBe(true)
    expect(screen.queryByText(/cannot be crafted/i)).toBeNull()
    expect(onChange).toHaveBeenCalledWith(3)
  })
})
