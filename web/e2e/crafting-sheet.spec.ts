import { expect, test } from '@playwright/test'

test('keeps the header fixed while the crafting sheet opens and closes', async ({ page }) => {
  await page.goto('/')
  const header = page.locator('.app-header')
  const initialTop = await header.evaluate((element) => element.getBoundingClientRect().top)

  await page.getByRole('button', { name: 'crafting sheet', exact: true }).click()
  const backToCrafts = page.getByRole('button', { name: 'Back to english (us) crafts' })
  await expect(backToCrafts).toBeVisible()
  expect(await backToCrafts.evaluate((element) => Number.parseFloat(getComputedStyle(element).borderTopLeftRadius))).toBeGreaterThan(0)
  expect(await header.evaluate((element) => element.getBoundingClientRect().top)).toBeCloseTo(initialTop, 0)

  await page.getByRole('button', { name: 'Back to english (us) crafts' }).click()
  await expect(page.getByRole('region', { name: 'Languages' })).toBeVisible()
  expect(await header.evaluate((element) => element.getBoundingClientRect().top)).toBeCloseTo(initialTop, 0)
})

test('expands a sheet item set without clipping its controls inside a compact row', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'crafting sheet', exact: true }).waitFor()
  await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('mcsr.target-workspace.v1')!)
    const source = workspace.entries[0]
    workspace.entries = Array.from({ length: 18 }, (_, index) => ({ ...source, id: `expanded-${index}`, order: index }))
    localStorage.setItem('mcsr.target-workspace.v1', JSON.stringify(workspace))
  })
  await page.reload()
  await page.getByRole('button', { name: 'crafting sheet', exact: true }).click()
  const entry = page.getByRole('region', { name: 'item set 1', exact: true })
  const collapsedWidth = await entry.evaluate((element) => element.getBoundingClientRect().width)

  await entry.getByRole('button', { name: 'Expand item set 1' }).click()
  await expect(entry.getByRole('searchbox', { name: /Craft query for/ }).first()).toBeVisible()
  expect(await entry.evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(collapsedWidth, 0)
  expect(await entry.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true)
  await entry.getByRole('button', { name: 'Collapse item set 1' }).click()
  await expect.poll(async () => (await entry.locator('.crafting-sheet__details').boundingBox())!.height).toBe(0)
  await expect(entry.locator('.crafting-sheet__details')).toHaveCSS('overflow', 'hidden')
  expect(await entry.evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(collapsedWidth, 0)
})

test('stacks sheet item sets on short desktop displays', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')
  await page.getByRole('button', { name: 'crafting sheet', exact: true }).waitFor()
  await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('mcsr.target-workspace.v1')!)
    const source = workspace.entries[0]
    workspace.entries = Array.from({ length: 18 }, (_, index) => ({ ...source, id: `short-screen-${index}`, order: index }))
    localStorage.setItem('mcsr.target-workspace.v1', JSON.stringify(workspace))
  })
  await page.reload()
  await page.getByRole('button', { name: 'crafting sheet', exact: true }).click()
  await expect(page.getByRole('button', { name: /Back to .* crafts/ })).toBeVisible()
  const first = page.getByRole('region', { name: 'item set 1', exact: true })
  const second = page.getByRole('region', { name: 'item set 2', exact: true })
  await expect.poll(async () => {
    const positions = await Promise.all([first.boundingBox(), second.boundingBox()])
    return Math.abs(positions[1]!.x - positions[0]!.x) < .5
      && positions[1]!.y >= positions[0]!.y + positions[0]!.height
  }).toBe(true)
  expect(await page.locator('.crafting-sheet').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
})

