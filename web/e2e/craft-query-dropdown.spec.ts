import { expect, test, type Page } from '@playwright/test'

test.use({ hasTouch: true })

async function openFirstItemSet(page: Page, multipleCrafts = false) {
  await page.goto('/')
  if (multipleCrafts) {
    await page.getByRole('button', { name: 'crafting sheet', exact: true }).waitFor()
    await page.evaluate(() => {
      const workspace = JSON.parse(localStorage.getItem('mcsr.target-workspace.v1')!)
      const entry = workspace.entries.find((value: { targetIds: string[] }) => value.targetIds.includes('minecraft:respawn_anchor'))
      entry.targetIds = ['minecraft:white_bed', 'minecraft:respawn_anchor']
      entry.order = 0
      workspace.entries = [entry]
      localStorage.setItem('mcsr.target-workspace.v1', JSON.stringify(workspace))
    })
    await page.reload()
  }
  await page.getByRole('button', { name: 'crafting sheet', exact: true }).click()
  const card = page.getByRole('region', { name: 'item set 1', exact: true })
  await card.getByRole('button', { name: 'Expand item set 1' }).click()
  return card
}

async function expectPopupFits(page: Page) {
  const popup = page.locator('.crafting-sheet__query-suggestions')
  await expect(popup).toBeVisible()
  const bounds = await popup.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const sheet = document.querySelector('.crafting-sheet')!.getBoundingClientRect()
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, minLeft: Math.max(0, sheet.left), maxRight: Math.min(innerWidth, sheet.right), minTop: Math.max(0, sheet.top), maxBottom: Math.min(innerHeight, sheet.bottom), style: element.getAttribute('style'), anchor: document.activeElement?.getBoundingClientRect().toJSON(), visualHeight: visualViewport?.height, offset: visualViewport?.offsetTop }
  })
  expect(bounds.left).toBeGreaterThanOrEqual(bounds.minLeft)
  expect(bounds.right).toBeLessThanOrEqual(bounds.maxRight)
  expect(bounds.top).toBeGreaterThanOrEqual(bounds.minTop)
  expect(bounds.bottom, JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.maxBottom)
  expect(await popup.evaluate((element) => element.parentElement === document.body)).toBe(true)
}

test('query suggestions preserve the sheet scroll container and remain anchored when it scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const card = await openFirstItemSet(page)
  const input = card.getByRole('searchbox').first()
  await input.scrollIntoViewIfNeeded()
  const columns = page.locator('.crafting-sheet__set-columns')
  const before = await columns.evaluate((element) => ({ top: element.scrollTop, left: element.scrollLeft, overflow: getComputedStyle(element).overflow }))
  await input.click()
  await expectPopupFits(page)
  await page.screenshot({ path: 'test-results/craft-query-dropdown-desktop.png' })
  const after = await columns.evaluate((element) => ({ top: element.scrollTop, left: element.scrollLeft, overflow: getComputedStyle(element).overflow }))
  expect(after).toEqual(before)
  const oldTop = await input.evaluate((element) => element.getBoundingClientRect().top)
  await columns.evaluate((element) => { element.scrollTop += 40 })
  await expect.poll(() => input.evaluate((element) => element.getBoundingClientRect().top)).toBeLessThanOrEqual(oldTop)
  const popup = page.locator('.crafting-sheet__query-suggestions')
  if (await popup.isVisible()) await expectPopupFits(page)
  await input.click()
  await popup.getByRole('button').first().click()
  await expect(popup).toHaveCount(0)
})

test('phone query focus keeps one bounded popup and selecting a suggestion works by tap', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 })
  const card = await openFirstItemSet(page, true)
  const inputs = card.getByRole('searchbox')
  await inputs.first().tap()
  await expectPopupFits(page)
  await page.screenshot({ path: 'test-results/craft-query-dropdown-phone.png' })
  const popup = page.locator('.crafting-sheet__query-suggestions')
  await inputs.nth(1).scrollIntoViewIfNeeded()
  await inputs.nth(1).tap()
  await expect(popup).toHaveCount(1)
  await expectPopupFits(page)
  const label = await inputs.nth(1).getAttribute('aria-label')
  await expect(popup).toHaveAttribute('aria-label', label!.replace('Craft query', 'Calculated craft suggestions'))
  await popup.getByRole('button').first().tap()
  await expect(popup).toHaveCount(0)
})
