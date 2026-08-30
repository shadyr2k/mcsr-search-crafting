import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import type { SearchItem } from '../domain/types'
import type { WorkspaceResult } from '../engine/optimizeWorkspace'
import type { CollectionMatchExplanation } from '../engine/search'
import { ResultPanel } from './ResultPanel'

const items = new Map<string, SearchItem>([
  ['target:bed', {
    id: 'target:bed', name: 'Bed', confidence: 'source_reproduced',
    searchLines: [{ source: 'name', text: 'Red Bed' }],
  }],
  ['target:bow', {
    id: 'target:bow', name: 'Bow', confidence: 'source_reproduced',
    searchLines: [{ source: 'name', text: 'Brown Bow' }],
  }],
  ['junk:shared', {
    id: 'junk:shared', name: 'Shared junk', confidence: 'source_reproduced',
    searchLines: [{ source: 'name', text: 'Bed Bow' }],
  }],
  ['junk:first', {
    id: 'junk:first', name: 'First-step junk', confidence: 'source_reproduced',
    searchLines: [{ source: 'name', text: 'Bed' }],
  }],
  ['target:unicode', {
    id: 'target:unicode', name: 'Unicode target', confidence: 'source_reproduced',
    searchLines: [{ source: 'name', text: '😀İx' }],
  }],
])

function directExplanation(
  itemId: string,
  query: string,
  line: string,
  start: number,
  end: number,
  text: string,
): CollectionMatchExplanation {
  const name = items.get(itemId)?.name ?? itemId
  return {
    query,
    collectionId: `collection:${itemId}`,
    recipeGroup: null,
    matchedMemberItemId: itemId,
    matchedMemberName: name,
    visibleOutputItemId: itemId,
    visibleOutputName: name,
    source: 'name',
    line,
    matchedSpan: { start, end, text },
  }
}

const result: WorkspaceResult = {
  aggregateScore: 2.5,
  skippedEmptyEntryCount: 0,
  entries: [{
    entryId: 'set-one',
    displayIndex: 0,
    targetIds: ['target:bed', 'target:bow'],
    gridSize: 3,
    visibleItemIds: ['junk:first', 'junk:shared', 'target:bed', 'target:bow'],
    availableCompleteMethod: 'single',
    bestScore: 2.5,
    incomplete: null,
    single: [{
      query: ' ',
      coveredTargetIds: ['target:bed', 'target:bow'],
      junkItemIds: ['junk:shared'],
      explanations: [
        directExplanation('target:bed', ' ', 'Red Bed', 3, 4, ' '),
        directExplanation('target:bow', ' ', 'Brown Bow', 5, 6, ' '),
        directExplanation('junk:shared', ' ', 'Bed Bow', 3, 4, ' '),
      ],
      score: { lengthPenalty: 0, junkPresencePenalty: 2, junkCountPenalty: 0.5, total: 2.5 },
    }],
    overlap: [{
      steps: [{
        query: 'bed',
        coveredTargetIds: ['target:bed'],
        newTargetIds: ['target:bed'],
        junkItemIds: ['junk:first', 'junk:shared'],
        explanations: [
          directExplanation('target:bed', 'bed', 'Red Bed', 4, 7, 'Bed'),
          directExplanation('junk:first', 'bed', 'Bed', 0, 3, 'Bed'),
          directExplanation('junk:shared', 'bed', 'Bed Bow', 0, 3, 'Bed'),
        ],
        retainedPrefix: '', freeBackspaceCount: 0, typedSuffix: 'bed',
      }, {
        query: 'bow',
        coveredTargetIds: ['target:bow'],
        newTargetIds: ['target:bow'],
        junkItemIds: ['junk:shared'],
        explanations: [
          directExplanation('target:bow', 'bow', 'Brown Bow', 6, 9, 'Bow'),
          directExplanation('junk:shared', 'bow', 'Bed Bow', 4, 7, 'Bow'),
        ],
        retainedPrefix: 'b', freeBackspaceCount: 2, typedSuffix: 'ow',
      }],
      coveredTargetIds: ['target:bed', 'target:bow'],
      junkItemIds: ['junk:first', 'junk:shared'],
      totalJunkAppearances: 3,
      newCharacterCount: 5,
      score: {
        initialLengthPenalty: 1,
        transitionTypingPenalty: 2,
        junkPresencePenalty: 4,
        junkCountPenalty: 1.5,
        total: 8.5,
      },
    }],
  }],
}

afterEach(cleanup)

