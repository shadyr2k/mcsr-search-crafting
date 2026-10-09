import { expect, test, type Locator } from '@playwright/test'

async function expectPhysicalProportions(visual: Locator) {
  const geometry = await visual.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const board = element.querySelector('.keyboard-visual__board')!.getBoundingClientRect()
    const mouse = element.querySelector('.keyboard-visual__mouse')!.getBoundingClientRect()
    const keys = [...element.querySelectorAll('.keyboard-visual__key')].map(key => key.getBoundingClientRect())
    const regularKeys = [...element.querySelectorAll('.keyboard-visual__board [data-key-units="1"]')].map(key => key.getBoundingClientRect())
    return {
      // CSS rounds each of the six row heights to fractional layout pixels.
      boardHeightError: Math.abs(board.height - bounds.width * .3253125),
      mouseRatio: mouse.width / mouse.height,
      completeHeightError: Math.abs(bounds.height - board.height),
      width: bounds.width,
      maximum: 42 * parseFloat(getComputedStyle(document.documentElement).fontSize),
      boardLeft: board.left - bounds.left,
      rightGap: bounds.right - mouse.right,
      escapedKeys: keys.filter(key => key.left < bounds.left - 1 || key.right > bounds.right + 1 || key.top < bounds.top - 1 || key.bottom > bounds.bottom + 1).length,
      regularKeyCount: regularKeys.length,
      squareDeviation: Math.max(...regularKeys.map(key => Math.abs(key.width - key.height))),
    }
  })
  expect(geometry.regularKeyCount).toBeGreaterThan(60)
  expect(geometry.squareDeviation).toBeLessThan(.1)
  expect(geometry.boardHeightError).toBeLessThan(.25)
  expect(geometry.mouseRatio).toBeCloseTo(.7, 2)
  expect(geometry.completeHeightError).toBeLessThan(.1)
  expect(geometry.width).toBeLessThanOrEqual(geometry.maximum + 1)
  expect(Math.abs(geometry.boardLeft)).toBeLessThan(1)
  expect(Math.abs(geometry.rightGap)).toBeLessThan(1)
  expect(geometry.escapedKeys).toBe(0)
}

test('craft playback keeps the physical keyboard proportions and leaves excess width on the right', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'crafting sheet', exact: true }).click()
  await page.getByRole('button', { name: 'Expand item set 1', exact: true }).click()
  const visual = page.locator('.keyboard-playback .keyboard-visual').first()
  await expect(visual).toBeVisible()
  for (const width of [...new Set([...Array.from({ length: 281 }, (_, index) => 320 + index * 8), 390, 1151, 1153])]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1080 })
    await expectPhysicalProportions(visual)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    if (width === 390 || width === 1920) await visual.screenshot({ path: testInfo.outputPath(`keyboard-${width}.png`), animations: 'disabled' })
  }

  // Exercise available panel widths independently of the craft sheet's columns.
  const playback = page.locator('.keyboard-playback').first()
  for (const width of [240, 280, 320, 400, 480, 640, 672, 800, 1200]) {
    await playback.evaluate((element, availableWidth) => { element.style.width = `${availableWidth}px` }, width)
    await expectPhysicalProportions(visual)
    const placement = await visual.evaluate((element) => {
      const outer = element.parentElement!.getBoundingClientRect()
      const bounds = element.getBoundingClientRect()
      return { left: bounds.left - outer.left, blank: outer.right - bounds.right }
    })
    expect(Math.abs(placement.left)).toBeLessThan(1)
    expect(placement.blank).toBeCloseTo(Math.max(0, width - 672), 0)
  }
})

test('rebinding keeps the same keyboard proportions and usable keys in its small-screen scroller', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'settings', exact: true }).click()
  const visual = page.locator('.keyboard-visual--editable')
  for (const width of [320, 390, 768, 1280, 2560]) {
    await page.setViewportSize({ width, height: 900 })
    await expectPhysicalProportions(visual)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Rebind x', exact: true }).click()
  await page.getByRole('textbox', { name: 'New output for x' }).fill('s')
  await expect(page.getByRole('button', { name: 'Rebind x → s', exact: true })).toBeVisible()
})
