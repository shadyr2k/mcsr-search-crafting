import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

  test('uses the slider to switch between available grid sizes', () => {
    const onChange = vi.fn()
    render(<GridSizeSwitch value={2} targetIds={[]} recipes={recipes} onChange={onChange} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Crafting grid size' }))

    expect(onChange).toHaveBeenCalledWith(3)
  })

  test('labels the control and gives both grid values their own label treatment', () => {
    render(<GridSizeSwitch value={3} targetIds={[]} recipes={recipes} onChange={vi.fn()} />)

    expect(screen.getByText('craft space').className).toContain('grid-size-switch__title')
    expect(screen.getByText('2×2').className).toContain('grid-size-switch__label')
    expect(screen.getByText('3×3').className).toContain('grid-size-switch__label')
  })

  test('uses mutually exclusive buttons in compact layout', () => {
    const onChange = vi.fn()
    render(<GridSizeSwitch value={2} targetIds={[]} recipes={recipes} compactLayout onChange={onChange} />)

    expect(screen.queryByRole('switch', { name: 'Crafting grid size' })).toBeNull()
    expect(screen.getByRole('button', { name: '2×2' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '3×3' }))
    expect(onChange).toHaveBeenCalledWith(3)
  })
})
