import { expect, test } from '@playwright/test'

test('full language results header reflows and preserves both navigation actions', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('searchbox', { name: 'Search languages', exact: true }).fill('elfdalian')
  await page.getByRole('button', { name: /elfdalian -/ }).click()
  const header = page.locator('.results-header')
  await expect(header.getByRole('heading')).toContainText(/elfdalian — övdalska/i)
  await expect(header.getByText('Results', { exact: true })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  for (const text of await header.locator('h2, button, .results-header__label').all()) {
    await expect(text).toHaveCSS('font-family', /Coiny/)
  }

  for (const width of [320, 390, 768, 1151, 1152, 1153, 1280, 1920, 2560]) {
    await page.setViewportSize({ width, height: 1080 })
    await page.evaluate(async () => { for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame) })
    const geometry = await header.evaluate((element) => {
      const heading = element.querySelector('h2')!
      const title = heading.getBoundingClientRect()
      const actions = element.querySelector('.results-header__actions')!.getBoundingClientRect()
      const label = element.querySelector('.results-header__label')!.getBoundingClientRect()
      const bounds = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        title, actions, label, bounds,
        borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
        overflowing: heading.scrollWidth > heading.clientWidth + 1,
      }
    })
    expect(geometry.borders).toEqual(['0px', '0px', '1px', '0px'])
    expect(geometry.overflowing).toBe(false)
    expect(geometry.actions.right).toBeLessThanOrEqual(geometry.bounds.right + 1)
    expect(geometry.label.top).toBeGreaterThanOrEqual(Math.max(geometry.title.bottom, geometry.actions.bottom))
    if (width <= 390) expect(geometry.actions.top).toBeGreaterThanOrEqual(geometry.title.bottom)
    if (width >= 1920) expect(geometry.actions.left).toBeGreaterThanOrEqual(geometry.title.right)
  }

  await header.getByRole('button', { name: 'crafting sheet', exact: true }).click()
  await page.getByRole('button', { name: 'Back to elfdalian crafts', exact: true }).click()
  await header.getByRole('button', { name: 'compare languages', exact: true }).click()
  await page.getByRole('button', { name: 'Back to crafts', exact: true }).click()
  await expect(header.getByRole('heading')).toContainText(/elfdalian — övdalska/i)
})
