import { expect, test } from '@playwright/test'

for (const locale of ['en_us', 'de_de']) {
  test(`cached number crafts retain highlighted tooltips in ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await page.addInitScript((selectedLocale) => {
      localStorage.setItem('mcsr.target-workspace.v1', JSON.stringify({ schemaVersion: 2, entries: [{
        id: 'armor', targetIds: ['minecraft:iron_chestplate'], inventoryItemIds: ['minecraft:iron_ingot'],
        enabled: true, gridSize: 3, order: 0,
      }] }))
      localStorage.setItem('mcsr.language-preferences.v1', JSON.stringify({
        schemaVersion: 1, selectedLocale, enabledBannedLocales: [],
      }))
    }, locale)
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Show all crafts for item set 1' })).toBeVisible()
    // Wait for the real optimizer to persist its result, then verify the compact
    // cache contains the numeric craft but deliberately has no tooltip evidence.
    await expect.poll(() => page.evaluate(async (selectedLocale) => {
      const records = await new Promise<Array<{ locale: string; outcome: { rankedSearches: Array<{ steps: Array<{ query: string; explanations: unknown[] }> }> } }>>((resolve, reject) => {
        const request = indexedDB.open('mcsr-language-craft-cache', 1)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const read = db.transaction('outcomes').objectStore('outcomes').getAll()
          read.onsuccess = () => { db.close(); resolve(read.result) }
          read.onerror = () => { db.close(); reject(read.error) }
        }
      })
      return records.some((record) => record.locale === selectedLocale
        && record.outcome.rankedSearches.some((craft) => craft.steps.some((step) => step.query === '6' && step.explanations.length === 0)))
    }, locale)).toBe(true)

    await page.reload()
    await page.getByRole('button', { name: 'Show all crafts for item set 1' }).click()
    const craft = page.getByRole('region', { name: 'Regular crafts' }).getByRole('listitem', { name: 'Regular craft: 6', exact: true })
    await craft.getByRole('button', { name: 'Show why Regular craft: 6', exact: true }).click()
    const evidence = craft.locator('.match-evidence').first()
    await expect(evidence).toContainText(locale === 'de_de' ? 'Rüstung' : 'Armor')
    await expect(evidence.locator('mark')).toHaveText('6')
    for (const width of [320, 768, 1280, 2560]) {
      await page.setViewportSize({ width, height: 720 })
      await expect(evidence).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      const bounds = await craft.boundingBox()
      const tooltip = await evidence.boundingBox()
      expect(tooltip!.x).toBeGreaterThanOrEqual(bounds!.x - 1)
      expect(tooltip!.x + tooltip!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1)
    }
  })
}
