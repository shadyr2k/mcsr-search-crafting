import { expect, test } from '@playwright/test'

test.use({ hasTouch: true, isMobile: true, viewport: { width: 320, height: 850 } })

test('selects dropdown items with a tap in the editor and simulator', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add item set' }).tap()
  const goals = page.getByRole('searchbox', { name: 'Search Goals' })
  await goals.fill('stick')
  await page.getByRole('button', { name: 'Stick', exact: true }).tap()
  await expect(page.getByRole('button', { name: 'Remove Stick', exact: true })).toBeVisible()
  await expect(goals).toBeFocused()
  await page.getByRole('button', { name: 'Close item set editor' }).tap()
  await page.getByRole('button', { name: 'recipe book sim' }).tap()
  const inventory = page.getByRole('searchbox', { name: 'Search simulator inventory' })
  await inventory.fill('diamond')
  await page.getByRole('button', { name: 'Diamond', exact: true }).tap()
  await expect(page.getByRole('button', { name: 'Remove Diamond', exact: true })).toBeVisible()
  await expect(inventory).toBeFocused()
  const language = page.getByRole('combobox', { name: 'Simulator language' })
  await language.tap()
  await page.getByRole('option', { name: 'german - deutsch (deutschland)' }).tap()
  await expect(language).toHaveValue('german (germany) - deutsch (deutschland)')
})

test('scrolls an item dropdown without selecting an option', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add item set' }).tap()
  await page.getByRole('searchbox', { name: 'Search Goals' }).tap()
  const results = page.getByRole('list', { name: 'Goals results' })
  await expect.poll(() => results.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
  await results.hover()
  await page.mouse.wheel(0, 260)

  await expect.poll(() => results.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await expect(page.getByRole('region', { name: 'Goals selected items' })).toContainText('none selected')
})

test('keeps the theme menu inside small viewports', async ({ page }) => {
  await page.goto('/')
  for (const width of [320, 375, 608]) {
    await page.setViewportSize({ width, height: 850 })
    await page.getByRole('button', { name: 'Choose color theme' }).tap()
    const menu = page.getByRole('menu', { name: 'Color themes' })
    const bounds = await menu.boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
    await menu.getByRole('menuitemradio', { name: 'Select blue theme' }).tap()
    await expect(menu).toHaveCount(0)
  }
})

test('opens the narrow language list only from its search field and keeps the selected language visible', async ({ page }) => {
  await page.goto('/')
  const choices = page.getByRole('region', { name: 'Language choices' })
  const search = page.getByRole('searchbox', { name: 'Search languages' })

  await expect(page.getByRole('region', { name: 'Selected language' })).toContainText('english - english (united states)')
  await expect(choices).toHaveCount(0)
  await search.tap()
  await expect(choices).toBeVisible()
  await choices.getByRole('button', { name: 'german - deutsch (deutschland)' }).tap()
  await expect(choices).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Selected language' })).toContainText('german - deutsch (deutschland)')
})

test('switches to other crafts without widening the mobile page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Show all crafts for item set 1' }).tap()
  const row = page.getByRole('region', { name: 'Calculated searches for item set 1' })
  const category = row.getByRole('group', { name: 'Regular craft category' })
  for (const width of [320, 375, 608]) {
    await page.setViewportSize({ width, height: 850 })
    for (const name of ['other', 'junkless']) {
      await category.getByRole('button', { name, exact: true }).tap()
      await expect.poll(() => page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      }))).toEqual({ page: width, viewport: width })
    }
  }
})
