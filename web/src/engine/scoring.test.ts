import { describe, expect, test } from 'vitest'

import {
  incompleteScore,
  maximumValidScore,
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
})

describe('transitionTypingCost', () => {
  test('counts only the suffix typed after the longest common prefix', () => {
    expect(transitionTypingCost('bed', 'bow')).toBe(2)
  })

  test('treats backspacing to a prefix as free', () => {
    expect(transitionTypingCost('iron', 'iro')).toBe(0)
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