test('keeps all-enabled sheet rows stable after a resize', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: 'crafting sheet', exact: true }).waitFor()
  await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('mcsr.target-workspace.v1')!)
    const source = workspace.entries[0]
    workspace.entries = Array.from({ length: 18 }, (_, index) => ({ ...source, id: `stable-${index}`, order: index }))
    localStorage.setItem('mcsr.target-workspace.v1', JSON.stringify(workspace))
  })
  await page.reload()
  await page.getByRole('button', { name: 'crafting sheet', exact: true }).click()
  await expect(page.getByRole('button', { name: /Back to .* crafts/ })).toBeVisible()
  const columns = page.locator('.crafting-sheet__set-columns')
  await expect(columns).toHaveClass(/crafting-sheet__set-columns--sized/)
  await page.setViewportSize({ width: 1280, height: 760 })
  await expect(columns).toHaveClass(/crafting-sheet__set-columns--sized/)

  const first = page.getByRole('region', { name: 'item set 1', exact: true })
  const second = page.getByRole('region', { name: 'item set 2', exact: true })
  const positions = await Promise.all([first.boundingBox(), second.boundingBox()])
  expect(positions[1]!.x).toBeCloseTo(positions[0]!.x, 0)
  expect(positions[1]!.y).toBeGreaterThanOrEqual(positions[0]!.y + positions[0]!.height)
})

test('stacks compact sheet item sets in one full-width column', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: 'crafting sheet', exact: true }).waitFor()
  await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('mcsr.target-workspace.v1')!)
    const source = workspace.entries[0]
    workspace.entries = Array.from({ length: 18 }, (_, index) => ({ ...source, id: `compact-${index}`, order: index }))
    localStorage.setItem('mcsr.target-workspace.v1', JSON.stringify(workspace))
  })
  await page.reload()
  await page.getByRole('button', { name: 'crafting sheet', exact: true }).click()
  await expect(page.getByRole('button', { name: /Back to .* crafts/ })).toBeVisible()
  const columns = page.locator('.crafting-sheet__set-columns')
  await expect(columns).toHaveCSS('display', 'flex')
  const first = page.getByRole('region', { name: 'item set 1', exact: true })
  const second = page.getByRole('region', { name: 'item set 2', exact: true })
  const positions = await Promise.all([columns.boundingBox(), first.boundingBox(), second.boundingBox()])
  expect(positions[1]!.width).toBeCloseTo(positions[0]!.width, 0)
  expect(positions[2]!.x).toBeCloseTo(positions[1]!.x, 0)
  expect(positions[2]!.y).toBeGreaterThanOrEqual(positions[1]!.y + positions[1]!.height)
})

test('packs excluded sheet rows at their natural height', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'crafting sheet', exact: true }).waitFor()
  await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('mcsr.target-workspace.v1')!)
    const source = workspace.entries[0]
    workspace.entries = Array.from({ length: 18 }, (_, index) => ({ ...source, id: `excluded-${index}`, order: index }))
    localStorage.setItem('mcsr.target-workspace.v1', JSON.stringify(workspace))
  })
  await page.reload()
  await page.getByRole('button', { name: 'crafting sheet', exact: true }).click()
  const columns = page.locator('.crafting-sheet__set-columns')
  const entry = page.getByRole('region', { name: 'item set 4', exact: true })
  const nextEntry = page.getByRole('region', { name: 'item set 5', exact: true })

  await entry.getByRole('checkbox', { name: 'Include item set 4' }).uncheck()
  await expect(entry).toHaveClass(/crafting-sheet__entry--disabled/)
  await expect(columns).toHaveClass(/crafting-sheet__set-columns--compact-rows/)
  await expect(columns).toHaveCSS('align-content', 'start')
  expect(await entry.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(await nextEntry.evaluate((element) => element.getBoundingClientRect().height))
  const verticalGap = await entry.evaluate((element) => {
    const next = element.nextElementSibling
    return next ? next.getBoundingClientRect().top - element.getBoundingClientRect().bottom : Number.NaN
  })
  expect(verticalGap).toBeGreaterThan(0)
  expect(verticalGap).toBeLessThan(8)
  await page.setViewportSize({ width: 375, height: 1000 })
  expect(await entry.evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(await nextEntry.evaluate((element) => element.getBoundingClientRect().width), 0)
})

