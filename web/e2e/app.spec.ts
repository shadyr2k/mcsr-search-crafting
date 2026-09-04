import { expect, test } from '@playwright/test'

async function addStickSet(page: import('@playwright/test').Page, inventoryItem?: string) {
  await page.getByRole('button', { name: 'Add item set' }).click()
  await page.getByRole('searchbox', { name: 'Search Goals' }).fill('stick')
  await page.getByRole('checkbox', { name: 'Stick minecraft:stick' }).check()
  if (inventoryItem) {
    const inventory = page.getByRole('searchbox', { name: 'Search Inventory' })
    await inventory.fill(inventoryItem)
    await page.getByRole('checkbox', { name: 'Oak Planks minecraft:oak_planks' }).check()
  }
  await page.getByRole('switch', { name: 'Crafting grid size' }).uncheck()
  await page.getByRole('button', { name: 'Save item set' }).click()
}

test('persists independent saved item sets and excludes disabled rows', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'MCSR Search Crafting' })).toBeVisible()

  await addStickSet(page, 'oak planks')
  await expect(page.getByRole('article', { name: 'Item set 1' })).toBeVisible()
  await expect(page.getByText('English')).toBeVisible()

  await addStickSet(page)
  await expect(page.getByRole('article', { name: 'Item set 2' })).toBeVisible()
  await expect(page.getByText('No viable search')).toBeVisible()

  await page.getByRole('checkbox', { name: 'Enable item set 2' }).uncheck()
  await expect(page.getByText('Disabled')).toBeVisible()
  await page.reload()

  await expect(page.getByRole('article', { name: 'Item set 1' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Item set 2' }).getByRole('checkbox', { name: 'Enable item set 2' })).not.toBeChecked()
  await expect(page.getByText('2×2')).toHaveCount(2)
})

test('stacks the three workspace columns on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 1000 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Add item set' })).toBeVisible()
  const columnCount = await page.locator('.workspace-grid').evaluate((element) => (
    getComputedStyle(element).gridTemplateColumns.split(' ').length
  ))
  expect(columnCount).toBe(1)
})
