import { expect, test } from '@playwright/test'

test('fits long summaries to their column and moves character sections after items on small screens', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await page.getByRole('button', { name: 'crafting sheet', exact: true }).waitFor()
  await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('mcsr.target-workspace.v1')!)
    const simple = workspace.entries[0]
    const longest = { ...workspace.entries.find((entry: { targetIds: string[] }) => entry.targetIds.includes('minecraft:iron_sword')), targetIds: ['minecraft:iron_ingot', 'minecraft:iron_sword', 'minecraft:iron_axe', 'minecraft:iron_pickaxe', 'minecraft:iron_shovel', 'minecraft:iron_helmet'] }
    workspace.entries = Array.from({ length: 18 }, (_, index) => ({ ...(index === 1 ? longest : simple), id: `wrap-${index}`, enabled: true, order: index }))
    localStorage.setItem('mcsr.target-workspace.v1', JSON.stringify(workspace))
    localStorage.setItem('mcsr.crafting-sheet.v1', JSON.stringify({ schemaVersion: 2, selectionsByLocale: { en_us: { 'wrap-1': { mode: 'individual', itemQueries: Object.fromEntries(longest.targetIds.map((id: string) => [id, id.replace('minecraft:', '').replaceAll('_', ' ')])) } } } }))
  })
  await page.reload()
  await page.getByRole('button', { name: 'crafting sheet', exact: true }).click()
  const rows = page.locator('.crafting-sheet__entry')
  await expect(rows).toHaveCount(18)
  await expect(rows.nth(1).locator('.crafting-sheet__query-preview').first()).toBeVisible()
  await expect(rows.nth(1).locator('.crafting-sheet__summary-item')).toHaveCount(6)

  const measure = () => rows.evaluateAll((elements) => elements.map((element) => {
    const row = element.getBoundingClientRect()
    const items = [...element.querySelectorAll('.crafting-sheet__summary-item')].map((item) => item.getBoundingClientRect())
    return { x: row.x, width: row.width, height: row.height, fits: items.every((item) => item.top >= row.top && item.bottom <= row.bottom && item.left >= row.left && item.right <= row.right), lines: new Set(items.map((item) => Math.round(item.top))).size }
  }))
  await expect.poll(async () => (await measure()).every((row) => row.fits)).toBe(true)
  const desktop = await measure()
  expect(desktop[1].lines).toBe(1)
  const firstColumn = desktop.filter((row) => Math.abs(row.x - desktop[0].x) < 1)
  expect(firstColumn.length).toBeGreaterThan(1)
  expect(firstColumn.every((row) => Math.abs(row.width - firstColumn[0].width) < 1)).toBe(true)
  await page.screenshot({ path: 'test-results/craft-sheet-columns.png' })

  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport)
    await expect.poll(async () => (await measure()).every((row) => row.fits)).toBe(true)
    const positions = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
      return { items: rect('.crafting-sheet__sets').bottom, characters: rect('.crafting-sheet__character-set-block').top, details: rect('.crafting-sheet__character-details').top, chart: rect('.crafting-sheet__chart--page').top }
    })
    expect(positions.characters).toBeGreaterThanOrEqual(positions.items)
    expect(positions.details).toBeGreaterThan(positions.characters)
    expect(positions.chart).toBeGreaterThan(positions.details)
    expect(await page.locator('.crafting-sheet').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  expect((await measure())[1].lines).toBeGreaterThan(1)
  await rows.nth(1).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/craft-sheet-wrapped.png' })
  await page.getByRole('button', { name: /^Show details for / }).first().click()
  await page.locator('.crafting-sheet__character-details').screenshot({ path: 'test-results/craft-character-details.png' })
})
