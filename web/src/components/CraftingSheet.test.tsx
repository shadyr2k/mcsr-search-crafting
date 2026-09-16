import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

import type { RankedSearch, RowOptimizationState, TargetWorkspaceEntry } from '../domain/types'
import { createCraftingSheetModel } from '../engine/craftingSheet'
import { CraftingSheet, type CraftingSheetProps } from './CraftingSheet'

afterEach(cleanup)

function search(query: string, target = 'bed'): RankedSearch {
  const score = Math.max(0, query.length - 2)
  return {
    kind: 'single', queries: [query], coveredTargetIds: [target], totalJunkAppearances: 0,
    totalTypedCharacters: query.length, totalScore: score,
    steps: [{ query, typedSuffix: query, retainedPrefix: '', freeBackspaceCount: 0,
      coveredTargetIds: [target], newTargetIds: [target], junkItemIds: [], explanations: [],
      score: { typingPenalty: score, junkPresencePenalty: 0, junkCountPenalty: 0, total: score } }],
  }
}

function props(): CraftingSheetProps {
  const entry: TargetWorkspaceEntry = { id: 'bed-anchor', targetIds: ['bed', 'anchor'], inventoryItemIds: [], enabled: true, gridSize: 3, order: 0 }
  const searches = [search('be'), search('bed'), ...Array.from({ length: 45 }, (_, i) => search(`q${i}`))]
  const state: RowOptimizationState = { status: 'ready', fingerprint: 'test', outcome: {
    kind: 'ranked', entryId: entry.id, rankedSearches: searches, bestScore: 0, visibleItemIds: [],
    itemSearches: { bed: searches, anchor: [search('aw', 'anchor')] },
  } }
  return {
    languageName: 'english', ...createCraftingSheetModel([entry], new Map([[entry.id, state]])),
    defaultOpen: true, onSelectCraft: vi.fn(), onSetEntryDisabled: vi.fn(), onReset: vi.fn(),
    onSetCraftMode: vi.fn(), onSelectItemCraft: vi.fn(),
  }
}

describe('CraftingSheet', () => {
  test('opens a cheat sheet with totals and all item sets immediately reachable', () => {
    render(<CraftingSheet {...props()} defaultOpen={false} />)
    const toggle = screen.getByRole('button', { name: 'english search crafts' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(screen.getByLabelText('Total characters')).toHaveTextContent('2')
    expect(screen.getByLabelText('Distinct characters')).toHaveTextContent('2')
    expect(screen.getByRole('region', { name: 'item set 1' })).toBeVisible()
    expect(screen.getByText('bed')).toBeVisible()
    expect(screen.getByText('anchor')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Expand item set 1' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByLabelText('Selected query for bed')).toHaveTextContent('be')
    expect(screen.queryByRole('button', { name: 'choose craft for item set 1' })).not.toBeInTheDocument()
  })

  test('keeps inclusion independent of expansion and retains the editor while animating closed', () => {
    const input = props()
    render(<CraftingSheet {...input} />)
    const toggle = screen.getByRole('button', { name: 'Expand item set 1' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include item set 1' }))
    expect(input.onSetEntryDisabled).toHaveBeenCalledWith('bed-anchor', true)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'choose craft for item set 1' })).toBeVisible()
    expect(screen.getByText('2 chars')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse item set 1' }))
    const details = document.getElementById(toggle.getAttribute('aria-controls')!)!
    expect(details).toHaveAttribute('aria-hidden', 'true')
    expect(details).toHaveAttribute('inert')
    expect(within(details).getByText('choose craft')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'choose craft for item set 1' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'english search crafts' }))
    expect(screen.queryByRole('region', { name: 'Selected item sets' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'english search crafts' }))
    expect(screen.getByRole('button', { name: 'Expand item set 1' })).toBeVisible()
  })

  test('filters alternatives beyond the top ten and displays their efficiency cost', () => {
    const input = props()
    render(<CraftingSheet {...input} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand item set 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'choose craft for item set 1' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter crafts for item set 1' }), { target: { value: 'q44' } })
    const choices = screen.getByRole('region', { name: 'Calculated crafts for item set 1' })
    const option = within(choices).getByRole('button', { name: /q44/ })
    expect(option).toHaveTextContent('+1 score')
    fireEvent.click(option)
    expect(input.onSelectCraft).toHaveBeenCalledWith('bed-anchor', input.entries[0].options.find((value) => value.label === 'q44')!.id)
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  test('switches to individual items and allows each item to choose a craft', () => {
    const input = props()
    const { rerender } = render(<CraftingSheet {...input} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand item set 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'individual items' }))
    expect(input.onSetCraftMode).toHaveBeenCalledWith('bed-anchor', 'individual')
    rerender(<CraftingSheet {...input} entries={[{ ...input.entries[0], mode: 'individual' }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'choose craft for bed' }))
    const choices = screen.getByRole('region', { name: 'Calculated crafts for bed' })
    fireEvent.click(within(choices).getByRole('button', { name: /^bed / }))
    expect(input.onSelectItemCraft).toHaveBeenCalledWith('bed-anchor', 'bed', input.entries[0].itemChoices[0].options.find((value) => value.label === 'bed')!.id)
  })

  test('keeps disabled sets in place and reports include and reset actions', () => {
    const input = props()
    const disabled = { ...input.entries[0], disabled: true }
    render(<CraftingSheet {...input} entries={[disabled]} disabledEntries={[disabled]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include item set 1' }))
    expect(input.onSetEntryDisabled).toHaveBeenCalledWith('bed-anchor', false)
    fireEvent.click(screen.getByRole('button', { name: 'reset sheet' }))
    expect(input.onReset).toHaveBeenCalledOnce()
  })

  test('shows pending and unavailable sets with clear status messages', () => {
    const input = props()
    render(<CraftingSheet {...input} entries={[{ ...input.entries[0], status: 'pending', selectedSearch: undefined }]} isCalculating warning="Unable to save choices." />)
    expect(screen.getByText('Calculating crafts…')).toBeVisible()
    expect(screen.getByText('Unable to save choices.')).toHaveAttribute('role', 'status')
  })

  test('renders execution controls outside the query font and can inspect character usage', () => {
    const input = props()
    const first = search('aw', 'anchor')
    const next = search('a be').steps[0]
    const combined: RankedSearch = { ...first, kind: 'overlap', queries: ['aw', 'a be'], steps: [first.steps[0], { ...next, retainedPrefix: 'a', freeBackspaceCount: 1, typedSuffix: ' be' }] }
    const { container } = render(<CraftingSheet {...input} entries={[{ ...input.entries[0], selectedSearch: combined }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand item set 1' }))
    expect(screen.getAllByText('aw', { selector: '.crafting-sheet__query-text' })[0]).toBeVisible()
    expect(screen.getByText('_be', { selector: '.crafting-sheet__query-text' })).toBeVisible()
    expect(screen.getByLabelText('1 backspace')).toHaveClass('crafting-sheet__key')
    expect(container.querySelector('.crafting-sheet__key .crafting-sheet__query-text')).toBeNull()
    fireEvent.click(screen.getByText('character usage'))
    fireEvent.click(screen.getByRole('button', { name: /b.*1 craft/ }))
    expect(screen.getByLabelText('b crafts').querySelector('mark')).toHaveTextContent('b')
  })
})
