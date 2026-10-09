import { expect, test } from '@playwright/test'

test('sheet rows animate closed before removing their content and keep header actions together', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await page.getByRole('button', { name: 'crafting sheet', exact: true }).click()
  await page.getByRole('button', { name: 'Expand item set 1', exact: true }).click()
  const entry = page.locator('.crafting-sheet__entry').first()
  await expect(entry.locator('.keyboard-visual')).toBeVisible()
  const closing = await entry.evaluate(async element => {
    const toggle = element.querySelector<HTMLButtonElement>('[aria-expanded="true"]')!
    const details = document.getElementById(toggle.getAttribute('aria-controls')!)!
    toggle.click()
    await new Promise(requestAnimationFrame)
    await new Promise(requestAnimationFrame)
    const animation = details.getAnimations().find(animation => (animation as CSSAnimation).animationName === 'crafting-sheet-details-conceal')!
    if (!animation) return null
    animation.pause()
    animation.currentTime = 80
    const result = { opacity: Number(getComputedStyle(details).opacity), inert: details.inert, retained: !!details.querySelector('.keyboard-visual') }
    animation.finish()
    return result
  })
  expect(closing).not.toBeNull()
  expect(closing!.retained).toBe(true)
  expect(closing!.inert).toBe(true)
  expect(closing!.opacity).toBeGreaterThan(0)
  expect(closing!.opacity).toBeLessThan(1)
  await expect(entry.locator('.keyboard-visual')).toHaveCount(0)
  for (const width of [320, 390, 511, 512, 513, 1151, 1152, 1153, 1920, 2560]) {
    await page.setViewportSize({ width, height: 1080 })
    const actions = await page.locator('.crafting-sheet__page-actions').evaluate(element => {
      const box = element.getBoundingClientRect()
      const [back, reset] = [...element.querySelectorAll('button')].map(button => ({ rect: button.getBoundingClientRect(), font: getComputedStyle(button).fontFamily }))
      return { delta: Math.abs((back.rect.top + back.rect.bottom - reset.rect.top - reset.rect.bottom) / 2), fits: back.rect.left >= box.left - 1 && reset.rect.right <= box.right + 1, fonts: [back.font, reset.font] }
    })
    expect(actions.delta, `${width}px`).toBeLessThan(1)
    expect(actions.fits, `${width}px`).toBe(true)
    expect(actions.fonts.every(font => font.includes('Coiny'))).toBe(true)
  }
})

for (const width of [390, 1440]) {
  test(`comparison setup and results hierarchy at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.getByRole('button', { name: 'compare languages', exact: true }).click()
    const setup = page.getByRole('region', { name: 'Comparison setup', exact: true })
    const results = page.getByRole('region', { name: 'Comparison results', exact: true })
    const heading = setup.getByRole('heading', { name: 'compare languages', exact: true })
    const back = setup.getByRole('button', { name: 'Back to crafts', exact: true })
    await expect(heading).toBeVisible()
    await expect(back).toBeVisible()
    const headingBounds = (await heading.boundingBox())!
    const backBounds = (await back.boundingBox())!
    expect(backBounds.x).toBeGreaterThanOrEqual(headingBounds.x + headingBounds.width)
    expect(Math.abs(headingBounds.y + headingBounds.height / 2 - backBounds.y - backBounds.height / 2)).toBeLessThan(1)
    await expect(setup.getByRole('combobox', { name: 'Language 1', exact: true })).toBeVisible()
    await expect(setup.getByRole('combobox', { name: 'Language 2', exact: true })).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Overall language comparison' })).toHaveCount(0)
    await setup.getByRole('button', { name: 'compare', exact: true }).click()
    const overview = setup.getByRole('complementary', { name: 'Overall language comparison' })
    await expect(overview).toBeVisible()
    await expect(results.getByRole('complementary', { name: 'Overall language comparison' })).toHaveCount(0)
    const compareBounds = await setup.getByRole('button', { name: 'compare', exact: true }).boundingBox()
    expect((await overview.boundingBox())!.y).toBeGreaterThanOrEqual(compareBounds!.y + compareBounds!.height)
    const scoresStack = await overview.locator('.language-comparison__score-box').evaluateAll(boxes => {
      const bounds = boxes.map(box => box.getBoundingClientRect())
      return bounds.every((box, index) => index === 0 || box.top >= bounds[index - 1].bottom - 1)
    })
    expect(scoresStack).toBe(true)
    await expect(results.locator('.language-comparison__item-set-row').first()).toBeVisible()
    const disclosure = await results.locator('.language-comparison__item-set-toggle').first().evaluate(button => {
      const heading = button.querySelector('.language-comparison__item-set-heading')!.getBoundingClientRect()
      const arrow = button.querySelector(':scope > span:last-child .arrow-sprite')!.getBoundingClientRect()
      return { besideHeading: arrow.left >= heading.right && arrow.top < heading.bottom && arrow.bottom > heading.top }
    })
    expect(disclosure.besideHeading).toBe(true)
    await page.evaluate(async () => {
      await document.fonts.ready
      await Promise.all([...document.images].map(image => image.decode().catch(() => {})))
      window.scrollTo(0, 0)
    })
    await expect(page).toHaveScreenshot(`comparison-${width}.png`, { animations: 'disabled', fullPage: true, maxDiffPixelRatio: .005 })
  })
}
