export interface ScoringSettings {
  freeInitialCharacters: number
  additionalCharacterPenalty: number
  junkExistingPenalty: number
  junkItemPenalty: number
  backspacePenalty: number
  shiftHomePenalty: number
}

export const DEFAULT_SCORING_SETTINGS: Readonly<ScoringSettings> = {
  freeInitialCharacters: 2,
  additionalCharacterPenalty: 1,
  junkExistingPenalty: 2,
  junkItemPenalty: .5,
  backspacePenalty: 0,
  shiftHomePenalty: 0,
}

const MAX_QUERY_LENGTH = 5

function wholeNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(MAX_QUERY_LENGTH, Math.max(0, Math.round(value))) : fallback
}

function penalty(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : fallback
}

export function normalizeScoringSettings(settings: Partial<ScoringSettings> | undefined): ScoringSettings {
  return {
    freeInitialCharacters: wholeNumber(settings?.freeInitialCharacters ?? DEFAULT_SCORING_SETTINGS.freeInitialCharacters, DEFAULT_SCORING_SETTINGS.freeInitialCharacters),
    additionalCharacterPenalty: penalty(settings?.additionalCharacterPenalty ?? DEFAULT_SCORING_SETTINGS.additionalCharacterPenalty, DEFAULT_SCORING_SETTINGS.additionalCharacterPenalty),
    junkExistingPenalty: penalty(settings?.junkExistingPenalty ?? DEFAULT_SCORING_SETTINGS.junkExistingPenalty, DEFAULT_SCORING_SETTINGS.junkExistingPenalty),
    junkItemPenalty: penalty(settings?.junkItemPenalty ?? DEFAULT_SCORING_SETTINGS.junkItemPenalty, DEFAULT_SCORING_SETTINGS.junkItemPenalty),
    backspacePenalty: penalty(settings?.backspacePenalty ?? DEFAULT_SCORING_SETTINGS.backspacePenalty, DEFAULT_SCORING_SETTINGS.backspacePenalty),
    shiftHomePenalty: penalty(settings?.shiftHomePenalty ?? DEFAULT_SCORING_SETTINGS.shiftHomePenalty, DEFAULT_SCORING_SETTINGS.shiftHomePenalty),
  }
}

export function scoringSettingsFingerprint(settings: ScoringSettings): string {
  return JSON.stringify(normalizeScoringSettings(settings))
}

export interface ScoreBreakdown {
  lengthPenalty: number
  junkPresencePenalty: number
  junkCountPenalty: number
  total: number
}

export interface ControlPenalty {
  backspacePenalty: number
  shiftHomePenalty: number
  total: number
}

export function scoreStep(queryLength: number, junkCount: number, settings: ScoringSettings = DEFAULT_SCORING_SETTINGS): ScoreBreakdown {
  const lengthPenalty = Math.max(0, queryLength - settings.freeInitialCharacters) * settings.additionalCharacterPenalty
  const junkPresencePenalty = junkCount > 0 ? settings.junkExistingPenalty : 0
  const junkCountPenalty = settings.junkItemPenalty * junkCount

  return {
    lengthPenalty,
    junkPresencePenalty,
    junkCountPenalty,
    total: lengthPenalty + junkPresencePenalty + junkCountPenalty,
  }
}

export function scoreControlKeys(
  previousQuery: string,
  transition: { retainedPrefix: string; freeBackspaceCount: number },
  settings: ScoringSettings = DEFAULT_SCORING_SETTINGS,
): ControlPenalty {
  const usesShiftHome = transition.retainedPrefix.length === 0 && transition.freeBackspaceCount >= previousQuery.length
  const backspacePenalty = usesShiftHome ? 0 : transition.freeBackspaceCount * settings.backspacePenalty
  const shiftHomePenalty = usesShiftHome ? settings.shiftHomePenalty : 0
  return { backspacePenalty, shiftHomePenalty, total: backspacePenalty + shiftHomePenalty }
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

export function maximumValidScore(targetCount: number, visibleCount: number, settings: ScoringSettings = DEFAULT_SCORING_SETTINGS): number {
  return Math.max(0, MAX_QUERY_LENGTH - settings.freeInitialCharacters) * settings.additionalCharacterPenalty
    + MAX_QUERY_LENGTH * settings.additionalCharacterPenalty * Math.max(0, targetCount - 1)
    + targetCount * (settings.junkExistingPenalty + settings.junkItemPenalty * Math.max(0, visibleCount - targetCount))
}

export function incompleteScore(targetCount: number, visibleCount: number, settings: ScoringSettings = DEFAULT_SCORING_SETTINGS): number {
  return maximumValidScore(targetCount, visibleCount, settings) + 5
}
