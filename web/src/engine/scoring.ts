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

export function sharedCharacterCount(left: string, right: string): number {
  const leftCharacters = new Set(left)
  const sharedCharacters = new Set<string>()

  for (const character of right) {
    if (leftCharacters.has(character)) sharedCharacters.add(character)
  }

  return sharedCharacters.size
}

export function sequenceCharacterReuse(queries: readonly string[]): number {
  let reuseCount = 0

  for (let index = 0; index < queries.length; index += 1) {
    for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
      reuseCount += sharedCharacterCount(queries[previousIndex], queries[index])
    }
  }

  return reuseCount
}

export function maximumValidScore(targetCount: number, visibleCount: number): number {
  return 3
    + 5 * (targetCount - 1)
    + targetCount * (2 + 0.5 * Math.max(0, visibleCount - targetCount))
}

export function incompleteScore(targetCount: number, visibleCount: number): number {
  return maximumValidScore(targetCount, visibleCount) + 5
}
