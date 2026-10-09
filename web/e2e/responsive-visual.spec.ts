import { expect, test } from '@playwright/test'

// A small visual baseline complements the exhaustive geometry sweep.
for (const [name, destination, width, height] of [
  ['mobile', 'search crafting', 320, 568],
  ['tablet', 'search crafting', 768, 1024],
  ['desktop', 'search crafting', 1440, 1000],
  ['short-laptop', 'recipe book sim', 1280, 720],
  ['large-desktop', 'crafting sheet', 1920, 1080],
] as const) {
  test(`responsive appearance: ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Add item set' })).toBeVisible()
    await expect(page.locator('.calculated-search-row__summary')).toHaveCount(7)
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' })
    await page.getByRole('button', { name: destination, exact: true }).click()
    if (destination === 'crafting sheet') await expect(page.locator('.crafting-sheet__status')).toHaveCount(0)
    await page.evaluate(async () => {
      await document.fonts.ready
      await Promise.all([...document.images].map((img) => img.decode().catch(() => {})))
      window.scrollTo(0, 0)
    })
    await expect(page).toHaveScreenshot(`${name}.png`, {
      animations: 'disabled', maxDiffPixelRatio: .005,
      // Background scores arrive independently of layout; don't snapshot timing.
      mask: [page.locator('.language-selector__score')], maskColor: '#f3c4ce',
    })
  })
}

for (const width of [320, 1920]) {
  test(`responsive result controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1080 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.getByRole('button', { name: 'Show all crafts for item set 2' }).click()
    const card = page.getByRole('region', { name: 'Calculated searches for item set 2', exact: true })
    const filter = card.getByRole('group', { name: 'Number crafts', exact: true })
    await filter.getByRole('button', { name: 'hide', exact: true }).click()
    await expect(filter.getByRole('button', { name: 'hide', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await filter.getByRole('button', { name: 'show', exact: true }).focus()
    await page.keyboard.press('Space')
    await expect(filter.getByRole('button', { name: 'show', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.evaluate(async () => {
      await document.fonts.ready
      await Promise.all([...document.images].map((img) => img.decode().catch(() => {})))
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    })
    await page.mouse.move(0, 0)
    // Keep the sticky site header from covering the card in its isolated image.
    await page.addStyleTag({ content: '.app-header { opacity: 0 !important; }' })
    await expect(card).toHaveScreenshot(`result-controls-${width}.png`, {
      animations: 'disabled',
    })
  })
}
