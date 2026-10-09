import { expect, test, type Locator } from '@playwright/test'

async function boundedOverlay(menu: Locator, width: number) {
  await expect(menu).toBeVisible()
  const box = await menu.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(width)
  // A menu may extend down the scrolling document, but none of its controls
  // may be clipped horizontally. Playwright's real clicks below check reachability.
  expect(await menu.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
}

for (const viewport of [
  { width: 320, height: 568 }, { width: 844, height: 390 },
  { width: 768, height: 1024 }, { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]) {
  test(`responsive controls at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Add item set' })).toBeVisible()
    await page.getByRole('button', { name: 'Choose color theme' }).click()
    await boundedOverlay(page.getByRole('menu', { name: 'Color themes' }), viewport.width)
    await page.getByRole('menuitemradio', { name: 'Select blue theme' }).click()
    await page.getByRole('button', { name: 'Choose Minecraft version' }).click()
    await boundedOverlay(page.locator('.version-picker__menu'), viewport.width)
    await page.getByRole('menuitemradio', { name: 'Select Minecraft 1.16.1' }).click()

    await page.getByRole('button', { name: 'Add item set' }).click()
    await page.getByRole('button', { name: 'Add target items' }).click()
    await page.getByRole('searchbox', { name: 'Search Goals' }).fill('stick')
    await boundedOverlay(page.getByRole('list', { name: 'Goals results' }), viewport.width)
    await page.getByRole('button', { name: 'Stick', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Remove Stick', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Close item set editor' }).click()

    await page.getByRole('button', { name: 'recipe book sim', exact: true }).click()
    const language = page.getByRole('combobox', { name: 'Simulator language' })
    await language.click()
    await boundedOverlay(page.locator('.language-dropdown__menu'), viewport.width)
    await page.getByRole('option', { name: 'german - deutsch (deutschland)' }).click()
    // Locale selection loads a data package asynchronously; allow that work
    // to finish even while the CPU-heavy geometry sweep runs in another worker.
    await expect(language).toHaveValue('german (germany) - deutsch (deutschland)', { timeout: 15_000 })
    await page.getByRole('button', { name: 'settings', exact: true }).click()
    await page.getByRole('button', { name: 'save settings', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('settings saved')
  })
}