test('crafting sheet customizes bed and anchor, persists choices, and fits narrow screens', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'crafting sheet', exact: true }).waitFor()
  // Reuse the starter inventory, keeping exactly the two targets in this example.
  await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('mcsr.target-workspace.v1')!)
    const entry = workspace.entries.find((value: { targetIds: string[] }) => value.targetIds.includes('minecraft:respawn_anchor'))
    entry.targetIds = ['minecraft:white_bed', 'minecraft:respawn_anchor']
    entry.order = 0
    workspace.entries = [entry]
    localStorage.setItem('mcsr.target-workspace.v1', JSON.stringify(workspace))
  })
  await page.reload()
  await page.getByRole('button', { name: 'crafting sheet', exact: true }).click()
  const sheet = page.locator('.crafting-sheet')
  const card = sheet.getByRole('region', { name: 'item set 1', exact: true })
  await expect(card.getByText('Calculating crafts…')).toHaveCount(0)
  await card.getByRole('button', { name: 'Expand item set 1' }).click()
  await expect(card.locator('.crafting-sheet__plan')).toContainText('aw')
  const initialSequence = await card.locator('.crafting-sheet__plan').textContent()
  await expect(card.getByRole('button', { name: 'combined craft', exact: true })).toHaveCount(0)
  await expect(card.getByRole('button', { name: 'individual items', exact: true })).toHaveCount(0)
  if (await card.getByRole('button', { name: 'Move White Bed up' }).isEnabled()) await card.getByRole('button', { name: 'Move White Bed up' }).click()
  const bedQuery = card.getByRole('searchbox', { name: 'Craft query for White Bed' })
  await bedQuery.fill('bed')
  await bedQuery.press('Enter')
  const anchorQuery = card.getByRole('searchbox', { name: 'Craft query for Respawn Anchor' })
  await anchorQuery.fill('aw')
  await anchorQuery.press('Enter')
  await expect(card.locator('.crafting-sheet__plan')).toHaveText(/your sequencebedSHaw/)
  await expect(sheet.getByLabel('Total characters')).toHaveText('5')
  await expect(sheet.getByLabel('Selected characters')).toHaveText('abdew')
  await expect(card.locator('.crafting-sheet__entry-metrics')).toContainText('+1 score')
  await page.reload()
  await page.getByRole('button', { name: 'crafting sheet', exact: true }).click()
  await expect(card.getByLabel('Selected query for White Bed')).toHaveText('bed')
  await card.getByRole('button', { name: 'Expand item set 1' }).click()
  await expect(card.locator('.crafting-sheet__plan')).toHaveText(/your sequencebedSHaw/)

  await page.evaluate(() => document.fonts.ready)
  const fonts = await sheet.evaluate((element) => ({
    query: getComputedStyle(element.querySelector('.crafting-sheet__query-text')!).fontFamily,
    metric: getComputedStyle(element.querySelector('.crafting-sheet__totals strong')!).fontFamily,
    key: getComputedStyle(element.querySelector('.crafting-sheet__key')!).fontFamily,
    title: getComputedStyle(element.querySelector('.crafting-sheet__title')!).fontFamily,
    subtitle: getComputedStyle(element.querySelector('.crafting-sheet__toggle-label')!).fontFamily,
  }))
  expect(fonts.query).toContain('Monocraft')
  expect(fonts.title).toContain('Coiny')
  expect(fonts.subtitle).toContain('Coiny')
  for (const font of [fonts.metric, fonts.key, fonts.title]) expect(font).not.toContain('Monocraft')

  await sheet.screenshot({ path: 'test-results/crafting-sheet-desktop.png' })
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect(card.getByRole('searchbox', { name: 'Craft query for White Bed' })).toBeVisible()
    expect(await sheet.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 375, height: 1000 })
  await sheet.screenshot({ path: 'test-results/crafting-sheet-mobile.png', style: '.app-header { visibility: hidden !important; }' })
  await card.getByRole('checkbox', { name: 'Include item set 1' }).uncheck()
  await expect(card.getByRole('button', { name: /item set 1/ })).toHaveCount(0)
  await expect(sheet.getByLabel('Total characters')).toHaveText('0')
  await sheet.getByRole('button', { name: 'reset sheet' }).click()
  await expect(card.getByRole('checkbox', { name: 'Include item set 1' })).toBeChecked()
  await expect(card.locator('.crafting-sheet__plan')).toHaveText(initialSequence!)
})

