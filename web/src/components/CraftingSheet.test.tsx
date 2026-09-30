import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

import type { RankedSearch, RowOptimizationState, TargetWorkspaceEntry } from '../domain/types'
import { createCraftingSheetModel } from '../engine/craftingSheet'
import { CraftingSheet, CraftQueryInput, type CraftingSheetProps } from './CraftingSheet'

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

  test('calculates ten matching choices after one second without changing the selected craft', () => {
    vi.useFakeTimers()
    try {
      const input = props()
      render(<CraftingSheet {...input} />)
      fireEvent.click(screen.getByRole('button', { name: 'Expand item set 1' }))
      const query = screen.getByRole('searchbox', { name: 'Craft query for bed' })
      fireEvent.focus(query)
      expect(within(screen.getByRole('list', { name: 'Calculated craft suggestions for bed' })).getAllByRole('button')).toHaveLength(10)
      fireEvent.change(query, { target: { value: 'q' } })

      act(() => { vi.advanceTimersByTime(999) })
      expect(input.onSetItemQuery).not.toHaveBeenCalled()
      expect(screen.queryByRole('list', { name: 'Calculated craft suggestions for bed' })).toBeNull()
      act(() => { vi.advanceTimersByTime(1) })
      const choices = within(screen.getByRole('list', { name: 'Calculated craft suggestions for bed' }))
      expect(choices.getAllByRole('button')).toHaveLength(10)
      expect(input.onSetItemQuery).not.toHaveBeenCalled()
      fireEvent.click(choices.getByRole('button', { name: /q0/ }))
      expect(input.onSetItemQuery).toHaveBeenCalledWith('bed-anchor', 'bed', 'q0')
    } finally {
      vi.useRealTimers()
    }
  })

  test('keeps first-character keyboard aliases in the filtered suggestion menu', () => {
    vi.useFakeTimers()
    try {
      render(<CraftQueryInput label="ligature" value="" suggestions={[{
        id: 'ligature', label: 'æst', isOptimal: true, search: search('æst'), totalTypedCharacters: 3, totalScore: 1, scoreDelta: 0, junkCount: 0,
      }]} onChoose={vi.fn(() => ({ valid: true, query: 'æst' }))} />)

      const query = screen.getByRole('searchbox', { name: 'Craft query for ligature' })
      fireEvent.focus(query)
      fireEvent.change(query, { target: { value: 'e' } })
      act(() => { vi.advanceTimersByTime(1000) })
      const suggestions = within(screen.getByRole('list', { name: 'Calculated craft suggestions for ligature' }))
      expect(suggestions.getAllByRole('button')).toHaveLength(1)
      expect(suggestions.getByText('æst')).toBeVisible()
    } finally {
      vi.useRealTimers()
    }
  })

  test('keeps only the active query popup open and does not reopen a blurred pending search', () => {
    vi.useFakeTimers()
    try {
      const option = { id: 'bed', label: 'bed', isOptimal: true, search: search('bed'), totalTypedCharacters: 3, totalScore: 1, scoreDelta: 0, junkCount: 0 }
      render(<><CraftQueryInput label="first" value="" suggestions={[option]} onChoose={vi.fn()} /><CraftQueryInput label="second" value="" suggestions={[option]} onChoose={vi.fn()} /></>)
      const first = screen.getByRole('searchbox', { name: 'Craft query for first' })
      const second = screen.getByRole('searchbox', { name: 'Craft query for second' })
      act(() => first.focus())
      fireEvent.change(first, { target: { value: 'be' } })
      act(() => second.focus())
      act(() => vi.advanceTimersByTime(1000))
      expect(screen.queryByRole('list', { name: 'Calculated craft suggestions for first' })).toBeNull()
      expect(screen.getByRole('list', { name: 'Calculated craft suggestions for second' })).toBeVisible()
    } finally { vi.useRealTimers() }
  })

  test('finishes query preview even when a parent rerender supplies a fresh callback', () => {
    vi.useFakeTimers()
    try {
      const option = { id: 'bed', label: 'bed', isOptimal: true, search: search('bed'), totalTypedCharacters: 3, totalScore: 1, scoreDelta: 0, junkCount: 0 }
      const onChoose = vi.fn()
      const { rerender } = render(<CraftQueryInput label="rerender" value="" suggestions={[]} onPreview={() => option} onChoose={onChoose} />)
      const input = screen.getByRole('searchbox')
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'bed' } })
      act(() => vi.advanceTimersByTime(500))
      rerender(<CraftQueryInput label="rerender" value="" suggestions={[]} onPreview={() => option} onChoose={onChoose} />)
      act(() => vi.advanceTimersByTime(500))
      expect(screen.getByRole('list')).toBeVisible()
    } finally { vi.useRealTimers() }
  })

  test('portals suggestions above a low anchor within sheet bounds and closes when its anchor scrolls away', () => {
    const onChoose = vi.fn(() => ({ valid: true, query: 'bed' }))
    const { container } = render(<section className="crafting-sheet"><CraftQueryInput label="bounded" value="" suggestions={[{ id: 'bed', label: 'bed', isOptimal: true, search: search('bed'), totalTypedCharacters: 3, totalScore: 1, scoreDelta: 0, junkCount: 0 }]} onChoose={onChoose} /></section>)
    const query = screen.getByRole('searchbox', { name: 'Craft query for bounded' })
    vi.spyOn(container.querySelector('.crafting-sheet')!, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 20, 400, 600))
    const anchorRect = vi.spyOn(query, 'getBoundingClientRect').mockReturnValue(new DOMRect(40, 550, 200, 30))
    act(() => query.focus())
    const popup = screen.getByRole('list', { name: 'Calculated craft suggestions for bounded' })
    expect(container.contains(popup)).toBe(false)
    expect(popup).toHaveStyle({ position: 'fixed', left: '40px', width: '200px', maxHeight: '192px', top: '546px', transform: 'translateY(-100%)' })
    expect(query).toHaveAttribute('aria-controls', popup.id)
    expect(query).toHaveAttribute('aria-expanded', 'true')
    fireEvent.pointerDown(within(popup).getByRole('button'))
    fireEvent.pointerUp(within(popup).getByRole('button'))
    fireEvent.click(within(popup).getByRole('button'))
    expect(onChoose).toHaveBeenCalledWith('bed')
    fireEvent.focus(query)
    anchorRect.mockReturnValue(new DOMRect(40, 700, 200, 30))
    fireEvent.scroll(document)
    expect(screen.queryByRole('list', { name: 'Calculated craft suggestions for bounded' })).toBeNull()
  })

  test('chooses a craft on touch release but leaves a scrolling gesture unselected', () => {
    const onChoose = vi.fn(() => ({ valid: true, query: 'bed' }))
    render(<CraftQueryInput label="mobile craft" value="" suggestions={[{
      id: 'bed', label: 'bed', isOptimal: true, search: search('bed'), totalTypedCharacters: 3, totalScore: 1, scoreDelta: 0, junkCount: 0,
    }]} onChoose={onChoose} />)

    fireEvent.focus(screen.getByRole('searchbox', { name: 'Craft query for mobile craft' }))
    const suggestion = within(screen.getByRole('list', { name: 'Calculated craft suggestions for mobile craft' })).getByRole('button', { name: /bed/ })
    fireEvent.pointerDown(suggestion, { pointerType: 'touch', pointerId: 1 })
    fireEvent.pointerCancel(suggestion, { pointerType: 'touch', pointerId: 1 })
    expect(onChoose).not.toHaveBeenCalled()

    fireEvent.pointerDown(suggestion, { pointerType: 'touch', pointerId: 2 })
    fireEvent.pointerUp(suggestion, { pointerType: 'touch', pointerId: 2 })
    expect(onChoose).toHaveBeenCalledWith('bed')
  })

  test('offers a valid typed craft that was not among the calculated suggestions', () => {
    vi.useFakeTimers()
    try {
      const typedCraft = {
        id: 'typed-ak', label: 'äk', isOptimal: false, search: search('äk'), totalTypedCharacters: 2, totalScore: 1, scoreDelta: 1, junkCount: 0,
      }
      const onPreview = vi.fn(() => typedCraft)
      const onChoose = vi.fn(() => ({ valid: true, query: 'äk' }))
      render(<CraftQueryInput label="accented craft" value="" suggestions={[]} onPreview={onPreview} onChoose={onChoose} />)

      const query = screen.getByRole('searchbox', { name: 'Craft query for accented craft' })
      fireEvent.focus(query)
      fireEvent.change(query, { target: { value: 'ak' } })
      act(() => { vi.advanceTimersByTime(1000) })

      const choices = within(screen.getByRole('list', { name: 'Calculated craft suggestions for accented craft' }))
      expect(onPreview).toHaveBeenCalledWith('ak')
      expect(choices.getByText('äk')).toBeVisible()
      fireEvent.click(choices.getByRole('button', { name: /äk/ }))
      expect(onChoose).toHaveBeenCalledWith('äk')
    } finally {
      vi.useRealTimers()
    }
  })

  test('has no separate submit control for a craft query', () => {
    const input = props()
    render(<CraftingSheet {...input} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand item set 1' }))
    expect(screen.queryByRole('button', { name: 'Use query for bed' })).toBeNull()
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
