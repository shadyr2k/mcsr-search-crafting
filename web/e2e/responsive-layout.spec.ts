import { expect, test, type Page } from '@playwright/test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

test.describe.configure({ mode: 'parallel' })

// CSS uses rem media queries (the browser's initial font size is 16px).
export const widthBreakpoints = [512, 544, 560, 576, 608, 672, 704, 752, 832, 880, 896, 1120, 1152, 1200, 1536]
const widths = [...new Set([
  ...Array.from({ length: 281 }, (_, i) => 320 + i * 8),
  ...widthBreakpoints.flatMap((width) => [width - 1, width, width + 1]),
])].sort((a, b) => a - b)
const representativeViewports = [
  { width: 320, height: 568 }, { width: 390, height: 844 },
  { width: 844, height: 390 }, { width: 768, height: 1024 },
  { width: 1024, height: 768 }, { width: 1280, height: 720 },
  { width: 1366, height: 768 }, { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  ...[1151, 1152, 1153, 1920].flatMap((width) =>
    [863, 864, 865].map((height) => ({ width, height }))),
]

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    // Allow React's matchMedia and ResizeObserver measurements to commit.
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame)
  })
}

async function geometryFailures(page: Page) {
  return page.evaluate(() => {
    const failures: string[] = []
    const tolerance = 1.5 // Borders and fractional device-independent pixels.
    const visible = (el: Element) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      && !el.closest('[inert], [aria-hidden="true"]')
    const label = (el: Element) => el.tagName.toLowerCase() + '.' + [...el.classList].join('.')
    const root = document.documentElement
    if (root.scrollWidth > window.innerWidth + tolerance) failures.push(`page overflow: ${root.scrollWidth} > ${window.innerWidth}`)
    const brandCopy = document.querySelector<HTMLElement>('.app-header__title')
    const brandIcon = document.querySelector<HTMLElement>('.app-header__icon')
    const heading = brandCopy?.querySelector('h1')
    const subtitle = brandCopy?.querySelector('.app-header__subtitle')
    if (brandCopy && brandIcon && heading && subtitle) {
      const copy = brandCopy.getBoundingClientRect()
      const icon = brandIcon.getBoundingClientRect()
      const title = heading.getBoundingClientRect()
      const tagline = subtitle.getBoundingClientRect()
      const gap = tagline.top - title.bottom
      if (gap < 2 || gap > 4) failures.push(`branding title/tagline gap must be 2–4px: ${gap}`)
      if (Math.abs((copy.top + copy.bottom - icon.top - icon.bottom) / 2) > tolerance) failures.push('logo and combined brand copy must be vertically centered')
      if (icon.right > copy.left) failures.push('logo must remain beside brand copy')
      if (Math.abs(copy.height - title.height - tagline.height - gap) > tolerance) failures.push('brand copy must not stretch beyond its text stack')
      // Branding must never wrap to preserve a single-row navigation layout.
      const range = document.createRange()
      range.selectNodeContents(heading)
      const lineCount = new Set([...range.getClientRects()].map((rect) => rect.top)).size
      if (lineCount !== 1) failures.push(`branding heading wraps into ${lineCount} lines`)
      range.selectNodeContents(subtitle)
      if (new Set([...range.getClientRects()].map((rect) => rect.top)).size !== 1) failures.push('branding tagline wraps')
      if (title.height > lineCount * parseFloat(getComputedStyle(heading).fontSize) * 1.1 + tolerance) failures.push('branding heading has excessive line spacing')
      const nav = document.querySelector('.app-header__nav')!.getBoundingClientRect()
      const menu = document.querySelector('.app-header__menu')!.getBoundingClientRect()
      if (innerWidth > 1536) {
        if (Math.abs((nav.top + nav.bottom - icon.top - icon.bottom) / 2) > tolerance) failures.push('desktop navigation must stay beside branding')
      } else if (nav.top < Math.max(copy.bottom, icon.bottom) - tolerance) failures.push('navigation must occupy its own row below the branding')
      if (innerWidth > 896) {
        if (Math.abs((menu.top + menu.bottom - icon.top - icon.bottom) / 2) > tolerance) failures.push('header controls must stay beside branding')
      } else if (menu.top < nav.bottom - tolerance) failures.push('mobile controls must occupy their own row')
    }
    const panelSelector = '.app-header, .workspace-grid > section, .workspace-grid > aside, .item-set-editor, .calculated-search-row, .craft-result, .language-info-panel__section, .recipe-book-sim__controls, .recipe-book-sim__book-area, .recipe-book-sim__detail, .craft-lookup__editor, .craft-lookup__content, .crafting-sheet, .language-comparison, .settings-page, .settings-page__numbers label'
    const panels = [...document.querySelectorAll<HTMLElement>(panelSelector)].filter(visible)
    for (const panel of panels) {
      const bounds = panel.getBoundingClientRect()
      if (bounds.left < -tolerance || bounds.right > root.clientWidth + tolerance) failures.push(`${label(panel)} outside page`)
      for (const el of panel.querySelectorAll<HTMLElement>('*')) {
        if (!visible(el) || getComputedStyle(el).display === 'contents') continue
        const rect = el.getBoundingClientRect()
        if (!rect.width || !rect.height) continue
        // Portals/anchored menus intentionally overlay panels; they get separate tests.
        if (el.closest('.item-picker__results, .language-dropdown__menu, .theme-picker__menu, .version-picker__menu, .language-selector__sort-options, [role="tooltip"]')) continue
        let scrolls = false
        let ellipsis = false
        for (let parent = el.parentElement; parent && parent !== panel; parent = parent.parentElement) {
          const style = getComputedStyle(parent)
          if (['auto', 'scroll'].includes(style.overflowX) && parent.scrollWidth > parent.clientWidth + tolerance) scrolls = true
          if (style.textOverflow === 'ellipsis' && style.overflowX === 'hidden') ellipsis = true
        }
        // Nested locale-name spans paint inside their deliberately ellipsized label.
        if (ellipsis && !el.matches('button, input, select, img')) continue
        if (!scrolls && (rect.left < bounds.left - tolerance || rect.right > bounds.right + tolerance)) failures.push(`${label(el)} escapes ${label(panel)}`)
        if (el.matches('button, input, select, img') && !scrolls) {
          // Check every clipping ancestor, so overflow:hidden cannot mask a regression.
          let verticalScrollport: DOMRect | undefined
          for (let parent = el.parentElement; parent && parent !== panel.parentElement; parent = parent.parentElement) {
            const style = getComputedStyle(parent)
            const p = parent.getBoundingClientRect()
            // Open sheet editors intentionally scroll vertically. Check that
            // their scrollport fits the outer panel, not every offscreen row.
            if (['auto', 'scroll'].includes(style.overflowY) && parent.scrollHeight > parent.clientHeight + tolerance) verticalScrollport = p
            if (['hidden', 'clip'].includes(style.overflowX) && (rect.left < p.left - tolerance || rect.right > p.right + tolerance)) failures.push(`${label(el)} clipped by ${label(parent)}`)
            const verticalBounds = verticalScrollport ?? rect
            if (['hidden', 'clip'].includes(style.overflowY) && (verticalBounds.top < p.top - tolerance || verticalBounds.bottom > p.bottom + tolerance)) failures.push(`${label(el)} vertically clipped by ${label(parent)}`)
          }
        }
      }
    }
    const layouts = ['.workspace-grid', '.recipe-book-sim__layout', '.recipe-book-sim__book-area', '.craft-lookup__layout', '.language-comparison__panel', '.language-comparison__language-selectors', '.language-comparison__results', '.language-comparison__comparison-grid', '.app-header', '.app-header__brand', '.app-header__nav', '.craft-category__header', '.craft-results-toolbar', '.results-column', '.results-header__top', '.results-header__actions']
    for (const selector of layouts) {
      for (const layout of document.querySelectorAll(selector)) {
        const children = [...layout.children].filter((el) => visible(el) && !el.matches('.item-set-editor-overlay'))
        for (let i = 0; i < children.length; i++) for (let j = i + 1; j < children.length; j++) {
          const a = children[i].getBoundingClientRect()
          const b = children[j].getBoundingClientRect()
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > tolerance && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > tolerance) failures.push(`${label(children[i])} overlaps ${label(children[j])}`)
        }
      }
    }
    for (const toolbar of [...document.querySelectorAll('.craft-results-toolbar')].filter(visible)) {
      const columns = toolbar.nextElementSibling!.getBoundingClientRect()
      const bounds = toolbar.getBoundingClientRect()
      const control = toolbar.querySelector('.segmented-control')!.getBoundingClientRect()
      if (bounds.bottom > columns.top + tolerance) failures.push('number crafts toolbar must sit above both craft columns')
      if (Math.abs(control.right - bounds.right) > tolerance) failures.push('number crafts control must align to the toolbar right edge')
    }
    for (const header of [...document.querySelectorAll('.craft-category__header')].filter(visible)) {
      const bounds = header.getBoundingClientRect()
      const control = header.querySelector('.segmented-control')!.getBoundingClientRect()
      if (Math.abs(control.right - bounds.right) > tolerance) failures.push('craft category control must align to its section right edge')
    }
    for (const group of [...document.querySelectorAll('.segmented-control')].filter(visible)) {
      const buttons = [...group.querySelectorAll('button')]
      for (let i = 1; i < buttons.length; i++) {
        const first = buttons[i - 1].getBoundingClientRect()
        const second = buttons[i].getBoundingClientRect()
        if (Math.abs(first.right - second.left) > tolerance || Math.abs(first.height - second.height) > tolerance) failures.push('segmented choices must be adjacent and equal height')
      }
    }
    const expectColumns = (selector: string, count: number) => {
      const el = document.querySelector(selector)
      if (el && getComputedStyle(el).gridTemplateColumns.split(' ').length !== count) failures.push(`${selector} must have ${count} columns`)
    }
    const comparisonBar = document.querySelector('.language-comparison__setup-bar')
    if (comparisonBar) {
      const title = comparisonBar.querySelector('h2')!.getBoundingClientRect()
      const back = comparisonBar.querySelector('button')!.getBoundingClientRect()
      if (title.right > back.left + tolerance || Math.abs((title.top + title.bottom - back.top - back.bottom) / 2) > tolerance) failures.push('comparison title and Back to crafts must share one row without overlap')
    }
    for (const toggle of [...document.querySelectorAll('.language-comparison__item-set-toggle')].filter(visible)) {
      const heading = toggle.querySelector('.language-comparison__item-set-heading')!.getBoundingClientRect()
      const arrow = toggle.querySelector(':scope > span:last-child .arrow-sprite')!.getBoundingClientRect()
      if (arrow.left < heading.right - tolerance || arrow.top >= heading.bottom || arrow.bottom <= heading.top) failures.push('comparison disclosure must stay beside its item-set heading')
    }
    expectColumns('.workspace-transition--home', innerWidth <= 1152 ? 1 : 3)
    expectColumns('.workspace-transition--language-info', innerWidth <= 1152 ? 1 : 3)
    expectColumns('.language-info-panel__group--overview', innerWidth <= 544 ? 1 : innerWidth <= 896 ? 2 : 4)
    expectColumns('.language-info-panel__group--reference', innerWidth <= 544 ? 1 : 2)
    expectColumns('.recipe-book-sim__layout', innerWidth <= 896 ? 1 : 2)
    expectColumns('.recipe-book-sim__book-area', innerWidth <= 1200 ? 1 : 2)
    expectColumns('.craft-lookup__layout', innerWidth <= 1152 ? 1 : 2)
    expectColumns('.crafting-sheet__panel--page', innerWidth <= 1152 || innerHeight <= 864 ? 1 : 3)
    expectColumns('.language-comparison__panel', innerWidth <= 1120 ? 1 : 2)
    expectColumns('.language-comparison__comparison-grid', 1)
    expectColumns('.language-comparison__overall-score-scale', 1)
    expectColumns('.language-comparison__overall-scores', 1)
    expectColumns('.language-comparison__language-selectors', innerWidth <= 544 ? 1 : 2)
    expectColumns('.settings-page__numbers', innerWidth <= 672 ? 1 : 2)
    expectColumns('.keyboard-editor__controls', innerWidth <= 560 ? 1 : 2)
    return [...new Set(failures)]
  })
}