test('keeps the full sheet and comparison pages fluid in normal and compact layouts', async ({ page }) => {
  async function expectPageFits(root: string) {
    const rootSize = await page.locator(root).evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }))
    const documentSize = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: window.innerWidth }))
    expect(rootSize.scrollWidth, `${root} has no horizontal overflow`).toBeLessThanOrEqual(rootSize.clientWidth)
    expect(documentSize.scrollWidth, 'the document has no horizontal overflow').toBeLessThanOrEqual(documentSize.clientWidth)
  }

  async function checkPages(compact: boolean) {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.getByRole('button', { name: 'crafting sheet', exact: true }).click()
    await expect(page.locator('.page-transition__content')).toHaveClass(/page-transition__content--entering/)
    await expect(page.locator('.page-transition')).toHaveCSS('pointer-events', 'auto')
    const sheet = page.locator('.crafting-sheet--page')
    await expect(sheet).toBeVisible()
    if (compact) await expect(sheet).toHaveClass(/crafting-sheet--compact/)
    else await expect(sheet).not.toHaveClass(/crafting-sheet--compact/)
    for (const width of [1280, 768, 375]) {
      await page.setViewportSize({ width, height: 900 })
      await expectPageFits('.crafting-sheet--page')
    }
    await page.getByRole('button', { name: /Back to .* crafts/ }).click()
    await page.getByRole('button', { name: 'compare languages', exact: true }).click()
    await expect(page.locator('.page-transition__content')).toHaveClass(/page-transition__content--entering/)
    const comparison = page.getByRole('region', { name: 'Language craft comparison' })
    await expect(comparison).toBeVisible()
    if (compact) await expect(comparison).toHaveClass(/language-comparison--compact/)
    else await expect(comparison).not.toHaveClass(/language-comparison--compact/)
    await expect(comparison.locator('.language-comparison__comparison-grid')).toHaveCount(0)
    await comparison.getByRole('button', { name: /^compare$/i }).click()
    const comparisonGrid = comparison.locator('.language-comparison__comparison-grid')
    await expect(comparisonGrid).toBeVisible()
    await expect(comparison.locator('.language-comparison__navigator')).toHaveCount(compact ? 1 : 0)
    for (const [width, normalColumns, compactColumns] of [[1280, 3, 2], [768, 2, 2], [375, 1, 1]] as const) {
      await page.setViewportSize({ width, height: 900 })
      await expectPageFits('.language-comparison--page')
      await expect.poll(() => comparisonGrid.evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length)).toBe(compact ? compactColumns : normalColumns)
    }
    await page.getByRole('button', { name: 'Back to crafts' }).click()
    await expect(page.locator('.page-transition__content')).toHaveClass(/page-transition__content--entering/)

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.getByRole('button', { name: 'language info', exact: true }).click()
    await expect(page.getByRole('heading', { name: /more language info/i })).toBeVisible()
    await page.getByRole('button', { name: 'craft lookup', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'craft lookup' })).toBeVisible()
    await page.getByRole('button', { name: 'recipe book sim', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'recipe book simulator' })).toBeVisible()
    await page.getByRole('button', { name: 'settings', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'scoring settings' })).toBeVisible()
    await page.getByRole('button', { name: 'search crafting', exact: true }).click()
    await expect(page.getByRole('button', { name: 'crafting sheet', exact: true })).toBeVisible()
  }

  await page.goto('/')
  await page.getByRole('button', { name: 'crafting sheet', exact: true }).waitFor()
  await checkPages(false)

  await page.getByRole('button', { name: 'settings' }).click()
  await page.getByRole('switch', { name: 'compact layout' }).click()
  await page.getByRole('button', { name: 'save settings' }).click()
  await page.getByRole('button', { name: 'search crafting' }).click()
  await page.getByRole('button', { name: 'crafting sheet', exact: true }).waitFor()
  await checkPages(true)
})

