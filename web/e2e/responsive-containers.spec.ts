import { expect, test, type Locator, type Page } from '@playwright/test'

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    // Preview selection and keyboard sizing both react to ResizeObserver.
    for (let frame = 0; frame < 4; frame++) await new Promise(requestAnimationFrame)
  })
}

async function prepare(page: Page, compact: boolean) {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Add item set' })).toBeVisible()
  if (compact) {
    await page.getByRole('button', { name: 'settings', exact: true }).click()
    await page.getByRole('switch', { name: 'compact layout' }).click()
    await page.getByRole('button', { name: 'save settings' }).click()
    await page.getByRole('button', { name: 'search crafting', exact: true }).click()
  }
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' })
}

async function setContentWidth(owners: Locator, width: number) {
  await owners.evaluateAll((elements, contentWidth) => {
    for (const element of elements) {
      const owner = element as HTMLElement
      owner.style.boxSizing = 'content-box'
      owner.style.width = `${contentWidth}px`
      owner.style.minWidth = '0'
      owner.style.maxWidth = 'none'
    }
  }, width)
  // Container queries use the content box, not the outer border box.
  const measured = await owners.evaluateAll((elements) => elements.map((element) => parseFloat(getComputedStyle(element).width)))
  expect(measured.length).toBeGreaterThan(0)
  for (const actual of measured) expect(actual).toBeCloseTo(width, 2)
}

async function containmentFailures(owners: Locator, selectors: string) {
  return owners.evaluateAll((elements, selector) => {
    const failures: string[] = []
    const tolerance = 1.5
    const label = (element: Element) => element.tagName.toLowerCase() + '.' + [...element.classList].join('.')
    for (const owner of elements) {
      const outer = owner.getBoundingClientRect()
      for (const element of owner.querySelectorAll<HTMLElement>(selector)) {
        if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || element.closest('[aria-hidden="true"], [inert]')) continue
        const rect = element.getBoundingClientRect()
        if (!rect.width || !rect.height) continue
        if (rect.left < outer.left - tolerance || rect.right > outer.right + tolerance || rect.top < outer.top - tolerance || rect.bottom > outer.bottom + tolerance) {
          failures.push(`${label(element)} escapes ${label(owner)}`)
        }
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent)
          const bounds = parent.getBoundingClientRect()
          if (['hidden', 'clip'].includes(style.overflowX) && (rect.left < bounds.left - tolerance || rect.right > bounds.right + tolerance)) failures.push(`${label(element)} horizontally clipped by ${label(parent)}`)
          if (['hidden', 'clip'].includes(style.overflowY) && (rect.top < bounds.top - tolerance || rect.bottom > bounds.bottom + tolerance)) failures.push(`${label(element)} vertically clipped by ${label(parent)}`)
          // The owner may itself be inside a deliberate desktop scroll region.
          if (parent === owner) break
        }
      }
    }
    return [...new Set(failures)]
  }, selectors)
}

for (const compact of [false, true]) {
  const mode = compact ? 'compact' : 'normal'
  test(`container boundaries preserve queries, targets and controls (${mode})`, async ({ page }) => {
    await prepare(page, compact)
    for (const entry of [1, 6]) await page.getByRole('button', { name: `Show all crafts for item set ${entry}`, exact: true }).click()
    const rows = page.locator('.calculated-search-row').filter({ has: page.locator('.calculated-search-row__toggle[aria-expanded="true"]') })
    await expect(rows).toHaveCount(2)
    await expect(rows.locator('.craft-result').first()).toBeVisible()
    const failures: string[] = []
    for (const width of [479, 480, 481]) {
      await setContentWidth(rows, width)
      await settle(page)
      const problems = await containmentFailures(rows.locator('.calculated-search-row__summary'), 'button, .calculated-search-row__targets, .calculated-search-row__targets .item-icon, .craft-query, .craft-query__term, .craft-query__compact-term')
      failures.push(...problems.map((problem) => `summary content ${width}px: ${problem}`))
    }
    const cards = rows.locator('.craft-result')
    for (const width of [399, 400, 401]) {
      await setContentWidth(cards, width)
      await settle(page)
      const problems = await containmentFailures(cards, 'button, input, select, .craft-result__targets, .craft-result__targets .item-icon, .craft-query, .craft-query__term, .craft-query__compact-term')
      failures.push(...problems.map((problem) => `craft content ${width}px: ${problem}`))
    }
    await test.info().attach('container-geometry', { body: JSON.stringify(failures, null, 2), contentType: 'application/json' })
    expect(failures, failures.join('\n')).toEqual([])
  })

  test(`expanded six-query crafting entry stays contained and editable (${mode})`, async ({ page }) => {
    await prepare(page, compact)
    // Exercise the expanded editor, including its keyboard and six independent
    // query fields; the existing long-summary test covers collapsed columns.
    await page.evaluate(() => {
      const workspace = JSON.parse(localStorage.getItem('mcsr.target-workspace.v1')!)
      const source = workspace.entries.find((entry: { targetIds: string[] }) => entry.targetIds.includes('minecraft:iron_sword'))
      const targetIds = ['minecraft:iron_ingot', 'minecraft:iron_sword', 'minecraft:iron_axe', 'minecraft:iron_pickaxe', 'minecraft:iron_shovel', 'minecraft:iron_helmet']
      workspace.entries = [{ ...source, targetIds, id: 'responsive-expanded', enabled: true, order: 0 }]
      localStorage.setItem('mcsr.target-workspace.v1', JSON.stringify(workspace))
      localStorage.setItem('mcsr.crafting-sheet.v1', JSON.stringify({ schemaVersion: 2, selectionsByLocale: { en_us: { 'responsive-expanded': { mode: 'individual', itemQueries: Object.fromEntries(targetIds.map((id) => [id, id.replace('minecraft:', '').replaceAll('_', ' ')])) } } } }))
    })
    await page.reload()
    await page.getByRole('button', { name: 'crafting sheet', exact: true }).click()
    const entry = page.locator('.crafting-sheet__entry')
    await expect(entry.locator('.crafting-sheet__summary-item')).toHaveCount(6)
    await entry.locator('.crafting-sheet__entry-toggle').click()
    const inputs = entry.locator('.crafting-sheet__query-input input')
    await expect(inputs).toHaveCount(6)
    const failures: string[] = []
    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(viewport)
      await settle(page)
      const problems = await containmentFailures(entry, 'button, input, select, .crafting-sheet__summary-item, .crafting-sheet__query-text, .crafting-sheet__item-cost, .keyboard-visual, .keyboard-visual__key')
      failures.push(...problems.map((problem) => `${viewport.width}x${viewport.height}: ${problem}`))
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      // Actual interaction also verifies fields remain reachable in local
      // desktop scroll areas and on the long, stacked mobile page.
      for (const input of await inputs.all()) {
        await input.scrollIntoViewIfNeeded()
        await input.click()
        await expect(input).toBeFocused()
        await input.press('Escape')
      }
    }
    await test.info().attach('expanded-entry-geometry', { body: JSON.stringify(failures, null, 2), contentType: 'application/json' })
    expect(failures, failures.join('\n')).toEqual([])
  })
}
