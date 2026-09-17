import { expect, test } from '@playwright/test'

for (const width of [1440, 375]) {
  test(`search crafting tour preserves saved item sets at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Help for search crafting' })).toBeEnabled()
    const saved = await page.evaluate(() => localStorage.getItem('mcsr.target-workspace.v1'))
    await expect(page.getByRole('button', { name: 'site info' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Help for search crafting' }).click()
    const tutorial = page.getByRole('dialog')
    await expect(tutorial.getByRole('heading', { name: 'Item sets' })).toBeVisible()
    await tutorial.getByRole('button', { name: 'next', exact: true }).click()
    await expect(tutorial.getByRole('heading', { name: 'Edit an item set' })).toBeVisible()
    await expect(page.locator('.item-set-editor')).toBeVisible()
    await expect(page.locator('.calculated-search-row').first()).toBeHidden()
    for (const title of ['Craft space', 'Retain item order', 'Custom inventories', 'Choose a language', 'Your top crafts', 'Your crafting sheet']) {
      await tutorial.getByRole('button', { name: 'next', exact: true }).click()
      await expect(tutorial.getByRole('heading', { name: title, exact: true })).toBeVisible()
      await expect(page.locator('.page-tutorial__spotlight')).toHaveCSS('border-top-width', '3px')
      await expect.poll(() => page.locator('.page-tutorial__spotlight').evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(10)
    }
    await expect(page.locator('.crafting-sheet__toggle')).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('.calculated-search-row').first()).toBeHidden()
    await tutorial.getByRole('button', { name: 'finish' }).click()
    await expect(tutorial).toHaveCount(0)
    await expect(page.locator('.calculated-search-row').first()).toBeVisible()
    await expect(page.locator('.item-set-editor')).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('mcsr.target-workspace.v1'))).toBe(saved)
    const favicon = await page.locator('link[rel="icon"]').getAttribute('href')
    expect(favicon).toContain('smithing_table.png')
    expect((await page.request.get(favicon!)).ok()).toBe(true)
  })
}

test('each page plays its own tour and language info has none', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 850 })
  await page.goto('/')
  for (const [name, titles] of [
    ['craft lookup', ['Look up one item set', 'Languages for this craft']],
    ['recipe book sim', ['Pick a language', 'Special characters', 'Try a search']],
  ] as const) {
    await page.getByRole('button', { name, exact: true }).click()
    const help = page.getByRole('button', { name: `Help for ${name}` })
    await expect(help).toBeEnabled()
    await help.click()
    const tutorial = page.getByRole('dialog')
    for (const [index, title] of titles.entries()) {
      await expect(tutorial.getByRole('heading', { name: title })).toBeVisible()
      const bounds = await tutorial.boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375)
      if (index < titles.length - 1) await tutorial.getByRole('button', { name: 'next' }).click()
    }
    await page.screenshot({ path: `test-results/tutorial-${name.replaceAll(' ', '-')}.png` })
    await page.keyboard.press('Escape')
    await expect(tutorial).toHaveCount(0)
    await expect(help).toBeFocused()
  }
  await page.getByRole('button', { name: 'language info', exact: true }).click()
  await expect(page.getByRole('heading', { name: /more language info/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Help for/ })).toHaveCount(0)
})

test('crafting sheet hides crafts until dismissed outside or with Escape', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /english.*search crafts/ }).click()
  await expect(page.locator('.calculated-search-row').first()).toBeHidden()
  await page.locator('.crafting-sheet__totals').click()
  await expect(page.locator('.crafting-sheet__toggle')).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('heading', { name: 'MCSR search crafting' }).click()
  await expect(page.locator('.calculated-search-row').first()).toBeVisible()
  await page.locator('.crafting-sheet__toggle').click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.calculated-search-row').first()).toBeVisible()
})
