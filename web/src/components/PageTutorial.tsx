import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

import './PageTutorial.css'

export interface TutorialStep { target: string; title: string; text: string; editor?: boolean }

export const pageTutorials: Record<string, TutorialStep[]> = {
  home: [
    { target: '.item-set-workspace', title: 'Item sets', text: 'Each item set groups the items you want to craft with an inventory and crafting space. Click its items to edit it, or add a new set. Enable only the sets you want to compare.' },
    { target: '.item-set-editor__goals', editor: true, title: 'Edit an item set', text: 'Choose the items you want to craft here. Click a selected item to remove it, or search to add another. Save applies your changes; this tour leaves your selections as they were.' },
    { target: '.item-set-editor .grid-size-switch', editor: true, title: 'Craft space', text: 'Choose the 2×2 inventory grid or a 3×3 crafting table. The smaller grid is available only when every selected goal can be crafted in it.' },
    { target: '.item-set-editor .craft-order-switch', editor: true, title: 'Retain item order', text: 'Enable this to keep the goals in the order you selected them when calculating overlap crafts. Otherwise the optimizer can choose a more efficient order.' },
    { target: '.item-set-editor__inventory', editor: true, title: 'Your inventory', text: 'Select the ingredients you have available. The preset buttons above this selection let you start with a saved inventory. Only items craftable from this inventory and craft space appear in your results.' },
    { target: '.item-set-editor .custom-slots', editor: true, title: 'Custom inventories', text: 'Name and save your current inventory to reuse it in other item sets and the simulator. Clear removes that saved slot. Your goals are saved separately with the item set.' },
    { target: '.workspace-transition--home .language-selector__category .language-selector__language, .workspace-transition--home .language-selector', title: 'Choose a language', text: 'Language scores compare the enabled item sets. Lower scores mean more efficient searches. Choose a language to update the crafts; on smaller screens, use the language search to see your choices and their scores.' },
    { target: '.results-column .calculated-search-row:has(.craft-preview--single):has(.craft-preview--overlap) .calculated-search-row__summary, .results-column .calculated-search-row__summary', title: 'Your top crafts', text: 'Each row previews up to three crafts. Regular crafts use one search; overlaps reuse part of a search between items. A star marks a junkless craft. Expand the row to compare regular and overlap choices, including crafts with junk.' },
    { target: '.crafting-sheet__toggle', title: 'Your crafting sheet', text: 'Open your personal cheat sheet to choose each item set’s queries and reorder its items. The sheet adapts the sequence and updates its totals, character set and efficiency.' },
  ],
  'craft-lookup': [
    { target: '.craft-lookup__editor', title: 'Look up one item set', text: 'Choose the items for a single craft, the available ingredients and craft space, then select Look up crafts. This setup is independent of your Search Crafting item sets.' },
    { target: '.craft-lookup__content', title: 'Languages for this craft', text: 'After a lookup, languages are grouped by their craft category so you can find a language suited to this one item set. Compare the query previews and expand a language to see its crafts.' },
  ],
  'recipe-book-sim': [
    { target: '.recipe-book-sim__language', title: 'Pick a language', text: 'Choose the language whose recipe-book searches you want to try. The simulator uses the inventory and craft space you select below.' },
    { target: '.recipe-book-sim__characters, .recipe-book-sim__language', title: 'Special characters', text: 'For languages with special Latin letters, character buttons appear below the language selector. Click a letter to copy it, then paste it into the recipe-book search.' },
    { target: '.recipe-book-sim__book', title: 'Try a search', text: 'Type a query into the crafting container’s search field to see all the craftable items it matches. Page through the results and click an item to inspect its recipe and matching tooltip.' },
  ],
}

