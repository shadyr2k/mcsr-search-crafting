import { expect, test } from '@playwright/test'

test('action buttons share segmented-control typography and page navigation keeps the title font', async ({ page }) => {
  await page.goto('/')
  for (const destination of ['Add item set', 'craft lookup', 'recipe book sim', 'settings', 'crafting sheet', 'compare languages']) {
    if (destination === 'crafting sheet' || destination === 'compare languages') {
      await page.getByRole('button', { name: 'search crafting', exact: true }).click()
    }
    await page.getByRole('button', { name: destination, exact: true }).click()
    await page.evaluate(() => document.fonts.ready)
    const mismatches = await page.locator('.app-shell').evaluate(shell => [...shell.querySelectorAll('button')]
      .filter(button => button.checkVisibility() && !button.closest('.app-header') && button.textContent?.trim())
      .flatMap(button => {
        const titleFont = button.matches('.page-navigation, .title-font-action')
        const style = getComputedStyle(button)
        return style.fontFamily.includes(titleFont ? 'Coiny' : 'Figtree') && style.fontWeight === (titleFont ? '400' : '850')
          ? [] : [`${button.textContent?.trim()}: ${style.fontFamily} ${style.fontWeight}`]
      }))
    expect(mismatches, destination).toEqual([])
    if (destination === 'Add item set') await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  }
})
