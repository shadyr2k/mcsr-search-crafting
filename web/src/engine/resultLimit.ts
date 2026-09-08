export const MAX_RECIPE_BOOK_RESULTS = 40

export function maximumJunkItems(targetCount: number): number {
  return Math.max(0, MAX_RECIPE_BOOK_RESULTS - targetCount)
}
