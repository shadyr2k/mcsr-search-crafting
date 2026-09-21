import { expect, test } from '@playwright/test'

test('clears cached language scores for every calculation setting', async ({ page }) => {
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
  await expect.poll(() => page.evaluate(() => {
    const cached = JSON.parse(localStorage.getItem('mcsr.language-score-cache.v1') ?? '{}') as { entryScores?: Record<string, unknown> }
    return cached.entryScores?.saved ?? null
  })).toBeNull()

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
  })

  await page.evaluate(() => localStorage.setItem('mcsr.language-score-cache.v1', JSON.stringify({
    schemaVersion: 1,
    entryScores: { idSearch: { en_us: 4 } },
  })))
  const itemIdSearch = page.getByRole('switch', { name: 'item ID search' })
  await itemIdSearch.click()
  await expect(itemIdSearch).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'save settings' }).click()
  await expect(page.getByRole('status')).toHaveText('settings saved')
  await expect.poll(() => page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem('mcsr.app-settings.v1') ?? '{}') as { itemIdSearch?: boolean }
    return settings.itemIdSearch
  })).toBe(true)
  await expect.poll(() => page.evaluate(() => {
    const cached = JSON.parse(localStorage.getItem('mcsr.language-score-cache.v1') ?? '{}') as { entryScores?: Record<string, unknown> }
    return cached.entryScores?.idSearch ?? null
  })).toBeNull()
})