test('reorders Latin item crafts and automatically uses two backspaces for lea to lab', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'crafting sheet', exact: true }).waitFor()
  await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('mcsr.target-workspace.v1')!)
    const entry = workspace.entries.find((value: { targetIds: string[] }) => value.targetIds.includes('minecraft:golden_helmet'))
    entry.targetIds = ['minecraft:golden_helmet', 'minecraft:golden_pickaxe']
    entry.order = 0
    workspace.entries = [entry]
    localStorage.setItem('mcsr.target-workspace.v1', JSON.stringify(workspace))
  })
  await page.reload()
  await page.getByRole('button', { name: /^latin -/i }).click()
  const sheet = page.locator('.crafting-sheet')
  await sheet.getByRole('button', { name: 'crafting sheet', exact: true }).click()
  const card = sheet.getByRole('region', { name: 'item set 1', exact: true })
  await card.getByRole('button', { name: 'Expand item set 1' }).click()
  const helmetUp = card.getByRole('button', { name: /^Move Galea aurea up$/i })
  if (await helmetUp.isEnabled()) await helmetUp.click()
  const rows = card.locator('.crafting-sheet__individual-item')
  for (const [index, query] of ['lea', 'lab'].entries()) {
    const input = rows.nth(index).getByRole('searchbox')
    await input.fill(query)
    await input.press('Enter')
  }
  const plan = card.locator('.crafting-sheet__plan')
  await expect(plan).toContainText('lea')
  await expect(plan.getByLabel('2 backspaces')).toBeVisible()
  await expect(plan.locator('.crafting-sheet__query-text').last()).toHaveText('ab')
  await expect(sheet.getByLabel('Total characters')).toHaveText('5')
  await expect(rows.nth(1).locator('.crafting-sheet__item-cost')).toContainText('2 chars')
  await expect(card.locator('.crafting-sheet__summary-item')).toHaveCount(2)
  // Labels are available through the icons, without taking up visible row space.
  await expect(card.getByText('Galea aurea', { exact: true })).toHaveCount(0)
  await rows.nth(1).getByRole('button', { name: /^Move .* up$/ }).click()
  await expect(plan.locator('.crafting-sheet__query-text').first()).toHaveText('lab')
  await expect(plan.locator('.crafting-sheet__query-text').last()).toHaveText('ea')
  await expect(card.locator('.crafting-sheet__query-preview').first()).toHaveText('lab')
  await page.reload()
  await sheet.getByRole('button', { name: 'crafting sheet', exact: true }).click()
  await card.getByRole('button', { name: 'Expand item set 1' }).click()
  await expect(plan.locator('.crafting-sheet__query-text').first()).toHaveText('lab')
  await rows.nth(0).getByRole('button', { name: /^Move .* down$/ }).click()
  await expect(plan.locator('.crafting-sheet__query-text').first()).toHaveText('lea')
  await expect(plan.getByLabel('2 backspaces')).toBeVisible()
  await sheet.screenshot({ path: 'test-results/crafting-sheet-latin-order.png', style: '.app-header { visibility: hidden !important; }' })
  await page.setViewportSize({ width: 375, height: 1000 })
  expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await sheet.screenshot({ path: 'test-results/crafting-sheet-latin-order-mobile.png', style: '.app-header { visibility: hidden !important; }' })
  for (const index of [0, 1]) {
    const input = rows.nth(index).getByRole('searchbox')
    await input.fill('aurea')
    await input.press('Enter')
  }
  await expect(plan.locator('.crafting-sheet__query-text')).toHaveCount(1)
  await expect(plan.locator('.crafting-sheet__query-text')).toHaveText('aurea')
  await expect(sheet.getByLabel('Total characters')).toHaveText('5')
  await expect(rows.nth(1).locator('.crafting-sheet__item-cost')).toContainText('0 chars · 0 junk')
  const splitInput = rows.nth(1).getByRole('searchbox')
  await splitInput.fill('lab')
  await splitInput.press('Enter')
  await expect(plan.locator('.crafting-sheet__query-text')).toHaveCount(2)
  await expect(plan.locator('.crafting-sheet__query-text').first()).toHaveText('aurea')
})
