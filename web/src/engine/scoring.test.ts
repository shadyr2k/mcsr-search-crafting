import { describe, expect, test } from 'vitest'

import {
  DEFAULT_SCORING_SETTINGS,
  incompleteScore,
  maximumValidScore,
  scoringSettingsFingerprint,
  scoreControlKeys,
  sequenceCharacterReuse,
  scoreStep,
  transitionTypingCost,
} from './scoring'

describe('scoreStep', () => {
  test('returns an explainable total from length and distinct junk penalties', () => {
    expect(scoreStep(3, 2)).toEqual({
      lengthPenalty: 1,
      junkPresencePenalty: 2,
      junkCountPenalty: 1,
      total: 4,
    })
  })

  test('gives one- and two-character clean queries no score penalty', () => {
    expect(scoreStep(2, 0).total).toBe(0)
    expect(scoreStep(3, 0).total).toBe(1)
  })

  test('charges each junk item after the junk-presence penalty', () => {
    expect(scoreStep(1, 2).total).toBe(3)
  })

  test('uses the saved character and junk penalties', () => {
    const settings = {
      ...DEFAULT_SCORING_SETTINGS,
      freeInitialCharacters: 1,
      additionalCharacterPenalty: 1.5,
      junkExistingPenalty: 4,
      junkItemPenalty: .25,
    }

    expect(scoreStep(3, 2, settings)).toMatchObject({
      lengthPenalty: 3,
      junkPresencePenalty: 4,
      junkCountPenalty: .5,
      total: 7.5,
    })
  })
})

describe('transitionTypingCost', () => {
  test('counts only the suffix typed after the longest common prefix', () => {
    expect(transitionTypingCost('bed', 'bow')).toBe(2)
  })

  test('treats backspacing to a prefix as free', () => {
    expect(transitionTypingCost('iron', 'iro')).toBe(0)
  })

  test('scores backspaces and Shift+Home independently', () => {
    const settings = { ...DEFAULT_SCORING_SETTINGS, backspacePenalty: .5, shiftHomePenalty: 3 }
    expect(scoreControlKeys('bed', { retainedPrefix: 'b', freeBackspaceCount: 2 }, settings)).toEqual({ backspacePenalty: 1, shiftHomePenalty: 0, total: 1 })
    expect(scoreControlKeys('bed', { retainedPrefix: '', freeBackspaceCount: 3 }, settings)).toEqual({ backspacePenalty: 0, shiftHomePenalty: 3, total: 3 })
  })
})

describe('scoringSettingsFingerprint', () => {
  test('changes when any calculation setting changes', () => {
    const baseline = scoringSettingsFingerprint(DEFAULT_SCORING_SETTINGS)

    expect(scoringSettingsFingerprint({ ...DEFAULT_SCORING_SETTINGS, additionalCharacterPenalty: 2 })).not.toBe(baseline)
    expect(scoringSettingsFingerprint({ ...DEFAULT_SCORING_SETTINGS, backspacePenalty: 1 })).not.toBe(baseline)
    expect(scoringSettingsFingerprint({ ...DEFAULT_SCORING_SETTINGS, junkItemPenalty: 1 })).not.toBe(baseline)
  })
})

describe('sequenceCharacterReuse', () => {
  test('counts distinct characters shared by each pair of query terms', () => {
    expect(sequenceCharacterReuse(['on sw', 'd sw', 'e sw'])).toBe(9)
    expect(sequenceCharacterReuse(['+5 at', 'd sw', 'e sw'])).toBe(5)
  })
})

describe('incompleteScore', () => {
  test('is five points higher than the clamped maximum valid score', () => {
    expect(incompleteScore(2, 10)).toBe(maximumValidScore(2, 10) + 5)
  })

  test('clamps the potential junk count when targets exceed visible outputs', () => {
    expect(maximumValidScore(4, 2)).toBe(26)
  })
})
