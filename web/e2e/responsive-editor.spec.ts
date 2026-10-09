import { expect, test } from '@playwright/test'

const breakpoints = [512, 544, 560, 576, 608, 672, 704, 752, 832, 880, 896, 1120, 1152, 1200, 1536]
const widths = [...new Set([
  ...Array.from({ length: 281 }, (_, index) => 320 + index * 8),
  ...breakpoints.flatMap(width => [width - 1, width, width + 1]),
])].sort((a, b) => a - b)
const viewports = [
  ...widths.map(width => ({ width, height: 1000 })),
  { width: 320, height: 568 }, { width: 390, height: 844 },
  { width: 844, height: 390 }, { width: 768, height: 1024 },
  { width: 1280, height: 720 }, { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
]

test('larger shared-editor text fits the previous closed-panel height budget', async ({ page }) => {
  // Measured before the typography change with the starter item set / empty lookup.
  const budgets = [
    { width: 390, itemSet: 804.15, lookup: 661.86 },
    { width: 768, itemSet: 672.21, lookup: 624.27 },
    { width: 1440, itemSet: 719.38, lookup: 624.27 },
    { width: 1920, itemSet: 672.21, lookup: 624.27 },
  ]
  for (const budget of budgets) for (const lookup of [false, true]) {
    await page.setViewportSize({ width: budget.width, height: 1000 })
    await page.goto('/')
    await page.getByRole('button', { name: lookup ? 'craft lookup' : 'Edit item set 1', exact: true }).click()
    await page.evaluate(() => document.fonts.ready)
    const sizes = await page.locator('.item-set-editor').evaluate(editor => ({
      height: editor.getBoundingClientRect().height,
      rulesHeight: editor.querySelector('.item-set-editor__rules')!.getBoundingClientRect().height,
      heading: parseFloat(getComputedStyle(editor.querySelector('h3')!).fontSize),
      label: parseFloat(getComputedStyle(editor.querySelector('.grid-size-switch__title')!).fontSize),
      controlHeight: editor.querySelector('.segmented-control')!.getBoundingClientRect().height,
    }))
    expect(sizes.heading).toBeGreaterThanOrEqual(16)
    expect(sizes.label).toBeGreaterThanOrEqual(15)
    expect(sizes.rulesHeight).toBeLessThanOrEqual(116.4)
    expect(sizes.controlHeight).toBeLessThanOrEqual(31)
    expect(sizes.height, `${lookup ? 'lookup' : 'item set'} at ${budget.width}px`).toBeLessThanOrEqual((lookup ? budget.lookup : budget.itemSet) + 1)
  }
})

for (const compact of [false, true]) for (const lookup of [false, true]) {
  test(`shared editor multi-add and open-picker sweep (${lookup ? 'lookup' : 'item set'}, ${compact ? 'compact' : 'normal'})`, async ({ page }) => {
    test.setTimeout(180_000)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    if (compact) {
      await page.getByRole('button', { name: 'settings', exact: true }).click()
      await page.getByRole('switch', { name: 'compact layout', exact: true }).click()
      await page.getByRole('button', { name: 'save settings', exact: true }).click()
      await page.getByRole('button', { name: 'search crafting', exact: true }).click()
    }
    await page.getByRole('button', { name: lookup ? 'craft lookup' : 'Add item set', exact: true }).click()
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' })
    const editor = page.locator('.item-set-editor')
    await expect(editor.getByRole('searchbox')).toHaveCount(0)
    for (const picker of [
      { label: 'target items', search: 'Search Goals', names: ['Stick', 'Crafting Table'] },
      { label: 'inventory items', search: 'Search Inventory', names: ['Oak Planks', 'Iron Ingot'] },
    ]) {
      const add = editor.getByRole('button', { name: `Add ${picker.label}` })
      await add.click()
      const search = editor.getByRole('searchbox', { name: picker.search })
      for (const name of picker.names) {
        await search.fill(name)
        await editor.getByRole('button', { name, exact: true }).click()
        await expect(search).toBeFocused()
        await expect(editor.getByRole('button', { name: `Remove ${name}`, exact: true })).toBeVisible()
      }
      await search.fill('')
      for (const viewport of viewports) {
        await page.setViewportSize(viewport)
        await page.evaluate(async () => { await document.fonts.ready; await new Promise(requestAnimationFrame) })
        const issues = await editor.evaluate(element => {
          const failures: string[] = []
          const bounds = element.getBoundingClientRect()
          if (document.documentElement.scrollWidth > innerWidth + 1) failures.push('page overflow')
          for (const control of element.querySelectorAll('button, input, select, .item-picker__results')) {
            if (!control.checkVisibility()) continue
            const box = control.getBoundingClientRect()
            if (box.left < bounds.left - 1 || box.right > bounds.right + 1) failures.push(`escaped control: ${control.getAttribute('aria-label')}`)
          }
          const sections = [...element.children].filter(child => !child.matches('.item-set-editor__dismiss'))
          for (let i = 1; i < sections.length; i++) {
            if (sections[i - 1].getBoundingClientRect().bottom > sections[i].getBoundingClientRect().top + 1) failures.push('overlapping editor sections')
          }
          const results = element.querySelector('.item-picker__results')!
          if (results.scrollWidth > results.clientWidth + 1) failures.push('picker horizontal overflow')
          return failures
        })
        expect(issues, `${picker.label} at ${viewport.width}x${viewport.height}`).toEqual([])
      }
      await editor.getByRole('heading', { level: 2 }).click()
      await expect(search).toHaveCount(0)
      await expect(add).toHaveAttribute('aria-expanded', 'false')
    }
    // Clicking the next section while a picker is open must still activate it;
    // collapsing the inline picker on pointerdown would move this click target.
    await editor.getByRole('button', { name: 'Add target items' }).click()
    await editor.getByRole('button', { name: 'Use inventory preset Overworld' }).click()
    await expect(editor.getByRole('button', { name: 'Remove Dirt', exact: true })).toBeVisible()
    await expect(editor.getByRole('searchbox')).toHaveCount(0)
    await expect(editor.getByRole('button', { name: lookup ? 'Look up crafts' : 'Save item set', exact: true })).toBeEnabled()
  })
}

for (const compact of [false, true]) test(`simulator open item picker sweep (${compact ? 'compact' : 'normal'})`, async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  if (compact) {
    await page.getByRole('button', { name: 'settings', exact: true }).click()
    await page.getByRole('switch', { name: 'compact layout', exact: true }).click()
    await page.getByRole('button', { name: 'save settings', exact: true }).click()
  }
  await page.getByRole('button', { name: 'recipe book sim', exact: true }).click()
  await page.getByRole('button', { name: 'Add inventory items' }).click()
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(requestAnimationFrame) })
    const issues = await page.locator('.recipe-book-sim__controls').evaluate(panel => {
      const bounds = panel.getBoundingClientRect()
      const problems = [...panel.querySelectorAll('.item-picker input, .item-picker button, .item-picker__results')].filter(control => {
        const box = control.getBoundingClientRect()
        return box.left < bounds.left - 1 || box.right > bounds.right + 1 || control.scrollWidth > control.clientWidth + 1
      }).map(control => control.getAttribute('aria-label') ?? control.className)
      if (document.documentElement.scrollWidth > innerWidth + 1) problems.push('page overflow')
      return problems
    })
    expect(issues, `simulator picker at ${viewport.width}x${viewport.height}`).toEqual([])
  }
  await page.getByRole('heading', { name: 'recipe book simulator', exact: true }).click()
  await expect(page.getByRole('searchbox', { name: 'Search Simulator inventory', exact: true })).toHaveCount(0)
})

