import { expect, test } from '@playwright/test'

test('crafting sheet customizes bed and anchor, persists choices, and fits narrow screens', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /english.*search crafts/ }).waitFor()
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
  await page.getByRole('button', { name: /english.*search crafts/ }).click()
  const sheet = page.locator('.crafting-sheet')
  const card = sheet.getByRole('region', { name: 'item set 1', exact: true })
  await expect(card.getByText('Calculating crafts…')).toHaveCount(0)
  await expect(card.locator('.crafting-sheet__plan')).toContainText('aw')
  await card.getByRole('button', { name: 'choose craft for item set 1' }).click()
  const combined = card.getByRole('region', { name: 'Calculated crafts for item set 1' })
  await combined.getByRole('searchbox').fill('be')
  const replaceCraft = combined.getByRole('button').filter({ hasText: 'Shift+Home' }).filter({ hasText: 'aw' }).filter({ hasText: 'be' }).first()
  await expect(replaceCraft).toBeVisible()
  await replaceCraft.click()
  await expect(card.locator('.crafting-sheet__plan')).toContainText('Shift+Home')
  await card.getByRole('button', { name: 'individual items', exact: true }).click()
  await card.getByRole('button', { name: 'choose craft for White Bed' }).click()
  const bedChoices = card.getByRole('region', { name: 'Calculated crafts for White Bed' })
  await bedChoices.getByRole('searchbox').fill('bed')
  await bedChoices.getByRole('button', { name: /^bed 3 typed/ }).click()
  await card.getByRole('button', { name: 'choose craft for Respawn Anchor' }).click()
  const anchorChoices = card.getByRole('region', { name: 'Calculated crafts for Respawn Anchor' })
  await anchorChoices.getByRole('searchbox').fill('aw')
  await anchorChoices.getByRole('button', { name: /^aw 2 typed/ }).click()
  await expect(card.locator('.crafting-sheet__plan')).toHaveText(/your sequencebedShift\+Homeaw/)
  await expect(sheet.getByLabel('Total characters typed')).toHaveText('5')
  await expect(sheet.getByLabel('Selected characters')).toHaveText('abdew')
  await expect(card.locator('.crafting-sheet__entry-metrics')).toContainText('+1 score')
  await page.reload()
  await page.getByRole('button', { name: /english.*search crafts/ }).click()
  await expect(card.getByRole('button', { name: 'individual items', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(card.locator('.crafting-sheet__plan')).toHaveText(/your sequencebedShift\+Homeaw/)

  await page.evaluate(() => document.fonts.ready)
  const fonts = await sheet.evaluate((element) => ({
    query: getComputedStyle(element.querySelector('.crafting-sheet__query-text')!).fontFamily,
    metric: getComputedStyle(element.querySelector('.crafting-sheet__totals strong')!).fontFamily,
    key: getComputedStyle(element.querySelector('.crafting-sheet__key')!).fontFamily,
    title: getComputedStyle(element.querySelector('.crafting-sheet__title')!).fontFamily,
  }))
  expect(fonts.query).toContain('Monocraft')
  for (const font of [fonts.metric, fonts.key, fonts.title]) expect(font).not.toContain('Monocraft')

  await sheet.screenshot({ path: 'test-results/crafting-sheet-desktop.png' })
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 1000 })
    await card.getByRole('button', { name: 'choose craft for White Bed' }).click()
    await expect(card.getByRole('searchbox')).toBeVisible()
    expect(await sheet.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    await card.getByRole('searchbox').press('Escape')
  }
  await page.setViewportSize({ width: 375, height: 1000 })
  await sheet.screenshot({ path: 'test-results/crafting-sheet-mobile.png', style: '.app-header { visibility: hidden !important; }' })
  await card.getByRole('checkbox', { name: 'Include item set 1' }).uncheck()
  await expect(sheet.getByLabel('Total characters typed')).toHaveText('0')
  await sheet.getByRole('button', { name: 'reset sheet' }).click()
  await expect(card.getByRole('checkbox', { name: 'Include item set 1' })).toBeChecked()
  await expect(card.getByRole('button', { name: 'combined craft', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