test('the sweep inventories every CSS viewport and container breakpoint', () => {
  const css = readdirSync('src', { recursive: true }).filter((file) => String(file).endsWith('.css'))
    .map((file) => readFileSync(join('src', String(file)), 'utf8')).join('\n')
  const boundaries = (kind: string, dimension: string) => [...new Set(
    [...css.matchAll(new RegExp(`@${kind}[^\\{]+`, 'g'))].flatMap(([query]) =>
      [...query.matchAll(new RegExp(`(?:max-|min-)?${dimension}\\s*(?::|[<>]=?)\\s*([\\d.]+)(rem|px)`, 'g'))]
        .map(([, value, unit]) => Number(value) * (unit === 'rem' ? 16 : 1))),
  )].sort((a, b) => a - b)
  expect(boundaries('media', 'width')).toEqual(widthBreakpoints)
  expect(boundaries('media', 'height')).toEqual([864])
  expect(boundaries('container', 'width')).toEqual([400, 480])
})

const pages = ['search crafting', 'language info', 'craft lookup', 'recipe book sim', 'settings', 'crafting sheet', 'compare languages', 'item editor']
for (const compact of [false, true]) for (const name of pages) {
  test(`responsive sweep: ${name}${compact ? ' (compact)' : ''}`, async ({ page }) => {
    test.setTimeout(180_000)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Add item set' })).toBeVisible()
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' })
    if (compact) {
      await page.getByRole('button', { name: 'settings', exact: true }).click()
      await page.getByRole('switch', { name: 'compact layout', exact: true }).click()
      await page.getByRole('button', { name: 'save settings', exact: true }).click()
      await page.getByRole('button', { name: 'search crafting', exact: true }).click()
    }
    await page.getByRole('button', { name: name === 'item editor' ? 'Add item set' : name, exact: true }).click()
    if (name === 'search crafting') {
      await page.getByRole('button', { name: 'Show all crafts for item set 1' }).click()
      await page.getByRole('button', { name: 'Show all crafts for item set 2' }).click()
      await page.getByRole('button', { name: 'Show all crafts for item set 6' }).click()
    }
    if (name === 'compare languages') {
      await page.getByRole('button', { name: 'compare', exact: true }).click()
      await expect(page.locator('.language-comparison__item-set-row').first()).toBeVisible()
      await page.getByRole('button', { name: 'Expand item set 1 comparison', exact: true }).click()
      if (!compact) await page.getByRole('button', { name: 'Expand item set 4 comparison', exact: true }).click()
    }
    if (name === 'crafting sheet') await page.getByRole('button', { name: 'Expand item set 1', exact: true }).click()
    const failures: string[] = []
    for (const viewport of [...widths.map((width) => ({ width, height: 1000 })), ...representativeViewports]) {
      await page.setViewportSize(viewport)
      await settle(page)
      const problems = await geometryFailures(page)
      if (problems.length) failures.push(`${viewport.width}x${viewport.height}: ${problems.slice(0, 8).join('; ')}`)
    }
    await test.info().attach('geometry-failures', { body: JSON.stringify(failures, null, 2), contentType: 'application/json' })
    expect(failures.length, `${failures.length} failing viewports\n${failures.slice(0, 16).join('\n')}`).toBe(0)
  })
}
