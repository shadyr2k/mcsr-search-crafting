import { expect, test } from '@playwright/test'

test('keeps cached language scores for search settings and clears them for junk settings', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mcsr.language-score-cache.v1', JSON.stringify({
    schemaVersion: 1,
    entryScores: { saved: { en_us: 8 } },
  })))
  await page.goto('/')
  await page.getByRole('button', { name: 'settings' }).click()
  await expect(page.getByRole('heading', { name: 'scoring settings' })).toBeVisible()

  const freeCharacters = page.getByRole('spinbutton', { name: /free initial characters/i })
  const characterPenalty = page.locator('input[aria-describedby="additionalCharacterPenalty-description"]')
  await freeCharacters.fill('5')
  await expect(characterPenalty).toBeDisabled()
  await freeCharacters.fill('2')
  await expect(characterPenalty).toBeEnabled()
  await characterPenalty.fill('1.25')
  await page.getByRole('button', { name: 'save settings' }).click()
  await expect(page.getByRole('status')).toHaveText('settings saved')

  await expect.poll(() => page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem('mcsr.app-settings.v1') ?? '{}') as { scoring?: { additionalCharacterPenalty?: number } }
    return settings.scoring?.additionalCharacterPenalty
  })).toBe(1.25)
  expect(await page.evaluate(() => {
    const cached = JSON.parse(localStorage.getItem('mcsr.language-score-cache.v1') ?? '{}') as { entryScores?: Record<string, unknown> }
    return cached.entryScores?.saved ?? null
  })).toEqual({ en_us: 8 })

  await page.getByRole('spinbutton', { name: /junk item penalty/i }).fill('1.25')
  await page.getByRole('button', { name: 'save settings' }).click()
  await expect(page.getByRole('status')).toHaveText('settings saved')
  await expect.poll(() => page.evaluate(() => {
    const cached = JSON.parse(localStorage.getItem('mcsr.language-score-cache.v1') ?? '{}') as { entryScores?: Record<string, unknown> }
    return cached.entryScores?.saved ?? null
  })).toBeNull()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mcsr.app-settings.v1') ?? '{}'))).toMatchObject({
    schemaVersion: 1,
    scoring: { freeInitialCharacters: 2, additionalCharacterPenalty: 1.25, junkItemPenalty: 1.25 },
    catifyItems: false,
  })

  const catifyItems = page.getByRole('switch', { name: 'catify items' })
  await expect(catifyItems).toBeEnabled()
  await catifyItems.check()
  await page.getByRole('button', { name: 'save settings' }).click()

  await expect.poll(() => page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem('mcsr.app-settings.v1') ?? '{}') as { catifyItems?: boolean }
    return settings.catifyItems
  })).toBe(true)
  await page.getByRole('button', { name: 'Choose Minecraft version' }).click()
  await page.getByRole('menuitemradio', { name: 'Select Minecraft 26.1.2' }).click()
  await expect(catifyItems).toBeChecked()
})
