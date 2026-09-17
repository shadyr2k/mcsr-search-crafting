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
    await expect(page.locator('.page-tutorial svg')).toHaveCount(0)
    await expect(tutorial.getByRole('heading', { name: 'Item sets' })).toBeVisible()
    await tutorial.getByRole('button', { name: 'next', exact: true }).click()
    await expect(tutorial.getByRole('heading', { name: 'Edit an item set' })).toBeVisible()
    await expect(page.locator('.item-set-editor')).toBeVisible()
    await page.locator('.item-set-editor').evaluate((editor) => { editor.setAttribute('data-test-instance', 'kept-open') })
    await expect(page.locator('.calculated-search-row').first()).toBeHidden()
    const targets = [
      ['Craft space', '.item-set-editor .grid-size-switch'],
      ['Retain item order', '.item-set-editor .craft-order-switch'],
      ['Your inventory', '.item-set-editor__inventory'],
      ['Custom inventories', '.item-set-editor .custom-slots'],
      ['Choose a language', width > 1152 ? '.language-selector__category .language-selector__language' : '.language-selector'],
      ['Your top crafts', '.results-column .calculated-search-row:has(.craft-preview--single):has(.craft-preview--overlap) .calculated-search-row__summary'],
      ['Your crafting sheet', '.crafting-sheet__totals'],
    ]
    for (const [title, target] of targets) {
      await tutorial.getByRole('button', { name: 'next', exact: true }).click()
      await expect(tutorial.getByRole('heading', { name: title, exact: true })).toBeVisible()
      await expect(page.locator('.page-tutorial__spotlight')).toHaveCSS('border-top-width', '3px')
      await expect.poll(() => page.locator('.page-tutorial__spotlight').evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(10)
      await expect.poll(() => page.locator('.page-tutorial__spotlight').evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(10)
      await expect.poll(() => page.evaluate((selector) => {
        const target = document.querySelector(selector)!.getBoundingClientRect()
        const highlight = document.querySelector('.page-tutorial__spotlight')!.getBoundingClientRect()
        const card = document.querySelector('.page-tutorial__card')!.getBoundingClientRect()
        return highlight.left >= target.left - 5 && highlight.right <= target.right + 5
          && highlight.top >= target.top - 5 && highlight.bottom <= target.bottom + 5
          && highlight.bottom < card.top
      }, target)).toBe(true)
      if (['Craft space', 'Retain item order', 'Your inventory', 'Custom inventories'].includes(title)) {
        await expect(page.locator('.item-set-editor')).toHaveAttribute('data-test-instance', 'kept-open')
      }
      if (['Craft space', 'Custom inventories'].includes(title)) {
        await page.screenshot({ path: `test-results/tutorial-${width}-${title.replaceAll(' ', '-')}.png` })
      }
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

test('scrolling keeps the highlight on its visible target without a sticky header', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 850 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Help for search crafting' }).click()
  const spotlight = page.locator('.page-tutorial__spotlight')
  await expect(spotlight).toBeVisible()
  await expect(page.locator('.app-header')).toHaveCSS('position', 'relative')
  await page.mouse.move(350, 300)
  await page.mouse.wheel(0, 120)
  await expect.poll(() => page.evaluate(() => {
    const target = document.querySelector('.item-set-workspace')!.getBoundingClientRect()
    const highlight = document.querySelector('.page-tutorial__spotlight')!.getBoundingClientRect()
    return Math.abs(highlight.top - Math.max(4, target.top - 4)) < 1
  })).toBe(true)
  await page.getByRole('button', { name: 'close tutorial' }).click()
  await expect(page.locator('.app-header')).toHaveCSS('position', 'sticky')
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
