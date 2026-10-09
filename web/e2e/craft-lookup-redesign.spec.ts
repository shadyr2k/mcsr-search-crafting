import { expect, test, type Page } from '@playwright/test'

async function configureLookup(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'craft lookup', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'best languages', exact: true })).toBeVisible()
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' })
  await page.getByRole('button', { name: 'Add target items' }).click()
  await page.getByRole('searchbox', { name: 'Search Goals' }).fill('stick')
  await page.getByRole('button', { name: 'Stick', exact: true }).click()
  await page.getByRole('button', { name: 'Use inventory preset Overworld' }).click()
}

test('lookup rules, saved inventories and result filters preserve their workflows', async ({ page }) => {
  await configureLookup(page)
  const rules = page.getByRole('region', { name: 'Rules', exact: true })
  await rules.getByRole('button', { name: '3×3' }).click()
  await rules.getByRole('button', { name: 'enabled', exact: true }).click()
  await expect(rules.getByRole('button', { name: 'enabled', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Save as new', exact: true }).click()
  await page.getByRole('textbox', { name: 'New inventory name', exact: true }).fill('Lookup route')
  await page.getByRole('button', { name: 'Create saved inventory', exact: true }).click()
  const inventory = page.getByRole('region', { name: 'Inventory selected items', exact: true })
  const savedItemCount = await inventory.getByRole('button').count()
  await inventory.getByRole('button').first().click()
  await page.getByRole('combobox', { name: 'Saved inventory', exact: true }).selectOption('0')
  await expect(inventory.getByRole('button')).toHaveCount(savedItemCount)
  await page.getByRole('button', { name: 'Look up crafts', exact: true }).click()
  await expect(page.locator('.craft-lookup__language-list li').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.craft-lookup__languages > header > span')).toHaveCount(0, { timeout: 30_000 })
  await page.getByRole('searchbox', { name: 'find a language' }).fill('english')
  const rows = page.locator('.calculated-search-row--craft-lookup')
  expect(await rows.count()).toBeGreaterThan(0)
  for (const row of await rows.all()) await expect(row.locator('.craft-lookup__language-name')).toContainText('english')
  const activeFilter = page.locator('.craft-lookup__category-picker button[aria-pressed="true"]')
  await expect(activeFilter.locator('.craft-lookup__category-count')).toHaveText(String(await rows.count()))
  await expect(rows.first().locator('.craft-lookup__score')).toHaveAttribute('aria-label', /Best score: \d/)
  await rows.first().locator('.calculated-search-row__toggle').click()
  await expect(rows.first().locator('.craft-categories--open')).toBeVisible()
  await page.getByRole('searchbox', { name: 'find a language' }).fill('no-language-with-this-name')
  await expect(page.getByText(/No calculated language matches/)).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'craft lookup', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Saved inventory' }).locator('option[value="0"]')).toHaveText('Lookup route')
})

test('inline saved inventories remain contained and usable around responsive boundaries', async ({ page }) => {
  test.setTimeout(90_000)
  await configureLookup(page)
  await page.getByRole('button', { name: 'Save as new', exact: true }).click()
  await page.getByRole('textbox', { name: 'New inventory name', exact: true }).fill('A longer saved inventory name for the complete route')
  await page.getByRole('button', { name: 'Create saved inventory', exact: true }).click()
  await page.getByRole('button', { name: 'Rename saved inventory', exact: true }).click()
  const widths = new Set([...Array.from({ length: 281 }, (_, index) => 320 + index * 8), 390, 671, 673, 1151, 1153])
  for (const width of [...widths].sort((left, right) => left - right)) {
    await page.setViewportSize({ width, height: 720 })
    const issues = await page.locator('.item-set-editor__saved').evaluate(element => {
      const bounds = element.getBoundingClientRect()
      return [...element.querySelectorAll('input, select, button')].filter(control => {
        const box = control.getBoundingClientRect()
        return box.left < bounds.left - 1 || box.right > bounds.right + 1
      }).map(control => control.getAttribute('aria-label') ?? control.textContent)
    })
    expect(issues, `saved-inventory controls at ${width}px`).toEqual([])
  }
  await page.getByRole('button', { name: 'Save inventory name', exact: true }).click()
  await page.getByRole('button', { name: 'Delete saved inventory', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Saved inventory' }).locator('option[value="0"]')).toHaveCount(0)
})

for (const width of [390, 1440]) test(`lookup section hierarchy at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 })
  await configureLookup(page)
  if (width === 1440) await page.getByRole('switch', { name: 'Switch to dark mode' }).click()
  await page.getByRole('button', { name: 'Look up crafts', exact: true }).click()
  await expect(page.locator('.craft-lookup__language-list li').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.craft-lookup__languages > header > span')).toHaveCount(0, { timeout: 30_000 })
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})))
  })
  await page.addStyleTag({ content: '.app-header { opacity: 0 !important; }' })
  await expect(page.locator('.craft-lookup')).toHaveScreenshot(`lookup-${width}.png`, { animations: 'disabled' })
})
