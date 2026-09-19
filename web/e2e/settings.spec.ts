import { expect, test } from '@playwright/test'

test('saves score settings and clears the language score cache', async ({ page }) => {
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
  await page.getByRole('spinbutton', { name: /junk item penalty/i }).fill('1.25')
  await page.getByRole('button', { name: 'save settings' }).click()

  await expect.poll(() => page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem('mcsr.app-settings.v1') ?? '{}') as { scoring?: { junkItemPenalty?: number } }
    return settings.scoring?.junkItemPenalty
  })).toBe(1.25)
  await expect.poll(() => page.evaluate(() => {
    const cached = JSON.parse(localStorage.getItem('mcsr.language-score-cache.v1') ?? '{}') as { entryScores?: Record<string, unknown> }
    return cached.entryScores?.saved ?? null
  })).toBeNull()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mcsr.app-settings.v1') ?? '{}'))).toMatchObject({
    schemaVersion: 1,
    scoring: { freeInitialCharacters: 2, junkItemPenalty: 1.25 },
    catifyItems: false,
  })

  await page.getByRole('button', { name: 'Choose Minecraft version' }).click()
  await page.getByRole('menuitemradio', { name: 'Select Minecraft 26.1.2' }).click()
  const catifyItems = page.getByRole('checkbox', { name: 'catify items' })
  await expect(catifyItems).toBeEnabled()
  await catifyItems.check()
  await page.getByRole('button', { name: 'save settings' }).click()

  await expect.poll(() => page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem('mcsr.app-settings.v1') ?? '{}') as { catifyItems?: boolean }
    return settings.catifyItems
  })).toBe(true)
})