export function PageTutorial({ steps, index, onChange, onClose }: { steps: TutorialStep[]; index: number; onChange: (index: number) => void; onClose: () => void }) {
  const step = steps[index]
  const [box, setBox] = useState({ left: 8, top: 8, width: 0, height: 0 })
  const [clip, setClip] = useState({ left: 0, top: 0, width: 0, height: 0 })
  const [radius, setRadius] = useState(10)
  const maskId = useId()
  const clipId = useId()
  const cardRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    let active = true
    const frame = requestAnimationFrame(async () => {
      const target = findTarget()
      if (target) {
        const animations: Animation[] = []
        for (let ancestor: Element | null = target; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
          animations.push(...(ancestor.getAnimations?.() ?? []).filter((animation) => animation.playState === 'running' && animation.effect?.getTiming().iterations !== Infinity))
        }
        // Position an expanding sheet after its disclosure reaches its real size.
        await Promise.allSettled(animations.map((animation) => animation.finished))
        if (!active) return
        observer?.observe(target)
        target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' })
        const availableHeight = Math.max(0, innerHeight - (cardRef.current?.offsetHeight ?? 220) - 48)
        const rect = target.getBoundingClientRect()
        const desiredTop = 16 + Math.max(0, (availableHeight - rect.height) / 2)
        window.scrollBy({ top: rect.top - desiredTop, behavior: 'instant' })
      }
      measure()
    })
    function measure() {
      const target = findTarget()
      if (!target) { setBox({ left: 0, top: 0, width: 0, height: 0 }); return }
      const rect = target.getBoundingClientRect()
      let left = 0
      let top = 0
      let right = innerWidth
      let bottom = innerHeight
      // A control inside a scrolling editor is visible only within that editor.
      for (let ancestor = target.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor)
        const bounds = ancestor.getBoundingClientRect()
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right) }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom) }
      }
      // Preserve the whole outline. Clipping its drawing, rather than shrinking
      // the rectangle, avoids inventing an edge halfway through a container.
      setBox({ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 })
      setClip({ left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) })
      setRadius(Math.max(6, (Number.parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0) + 4))
    }
    function findTarget() {
      return step.target.split(',').map((selector) => document.querySelector(selector.trim())).find((target) => {
        if (!target || getComputedStyle(target).visibility === 'hidden') return false
        const rect = target.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
    }
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    observer?.observe(document.body)
    if (cardRef.current) observer?.observe(cardRef.current)
    return () => { active = false; cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('scroll', measure, true); window.removeEventListener('resize', measure) }
  }, [step])
  useEffect(() => { cardRef.current?.focus({ preventScroll: true }) }, [index])
  return <div className="page-tutorial" onKeyDown={(event) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose() }
    if (event.key === 'Tab') {
      const buttons = [...cardRef.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === cardRef.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === cardRef.current)) { event.preventDefault(); first.focus() }
    }
  }}>
    <svg className="page-tutorial__shade" width="100%" height="100%" aria-hidden="true">
      <defs>
        <clipPath id={clipId}><rect x={clip.left} y={clip.top} width={clip.width} height={clip.height} /></clipPath>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
          <rect width="100%" height="100%" fill="white" />
          <rect x={box.left} y={box.top} width={box.width} height={box.height} rx={radius} fill="black" clipPath={`url(#${clipId})`} />
        </mask>
      </defs>
      <rect className="page-tutorial__backdrop" width="100%" height="100%" mask={`url(#${maskId})`} />
      <rect className="page-tutorial__spotlight" x={box.left} y={box.top} width={box.width} height={box.height} rx={radius} clipPath={`url(#${clipId})`} />
    </svg>
    <div ref={cardRef} tabIndex={-1} className="page-tutorial__card" role="dialog" aria-modal="true" aria-labelledby="tutorial-title" aria-describedby="tutorial-description">
      <span className="page-tutorial__progress">{index + 1} of {steps.length}</span>
      <h2 id="tutorial-title">{step.title}</h2><p id="tutorial-description">{step.text}</p>
      <div className="page-tutorial__actions"><button type="button" onClick={onClose}>close tutorial</button><button type="button" disabled={index === 0} onClick={() => onChange(index - 1)}>back</button><button type="button" onClick={() => index === steps.length - 1 ? onClose() : onChange(index + 1)}>{index === steps.length - 1 ? 'finish' : 'next'}</button></div>
    </div>
  </div>
}
