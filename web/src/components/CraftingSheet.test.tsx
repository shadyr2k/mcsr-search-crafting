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
    defaultOpen: true, onSetEntryDisabled: vi.fn(), onReset: vi.fn(),
    onSetItemQuery: vi.fn(() => ({ valid: true, query: 'be' })), onMoveItemCraft: vi.fn(),
  }
}

describe('CraftingSheet', () => {
  test('opens a cheat sheet with totals and all item sets immediately reachable', () => {
    render(<CraftingSheet {...props()} defaultOpen={false} />)
    const toggle = screen.getByRole('button', { name: 'crafting sheet' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(screen.getByLabelText('Total characters')).toHaveTextContent('4')
    expect(screen.getByLabelText('Distinct characters')).toHaveTextContent('4')
    expect(screen.getByRole('region', { name: 'item set 1' })).toBeVisible()
    expect(screen.getByRole('img', { name: 'bed' })).toBeVisible()
    expect(screen.getByRole('img', { name: 'anchor' })).toBeVisible()
    expect(screen.queryByText('bed')).not.toBeInTheDocument()
    expect(screen.queryByText('anchor')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand item set 1' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByLabelText('Selected query for bed')).toHaveTextContent('be')
    expect(screen.queryByRole('searchbox', { name: 'Craft query for bed' })).not.toBeInTheDocument()
  })

  test('groups items with the same selected craft in the compact summary', () => {
    const input = props()
    const shared = search('er')
    const sharedSearch: RankedSearch = {
      ...shared,
      kind: 'overlap',
      coveredTargetIds: ['bed', 'anchor'],
      steps: [{ ...shared.steps[0], coveredTargetIds: ['bed', 'anchor'], newTargetIds: ['bed', 'anchor'] }],
    }
    const { container } = render(<CraftingSheet {...input} entries={[{ ...input.entries[0], selectedSearch: sharedSearch }]} />)

    const summary = container.querySelector<HTMLElement>('.crafting-sheet__summary-items')!
    expect(summary.querySelectorAll('.crafting-sheet__summary-item')).toHaveLength(1)
    expect(within(summary).getByLabelText('Selected query for bed and anchor')).toHaveTextContent('er')
    expect(within(summary).getAllByRole('img')).toHaveLength(2)
  })

  test('uses a character-details column, chart column, and item-set columns on its dedicated page', () => {
    const input = { ...props(), onBack: vi.fn() }

    const { container } = render(<CraftingSheet {...input} layout="page" />)

    expect(screen.getByText('create a custom craft sheet')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Back to english crafts' })).toBeVisible()
    expect(screen.getByLabelText('Character occurrence bar chart')).toBeVisible()
    expect(container.querySelector('.crafting-sheet__panel--page > .crafting-sheet__page-info')).toBeTruthy()
    expect(container.querySelector('.crafting-sheet__chart--page')).toBeTruthy()
    expect(container.querySelector('.crafting-sheet__panel--page > .crafting-sheet__sets')).toBeTruthy()
    expect(container.querySelector('.crafting-sheet__sets--columns .crafting-sheet__set-columns')).toBeTruthy()
    expect(container.querySelector('.crafting-sheet__disclosure .arrow-sprite--left')).toBeTruthy()
    expect(screen.getByText((_, element) => Boolean(element?.classList.contains('crafting-sheet__hint') && element.textContent === '_ = space · ← = backspace · SH = shift home (replace search)'))).toBeVisible()
    expect(screen.queryByText('character usage')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show details for b' }))
    expect(screen.getByLabelText('b crafts')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Back to english crafts' }))
    expect(input.onBack).toHaveBeenCalledOnce()
  })

  test('uses SH for search replacement in the dedicated sheet page', () => {
    const input = props()
    const first = search('aw', 'anchor')
    const replacementStep = search('bed').steps[0]
    const replacement: RankedSearch = {
      ...first,
      kind: 'overlap',
      queries: ['aw', 'bed'],
      steps: [first.steps[0], { ...replacementStep, retainedPrefix: '', freeBackspaceCount: 2, typedSuffix: 'bed' }],
    }

    render(<CraftingSheet {...input} entries={[{ ...input.entries[0], selectedSearch: replacement }]} layout="page" />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand item set 1' }))
    expect(screen.getByText('SH', { selector: '.crafting-sheet__key' })).toHaveAttribute('title', 'Select the previous query, then replace it')
  })

  test('always uses text controls in the crafting sheet', () => {
    const input = props()
    const first = search('aw', 'anchor')
    const replacementStep = search('bed').steps[0]
    const replacement: RankedSearch = {
      ...first,
      kind: 'overlap',
      queries: ['aw', 'bed'],
      steps: [first.steps[0], { ...replacementStep, retainedPrefix: '', freeBackspaceCount: 2, typedSuffix: 'bed' }],
    }

    const { container } = render(<CraftingSheet {...input} entries={[{ ...input.entries[0], selectedSearch: replacement }]} layout="page" />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand item set 1' }))
    expect(screen.getByText('SH', { selector: '.crafting-sheet__key' })).toBeTruthy()
    expect(container.querySelector('.crafting-sheet__sequence .arrow-sprite--shift')).toBeNull()
    expect(container.querySelector('.crafting-sheet__sequence .arrow-sprite--home')).toBeNull()
  })

  test('scales the total score from green at best to red at the furthest available score', () => {
    const input = props()
    const bestOption = input.entries[0].options.reduce((best, option) => option.totalScore < best.totalScore ? option : best)
    const bestEntry = { ...input.entries[0], totalScore: bestOption.totalScore, scoreDelta: 0 }
    const { rerender } = render(<CraftingSheet {...input} entries={[bestEntry]} totalScore={bestOption.totalScore} scoreDelta={0} />)
    expect(screen.getByLabelText('Total score').style.getPropertyValue('--crafting-sheet-score-hue')).toBe('132deg')

    const worstOption = input.entries[0].options.reduce((worst, option) => option.totalScore > worst.totalScore ? option : worst)
    const worstEntry = { ...input.entries[0], totalScore: worstOption.totalScore, scoreDelta: worstOption.scoreDelta }
    rerender(<CraftingSheet {...input} entries={[worstEntry]} totalScore={worstOption.totalScore} scoreDelta={worstOption.scoreDelta} />)
    expect(screen.getByLabelText('Total score').style.getPropertyValue('--crafting-sheet-score-hue')).toBe('0deg')
  })

  test('shows distinct-character savings or cost against the score-optimal setup', () => {
    const input = props()
    const { rerender } = render(<CraftingSheet {...input} />)
    expect(screen.getByLabelText('Distinct characters')).toHaveTextContent('4+2')

    rerender(<CraftingSheet {...input} characterSet={['k']} optimalCharacterCount={2} />)
    expect(screen.getByLabelText('Distinct characters')).toHaveTextContent('1-1')

    rerender(<CraftingSheet {...input} characterSet={['k']} optimalCharacterCount={1} />)
    expect(screen.getByLabelText('Distinct characters')).toHaveTextContent(/^1$/)
  })

  test('keeps inclusion independent of expansion and retains the editor while animating closed', () => {
    const input = props()
    render(<CraftingSheet {...input} />)
    const toggle = screen.getByRole('button', { name: 'Expand item set 1' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include item set 1' }))
    expect(input.onSetEntryDisabled).toHaveBeenCalledWith('bed-anchor', true)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(screen.getByRole('searchbox', { name: 'Craft query for bed' })).toBeVisible()
    expect(screen.getByText('4 chars')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse item set 1' }))
    const details = document.getElementById(toggle.getAttribute('aria-controls')!)!
    expect(details).toHaveAttribute('aria-hidden', 'true')
    expect(details).toHaveAttribute('inert')
    expect(within(details).getAllByRole('searchbox', { hidden: true })).toHaveLength(2)
    expect(screen.queryByRole('searchbox', { name: 'Craft query for bed' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'crafting sheet' }))
    expect(screen.queryByRole('region', { name: 'Selected item sets' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'crafting sheet' }))
    expect(screen.getByRole('button', { name: 'Expand item set 1' })).toBeVisible()
  })

  test('offers ten calculated suggestions and validates a submitted query', () => {
    const input = props()
    render(<CraftingSheet {...input} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand item set 1' }))
    const query = screen.getByRole('searchbox', { name: 'Craft query for bed' })
    fireEvent.focus(query)
    expect(within(screen.getByRole('list', { name: 'Calculated craft suggestions for bed' })).getAllByRole('button')).toHaveLength(10)
    fireEvent.change(query, { target: { value: 'runner craft' } })
    expect(query).toHaveValue('runner_craft')
    fireEvent.submit(query.closest('form')!)
    expect(input.onSetItemQuery).toHaveBeenCalledWith('bed-anchor', 'bed', 'runner_craft')
  })

  test('uses a compact site arrow sprite to submit a query in both layouts', () => {
    const input = props()
    const { unmount } = render(<CraftingSheet {...input} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand item set 1' }))
    expect(within(screen.getByRole('button', { name: 'Use query for bed' })).getByRole('img', { name: 'Fast forward' })).toBeVisible()
    unmount()

    const { container: compactContainer } = render(<CraftingSheet {...input} compactLayout />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand item set 1' }))
    expect(within(screen.getByRole('button', { name: 'Use query for bed' })).getByRole('img', { name: 'Fast forward' })).toBeVisible()
    expect(compactContainer.querySelector('.crafting-sheet__query-submit .arrow-sprite')).not.toBeNull()
  })

  test('offers one editor for query choices and reordering without mode tabs', () => {
    const input = props()
    render(<CraftingSheet {...input} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand item set 1' }))
    expect(screen.queryByRole('button', { name: 'individual items' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'combined craft' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move bed up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move anchor down' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Move anchor up' }))
    expect(input.onMoveItemCraft).toHaveBeenCalledWith('bed-anchor', 'anchor', -1)
    const query = screen.getByRole('searchbox', { name: 'Craft query for bed' })
    fireEvent.focus(query)
    fireEvent.click(within(screen.getByRole('list', { name: 'Calculated craft suggestions for bed' })).getByRole('button', { name: /bed/ }))
    expect(input.onSetItemQuery).toHaveBeenCalledWith('bed-anchor', 'bed', 'bed')
  })

  test('collapses disabled sets to a compact row until they are re-enabled', () => {
    const input = props()
    const { rerender } = render(<CraftingSheet {...input} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand item set 1' }))
    const disabled = { ...input.entries[0], disabled: true }
    rerender(<CraftingSheet {...input} entries={[disabled]} disabledEntries={[disabled]} />)

    const row = screen.getByRole('region', { name: 'item set 1' })
    expect(row).toHaveClass('crafting-sheet__entry--disabled')
    expect(screen.queryByRole('button', { name: /item set 1/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('searchbox', { name: 'Craft query for bed' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include item set 1' }))
    expect(input.onSetEntryDisabled).toHaveBeenCalledWith('bed-anchor', false)

    rerender(<CraftingSheet {...input} />)
    expect(screen.getByRole('button', { name: 'Collapse item set 1' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'reset sheet' }))
    expect(input.onReset).toHaveBeenCalledOnce()
  })

  test('shows pending and unavailable sets with clear status messages', () => {
    const input = props()
    render(<CraftingSheet {...input} entries={[{ ...input.entries[0], status: 'pending', selectedSearch: undefined }]} isCalculating warning="Unable to save choices." />)
    expect(within(screen.getByRole('button', { name: 'Expand item set 1' })).getByText('Calculating crafts…')).toHaveClass('crafting-sheet__entry-status')
    expect(screen.getByText('Unable to save choices.')).toHaveAttribute('role', 'status')
  })

  test('renders execution controls outside the query font and can inspect selected-character usage', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Show details for b' }))
    expect(screen.getByLabelText('b crafts').querySelector('mark')).toHaveTextContent('b')
  })
})
