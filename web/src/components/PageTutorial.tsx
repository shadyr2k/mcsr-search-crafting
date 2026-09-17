import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import './PageTutorial.css'

export interface TutorialStep { target: string; title: string; text: string; editor?: boolean; sheet?: boolean }

export const pageTutorials: Record<string, TutorialStep[]> = {
  home: [
    { target: '.item-set-workspace', title: 'Item sets', text: 'Each item set groups the items you want to craft with an inventory and crafting space. Click its items to edit it, or add a new set. Enable only the sets you want to compare.' },
    { target: '.item-set-editor', editor: true, title: 'Edit an item set', text: 'Choose your goals and the ingredients available in your inventory. Changes are used when you save the item set. This tour leaves your selections as they were.' },
    { target: '.item-set-editor .grid-size-switch', editor: true, title: 'Craft space', text: 'Choose the 2×2 inventory grid or a 3×3 crafting table. The smaller grid is available only when every selected goal can be crafted in it.' },
    { target: '.craft-order-switch', editor: true, title: 'Retain item order', text: 'Enable this to keep the goals in the order you selected them when calculating overlap crafts. Otherwise the optimizer can choose a more efficient order.' },
    { target: '.custom-slots', editor: true, title: 'Custom inventories', text: 'Choose an inventory preset or select ingredients yourself. Name and save a custom inventory to reuse it in other item sets and the simulator. Clear removes that saved slot.' },
    { target: '.language-selector', title: 'Choose a language', text: 'Language scores compare the enabled item sets. Lower scores mean more efficient searches. Choose a language to update the crafts; its special letters may become part of your character set.' },
    { target: '.calculated-search-row', title: 'Your top crafts', text: 'Each row previews up to three crafts. Regular crafts use one search; overlaps reuse part of a search between items. A star marks a junkless craft. Expand the row to compare regular and overlap choices, including crafts with junk.' },
    { target: '.crafting-sheet', sheet: true, title: 'Your crafting sheet', text: 'This is your personal cheat sheet. Expand an item set to choose its queries and reorder its items. The sheet adapts the sequence and updates total characters, the character set and efficiency. Click outside the sheet to return to the crafts.' },
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
  const [cardHeight, setCardHeight] = useState(220)
  const cardRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      findTarget()?.scrollIntoView({ block: 'center', behavior: 'instant' })
      measure()
    })
    function measure() {
      const target = findTarget()
      if (!target) return
      const rect = target.getBoundingClientRect()
      const left = Math.max(4, rect.left - 4)
      const top = Math.max(4, rect.top - 4)
      setBox({ left, top, width: Math.max(0, Math.min(innerWidth - 4, rect.right + 4) - left), height: Math.max(0, Math.min(innerHeight - 4, rect.bottom + 4) - top) })
      if (cardRef.current) setCardHeight(cardRef.current.getBoundingClientRect().height)
    }
    function findTarget() { return step.target.split(',').map((selector) => document.querySelector(selector.trim())).find(Boolean) }
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    observer?.observe(document.body)
    if (cardRef.current) observer?.observe(cardRef.current)
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('scroll', measure, true); window.removeEventListener('resize', measure) }
  }, [step])
  useEffect(() => { cardRef.current?.focus() }, [index])
  const cardAtTop = box.top > window.innerHeight / 2
  const arrowX = Math.max(20, Math.min(window.innerWidth - 20, box.left + box.width / 2))
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
    <div className="page-tutorial__spotlight" style={box} />
    <svg className="page-tutorial__arrow" aria-hidden="true" width="100%" height="100%">
      <defs><marker id="tutorial-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" /></marker></defs>
      <path d={`M ${window.innerWidth / 2} ${cardAtTop ? cardHeight + 16 : window.innerHeight - cardHeight - 16} L ${arrowX} ${cardAtTop ? box.top : box.top + Math.min(28, box.height / 4)}`} markerEnd="url(#tutorial-arrowhead)" />
    </svg>
    <div ref={cardRef} tabIndex={-1} className={`page-tutorial__card${cardAtTop ? ' page-tutorial__card--top' : ''}`} role="dialog" aria-modal="true" aria-labelledby="tutorial-title" aria-describedby="tutorial-description">
      <span className="page-tutorial__progress">{index + 1} of {steps.length}</span>
      <h2 id="tutorial-title">{step.title}</h2><p id="tutorial-description">{step.text}</p>
      <div className="page-tutorial__actions"><button type="button" onClick={onClose}>close tutorial</button><button type="button" disabled={index === 0} onClick={() => onChange(index - 1)}>back</button><button type="button" onClick={() => index === steps.length - 1 ? onClose() : onChange(index + 1)}>{index === steps.length - 1 ? 'finish' : 'next'}</button></div>
    </div>
  </div>
}