describe('ResultPanel', () => {
  test('shows aggregate, independent categories, query sequence, and complete score breakdowns', () => {
    render(<ResultPanel items={items} result={result} />)

    expect(screen.getByText('Aggregate score: 2.5')).toBeTruthy()
    expect(screen.getByText('3x3 grid · Score contribution: 2.5')).toBeTruthy()
    expect(screen.getByText('Single-query supplies this set’s aggregate contribution.')).toBeTruthy()
    const single = screen.getByRole('region', { name: 'Single-query results for set 1' })
    expect(within(single).getByText((_, element) =>
      element?.tagName === 'CODE' && element.textContent === ' ',
    )).toBeTruthy()
    expect(within(single).getByText('Length penalty').nextElementSibling?.textContent).toBe('0')
    expect(within(single).getByText('Junk presence penalty').nextElementSibling?.textContent).toBe('2')
    expect(within(single).getByText('Junk count penalty').nextElementSibling?.textContent).toBe('0.5')
    expect(within(single).getByText('Total score').nextElementSibling?.textContent).toBe('2.5')

    const overlap = screen.getByRole('region', { name: 'Overlap results for set 1' })
    expect(within(overlap).getByText('Sequence: bed → bow')).toBeTruthy()
    expect(within(overlap).getByText('Initial length penalty').nextElementSibling?.textContent).toBe('1')
    expect(within(overlap).getByText('Transition typing penalty').nextElementSibling?.textContent).toBe('2')
    expect(within(overlap).getByText('Junk presence penalty').nextElementSibling?.textContent).toBe('4')
    expect(within(overlap).getByText('Junk count penalty').nextElementSibling?.textContent).toBe('1.5')
    expect(within(overlap).getByText('Total score').nextElementSibling?.textContent).toBe('8.5')
  })

  test('explains targets, per-step and repeated junk, combined junk, edits, and exact matched spans', () => {
    render(<ResultPanel items={items} result={result} />)

    const overlap = screen.getByRole('region', { name: 'Overlap results for set 1' })
    const steps = within(overlap).getAllByRole('listitem').filter((element) => element.classList.contains('result-step'))
    expect(steps).toHaveLength(2)
    expect(within(steps[0]).getByText('New targets: Bed (target:bed)')).toBeTruthy()
    expect(within(steps[1]).getByText('New targets: Bow (target:bow)')).toBeTruthy()
    expect(within(steps[0]).getByText('Junk: First-step junk (junk:first), Shared junk (junk:shared)')).toBeTruthy()
    expect(within(steps[1]).getByText('Junk: Shared junk (junk:shared)')).toBeTruthy()
    expect(within(overlap).getByText('Junk appearances charged: 3')).toBeTruthy()
    expect(within(overlap).getByText('Combined junk: First-step junk (junk:first), Shared junk (junk:shared)')).toBeTruthy()
    expect(within(steps[1]).getByText('Retained prefix: “b”')).toBeTruthy()
    expect(within(steps[1]).getByText('Free backspaces: 2')).toBeTruthy()
    expect(within(steps[1]).getByText('Typed suffix: “ow”')).toBeTruthy()

    const exactLine = within(steps[0]).getByText((_, element) =>
      element?.classList.contains('search-line') === true && element.textContent === 'Red Bed',
    )
    expect(exactLine.textContent).toBe('Red Bed')
    expect(within(exactLine).getByText('Bed').tagName).toBe('MARK')
    expect(within(steps[0]).getByText('Matched Bed (target:bed): name · span 4–7')).toBeTruthy()
  })

  test('distinguishes an alias member from the visible craftable output', () => {
    const aliasResult: WorkspaceResult = {
      ...result,
      entries: [{
        ...result.entries[0],
        targetIds: ['minecraft:white_bed'],
        visibleItemIds: ['minecraft:white_bed'],
        overlap: [],
        single: [{
          query: 'wn',
          coveredTargetIds: ['minecraft:white_bed'],
          junkItemIds: [],
          explanations: [{
            query: 'wn',
            collectionId: 'collection:bed',
            recipeGroup: 'bed',
            matchedMemberItemId: 'minecraft:brown_bed',
            matchedMemberName: 'Brown Bed',
            visibleOutputItemId: 'minecraft:white_bed',
            visibleOutputName: 'White Bed',
            source: 'name',
            line: 'Brown Bed',
            matchedSpan: { start: 3, end: 5, text: 'wn' },
          }],
          score: { lengthPenalty: 0, junkPresencePenalty: 0, junkCountPenalty: 0, total: 0 },
        }],
      }],
    }

    render(<ResultPanel items={items} result={aliasResult} />)

    expect(screen.getByText('White Bed (minecraft:white_bed) was craftable in collection bed.')).toBeTruthy()
    expect(screen.getByText('Matched Brown Bed (minecraft:brown_bed): name · span 3–5')).toBeTruthy()
    const line = screen.getByText((_, element) =>
      element?.classList.contains('search-line') === true && element.textContent === 'Brown Bed',
    )
    expect(within(line).getByText('wn').tagName).toBe('MARK')
  })

  test('promotes overlap and renders unmatched diagnostics with the maximum failure score', () => {
    const promoted: WorkspaceResult = {
      ...result,
      aggregateScore: 8.5,
      entries: [{ ...result.entries[0], single: [], bestScore: 8.5, availableCompleteMethod: 'overlap' }],
    }
    const incomplete: WorkspaceResult = {
      aggregateScore: 13,
      skippedEmptyEntryCount: 0,
      entries: [{
        ...result.entries[0],
        single: [], overlap: [], availableCompleteMethod: null, bestScore: 13,
        incomplete: { matchedTargetIds: ['target:bed'], unmatchedTargetIds: ['target:bow'], score: 13 },
      }],
    }

    const { rerender } = render(<ResultPanel items={items} result={promoted} />)
    expect(screen.getByText('Overlap is the available complete method.')).toBeTruthy()
    expect(screen.getByText('Overlap supplies this set’s aggregate contribution.')).toBeTruthy()

    rerender(<ResultPanel items={items} result={incomplete} />)
    expect(screen.getByText('No complete method is available.')).toBeTruthy()
    expect(screen.getByText('Matched targets: Bed (target:bed)')).toBeTruthy()
    expect(screen.getByText('Unmatched targets: Bow (target:bow)')).toBeTruthy()
    expect(screen.getByText('Maximum failure score: 13')).toBeTruthy()
  })

  test('presents recovery and generated-data validation errors without a result', () => {
    render(<ResultPanel
      items={items}
      warning="Recovered target-workspace state from a corrupt record."
      error="Generated data validation failed: recipes[2] is invalid."
    />)

    const alerts = screen.getAllByRole('alert')
    expect(alerts.map(({ textContent }) => textContent)).toEqual([
      'Recovered target-workspace state from a corrupt record.',
      'Generated data validation failed: recipes[2] is invalid.',
    ])
  })

  test('shows within-entry calculation progress and explains skipped empty sets', () => {
    const emptyResult: WorkspaceResult = {
      aggregateScore: 0,
      skippedEmptyEntryCount: 1,
      entries: [],
    }
    const { rerender } = render(<ResultPanel
      items={items}
      pending
      progress={{ entryId: 'set-one', entryIndex: 0, entryCount: 1, phase: 'matching', completed: 32, total: 64 }}
    />)

    expect(screen.getByText('Calculating target set 1 of 1: matching candidates (32 of 64)…')).toBeTruthy()

    rerender(<ResultPanel items={items} result={emptyResult} />)
    expect(screen.getByText('1 enabled empty target set is saved but not scored.')).toBeTruthy()
    expect(screen.queryByText('Enable a target set to include it in optimization.')).toBeNull()
  })

  test('retains workspace set numbering when disabled sets are excluded', () => {
    const secondSet = {
      ...result,
      entries: [{ ...result.entries[0], displayIndex: 1 }],
    } as WorkspaceResult

    render(<ResultPanel items={items} result={secondSet} />)

    expect(screen.getByRole('heading', { name: 'Target set 2' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Single-query results for set 2' })).toBeTruthy()
  })

  test('highlights a UTF-16 span after astral and lowercase-expanding characters exactly', () => {
    const unicodeResult: WorkspaceResult = {
      aggregateScore: 0,
      skippedEmptyEntryCount: 0,
      entries: [{
        ...result.entries[0],
        targetIds: ['target:unicode'], visibleItemIds: ['target:unicode'], overlap: [], bestScore: 0,
        single: [{
          query: 'x', coveredTargetIds: ['target:unicode'], junkItemIds: [],
          explanations: [directExplanation('target:unicode', 'x', '😀İx', 3, 4, 'x')],
          score: { lengthPenalty: 0, junkPresencePenalty: 0, junkCountPenalty: 0, total: 0 },
        }],
      }],
    }

    render(<ResultPanel items={items} result={unicodeResult} />)

    const line = screen.getByText((_, element) =>
      element?.classList.contains('search-line') === true && element.textContent === '😀İx',
    )
    expect(line.textContent).toBe('😀İx')
    expect(within(line).getByText('x').tagName).toBe('MARK')
    expect(screen.getByText('Matched Unicode target (target:unicode): name · span 3–4')).toBeTruthy()
  })
})