for (const width of [390, 1440]) test(`item editor action hierarchy at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto('/')
  await page.getByRole('switch', { name: 'Switch to dark mode' }).click()
  await page.getByRole('button', { name: 'Choose color theme' }).click()
  await page.getByRole('menuitemradio', { name: 'Select regular gray theme' }).click()
  await page.getByRole('button', { name: 'Edit item set 1', exact: true }).click()
  const editor = page.locator('.item-set-editor')
  const actions = editor.locator('.item-set-editor__commit-actions')
  await expect(actions.getByRole('button', { name: 'Save item set' })).toBeEnabled()
  await expect(actions.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
  await expect(actions.getByRole('button', { name: 'Delete item set' })).toHaveCount(0)
  await expect(editor.getByRole('button', { name: 'Delete item set' })).toBeVisible()
  const style = await actions.getByRole('button', { name: 'Save item set' }).evaluate(button => ({
    background: getComputedStyle(button).backgroundColor,
    width: button.getBoundingClientRect().width,
    available: button.closest('.item-set-editor__actions')!.getBoundingClientRect().width,
  }))
  expect(style.background).toBe('rgb(39, 102, 60)')
  expect(await editor.getByRole('button', { name: 'Delete item set' }).evaluate(button => getComputedStyle(button).backgroundColor)).toBe('rgb(163, 46, 52)')
  expect(style.width).toBeLessThan(style.available * .75)
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})))
  })
  await expect(editor).toHaveScreenshot(`item-editor-${width}.png`, { animations: 'disabled' })
})
