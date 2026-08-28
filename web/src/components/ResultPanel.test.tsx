import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import type { SearchItem } from '../domain/types'
import type { WorkspaceResult } from '../engine/optimizeWorkspace'
import { ResultPanel } from './ResultPanel'

const items = new Map<string, SearchItem>([
  ['target:bed', {
    id: 'target:bed', name: 'Bed', confidence: 'source_reproduced',
    searchLines: [{ source: 'name', text: 'Red Bed' }],
  }],
  ['target:bow', {
    id: 'target:bow', name: 'Bow', confidence: 'source_reproduced',
    searchLines: [{ source: 'name', text: 'Bow' }],
  }],
  ['junk:shared', {
    id: 'junk:shared', name: 'Shared junk', confidence: 'source_reproduced',
    searchLines: [{ source: 'name', text: 'Bed Bow' }],
  }],
])

const result: WorkspaceResult = {
  aggregateScore: 8,
  entries: [{
    entryId: 'set-one',
    entryOrder: 0,
    targetIds: ['target:bed', 'target:bow'],
    gridSize: 3,
    visibleItemIds: ['junk:shared', 'target:bed', 'target:bow'],
    availableCompleteMethod: 'single',
    bestScore: 3.5,
    incomplete: null,
    single: [{
      query: 'b',
      coveredTargetIds: ['target:bed', 'target:bow'],
      junkItemIds: ['junk:shared'],
      explanations: [{
        itemId: 'target:bed', source: 'name', line: 'Red Bed',
        matchedSpan: { start: 4, end: 5, text: 'B' },
      }],
      score: { lengthPenalty: 0, junkPresencePenalty: 2, junkCountPenalty: 0.5, total: 2.5 },
    }],
    overlap: [{
      steps: [{
        query: 'bed',
        coveredTargetIds: ['target:bed'],
        newTargetIds: ['target:bed'],
        junkItemIds: ['junk:shared'],
        explanations: [{
          itemId: 'target:bed', source: 'name', line: 'Red Bed',
          matchedSpan: { start: 4, end: 7, text: 'Bed' },
        }],
        retainedPrefix: '', freeBackspaceCount: 0, typedSuffix: 'bed',
      }, {
        query: 'bow',
        coveredTargetIds: ['target:bow'],
        newTargetIds: ['target:bow'],
        junkItemIds: ['junk:shared'],
        explanations: [{
          itemId: 'target:bow', source: 'name', line: 'Bow',
          matchedSpan: { start: 0, end: 3, text: 'Bow' },
        }],
        retainedPrefix: 'b', freeBackspaceCount: 2, typedSuffix: 'ow',
      }],
      coveredTargetIds: ['target:bed', 'target:bow'],
      junkItemIds: ['junk:shared'],
      totalJunkAppearances: 2,
      newCharacterCount: 5,
      score: {
        initialLengthPenalty: 1,
        transitionTypingPenalty: 2,
        junkPresencePenalty: 4,
        junkCountPenalty: 1,
        total: 8,
      },
    }],
  }],
}

afterEach(cleanup)

describe('ResultPanel', () => {
  test('shows aggregate, independent categories, query sequence, and complete score breakdowns', () => {
    render(<ResultPanel items={items} result={result} />)

    expect(screen.getByText('Aggregate score: 8')).toBeTruthy()
    const single = screen.getByRole('region', { name: 'Single-query results for set 1' })
    expect(within(single).getByText('b', { selector: 'code' })).toBeTruthy()
    expect(within(single).getByText('Length penalty').nextElementSibling?.textContent).toBe('0')
    expect(within(single).getByText('Junk presence penalty').nextElementSibling?.textContent).toBe('2')
    expect(within(single).getByText('Junk count penalty').nextElementSibling?.textContent).toBe('0.5')
    expect(within(single).getByText('Total score').nextElementSibling?.textContent).toBe('2.5')

    const overlap = screen.getByRole('region', { name: 'Overlap results for set 1' })
    expect(within(overlap).getByText('Sequence: bed → bow')).toBeTruthy()
    expect(within(overlap).getByText('Initial length penalty').nextElementSibling?.textContent).toBe('1')
    expect(within(overlap).getByText('Transition typing penalty').nextElementSibling?.textContent).toBe('2')
    expect(within(overlap).getByText('Junk presence penalty').nextElementSibling?.textContent).toBe('4')
    expect(within(overlap).getByText('Junk count penalty').nextElementSibling?.textContent).toBe('1')
    expect(within(overlap).getByText('Total score').nextElementSibling?.textContent).toBe('8')
  })

  test('explains targets, per-step and repeated junk, combined junk, edits, and exact matched spans', () => {
    render(<ResultPanel items={items} result={result} />)

    const overlap = screen.getByRole('region', { name: 'Overlap results for set 1' })
    const steps = within(overlap).getAllByRole('listitem').filter((element) => element.classList.contains('result-step'))
    expect(steps).toHaveLength(2)
    expect(within(steps[0]).getByText('New targets: Bed (target:bed)')).toBeTruthy()
    expect(within(steps[1]).getByText('New targets: Bow (target:bow)')).toBeTruthy()
    expect(within(steps[0]).getByText('Junk: Shared junk (junk:shared)')).toBeTruthy()
    expect(within(steps[1]).getByText('Junk: Shared junk (junk:shared)')).toBeTruthy()
    expect(within(overlap).getByText('Junk appearances charged: 2')).toBeTruthy()
    expect(within(overlap).getByText('Combined junk: Shared junk (junk:shared)')).toBeTruthy()
    expect(within(steps[1]).getByText('Retained prefix: “b”')).toBeTruthy()
    expect(within(steps[1]).getByText('Free backspaces: 2')).toBeTruthy()
    expect(within(steps[1]).getByText('Typed suffix: “ow”')).toBeTruthy()

    const exactLine = within(steps[0]).getByText((_, element) =>
      element?.classList.contains('search-line') === true && element.textContent === 'Red Bed',
    )
    expect(exactLine.textContent).toBe('Red Bed')
    expect(within(exactLine).getByText('Bed').tagName).toBe('MARK')
    expect(within(steps[0]).getByText('name · target:bed · span 4–7')).toBeTruthy()
  })

  test('promotes overlap and renders unmatched diagnostics with the maximum failure score', () => {
    const promoted: WorkspaceResult = {
      ...result,
      entries: [{ ...result.entries[0], single: [], availableCompleteMethod: 'overlap' }],
    }
    const incomplete: WorkspaceResult = {
      aggregateScore: 13,
      entries: [{
        ...result.entries[0],
        single: [], overlap: [], availableCompleteMethod: null, bestScore: 13,
        incomplete: { matchedTargetIds: ['target:bed'], unmatchedTargetIds: ['target:bow'], score: 13 },
      }],
    }

    const { rerender } = render(<ResultPanel items={items} result={promoted} />)
    expect(screen.getByText('Overlap is the available complete method.')).toBeTruthy()

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

  test('retains workspace set numbering when disabled sets are excluded', () => {
    const secondSet = {
      ...result,
      entries: [{ ...result.entries[0], entryOrder: 1 }],
    } as WorkspaceResult

    render(<ResultPanel items={items} result={secondSet} />)

    expect(screen.getByRole('heading', { name: 'Target set 2' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Single-query results for set 2' })).toBeTruthy()
  })
})
