import type { CraftingRecipe } from '../domain/types'

export type GridSize = 2 | 3

function fitsGrid(recipe: CraftingRecipe, gridSize: GridSize): boolean {
  return gridSize === 2
    ? recipe.fits2x2
    : recipe.fits2x2 || recipe.fits3x3
}

export function isRecipeCraftable(
  recipe: CraftingRecipe,
  inventory: Set<string>,
  gridSize: GridSize,
): boolean {
  return fitsGrid(recipe, gridSize) && recipe.ingredientSlots.every((slot) =>
    slot.acceptedItems.some((itemId) => inventory.has(itemId)),
  )
}

export function visibleOutputIds(
  recipes: CraftingRecipe[],
  inventory: Set<string>,
  gridSize: GridSize,
): Set<string> {
  return new Set(
    recipes
      .filter((recipe) => isRecipeCraftable(recipe, inventory, gridSize))
      .map((recipe) => recipe.outputItemId),
  )
}

export function targetSupports2x2(targetId: string, recipes: CraftingRecipe[]): boolean {
  return recipes.some((recipe) => recipe.outputItemId === targetId && recipe.fits2x2)
}
