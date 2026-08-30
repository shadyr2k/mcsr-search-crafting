import type { CraftingRecipe } from '../domain/types'

export type GridSize = 2 | 3

function fitsGrid(recipe: CraftingRecipe, gridSize: GridSize): boolean {
  return gridSize === 2
    ? recipe.fits2x2
    : recipe.fits2x2 || recipe.fits3x3
}

export function isRecipeCraftable(
  recipe: CraftingRecipe,
  inventory: ReadonlySet<string>,
  gridSize: GridSize,
): boolean {
  return fitsGrid(recipe, gridSize) && recipe.ingredientSlots.every((slot) =>
    slot.acceptedItems.some((itemId) => inventory.has(itemId)),
  )
}

export function eligibleRecipes(
  recipes: readonly CraftingRecipe[],
  inventory: ReadonlySet<string>,
  gridSize: GridSize,
): CraftingRecipe[] {
  return recipes.filter((recipe) => isRecipeCraftable(recipe, inventory, gridSize))
}

export function visibleOutputIds(
  recipes: readonly CraftingRecipe[],
  inventory: ReadonlySet<string>,
  gridSize: GridSize,
): Set<string> {
  return new Set(
    eligibleRecipes(recipes, inventory, gridSize).map((recipe) => recipe.outputItemId),
  )
}

export function targetSupports2x2(targetId: string, recipes: CraftingRecipe[]): boolean {
  return recipes.some((recipe) => recipe.outputItemId === targetId && recipe.fits2x2)
}
