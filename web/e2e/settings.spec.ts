import { expect, test } from '@playwright/test'

test('clears cached language scores for every calculation setting', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mcsr.language-score-cache.v1', JSON.stringify({
    schemaVersion: 1,
    entryScores: { saved: { en_us: 8 } },
  })))
  await page.goto('/')
  await page.getByRole('button', { name: 'settings' }).click()
  await expect(page.getByRole('heading', { name: 'site settings' })).toBeVisible()

  const freeCharacters = page.getByRole('textbox', { name: /free initial characters/i })
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

  await page.getByRole('textbox', { name: /junk item penalty/i }).fill('1.25')
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

  await page.evaluate(() => localStorage.setItem('mcsr.language-score-cache.v1', JSON.stringify({
    schemaVersion: 1,
    entryScores: { display: { en_us: 4 } },
  })))
  const hideCraftNumbers = page.getByRole('switch', { name: 'hide craft numbers by default' })
  const compactLayout = page.getByRole('switch', { name: 'compact layout' })
  const removeAnimations = page.getByRole('switch', { name: 'remove animations' })
  await hideCraftNumbers.click()
  await compactLayout.click()
  await removeAnimations.click()
  const activeThumbTransform = await removeAnimations.evaluate((switchControl) => getComputedStyle(switchControl, '::after').transform)
  expect(activeThumbTransform).not.toBe('none')
  await page.getByRole('button', { name: 'save settings' }).click()
  await expect(page.getByRole('status')).toHaveText('settings saved')
  await expect.poll(() => page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem('mcsr.app-settings.v1') ?? '{}') as {
      hideNumberCraftsByDefault?: boolean
      compactLayout?: boolean
      removeAnimations?: boolean
    }
    return settings
  })).toMatchObject({ hideNumberCraftsByDefault: true, compactLayout: true, removeAnimations: true })
  await expect(page.locator('.app-shell')).toHaveClass(/app-shell--compact-layout/)
  await expect(page.locator('.app-shell')).toHaveClass(/app-shell--remove-animations/)
  await expect.poll(() => page.evaluate(() => {
    const cached = JSON.parse(localStorage.getItem('mcsr.language-score-cache.v1') ?? '{}') as { entryScores?: Record<string, unknown> }
    return cached.entryScores?.display?.en_us ?? null
  })).toBe(4)
})

test('uses compact option controls and keeps the editor close button aligned', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'settings' }).click()
  await page.getByRole('switch', { name: 'compact layout' }).click()
  await page.getByRole('button', { name: 'save settings' }).click()
  await page.getByRole('button', { name: 'search crafting' }).click()
  const themeSwitch = page.getByRole('switch', { name: 'Switch to dark mode' })
  await expect(themeSwitch).toBeVisible()
  await themeSwitch.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Edit item set 1' }).click()

  const editor = page.locator('.item-set-editor')
  await expect(editor.getByRole('group', { name: 'Crafting grid size' })).toBeVisible()
  await expect(editor.getByRole('group', { name: 'Retain item order' })).toBeVisible()
  await expect(editor.getByRole('switch', { name: 'Crafting grid size' })).toHaveCount(0)
  await expect(editor.getByRole('switch', { name: 'Retain item order' })).toHaveCount(0)
  await expect(editor.getByRole('group', { name: 'Crafting grid size' }).locator('button[aria-pressed="true"]')).toHaveCount(1)

  const closeWithinEditor = await editor.evaluate((element) => {
    const editorBounds = element.getBoundingClientRect()
    const closeBounds = element.querySelector<HTMLElement>('.item-set-editor__dismiss')!.getBoundingClientRect()
    return closeBounds.left >= editorBounds.left
      && closeBounds.right <= editorBounds.right
      && closeBounds.top >= editorBounds.top
      && closeBounds.bottom <= editorBounds.bottom
  })
  expect(closeWithinEditor).toBe(true)
})
