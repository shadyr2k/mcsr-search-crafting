export interface ScoreBreakdown {
  lengthPenalty: number
  junkPresencePenalty: number
  junkCountPenalty: number
  total: number
}

export function scoreStep(queryLength: number, junkCount: number): ScoreBreakdown {
  const lengthPenalty = Math.max(0, queryLength - 2)
  const junkPresencePenalty = junkCount > 0 ? 2 : 0
  const junkCountPenalty = 0.5 * junkCount

  return {
    lengthPenalty,
    junkPresencePenalty,
    junkCountPenalty,
    total: lengthPenalty + junkPresencePenalty + junkCountPenalty,
  }
}

export function transitionTypingCost(from: string, to: string): number {
  let retained = 0
  const comparableLength = Math.min(from.length, to.length)

  while (retained < comparableLength && from[retained] === to[retained]) {
    retained += 1
  }

  return to.length - retained
}

export function maximumValidScore(targetCount: number, visibleCount: number): number {
  return 3
    + 5 * (targetCount - 1)
    + targetCount * (2 + 0.5 * Math.max(0, visibleCount - targetCount))
}

export function incompleteScore(targetCount: number, visibleCount: number): number {
  return maximumValidScore(targetCount, visibleCount) + 5
}
