import { expect, test } from '@playwright/test'

test('scores an explicit inventory target set and excludes it when disabled', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'MCSR Search Crafting' })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search inventory items' }).fill('oak planks')
  await page.getByRole('checkbox', { name: 'Oak Planks minecraft:oak_planks' }).check()
  await page.getByRole('searchbox', { name: 'Search inventory items' }).fill('stick')
  await page.getByRole('checkbox', { name: 'Stick minecraft:stick' }).check()
  await expect(page.getByText('2 selected items')).toBeVisible()

  await page.getByRole('button', { name: 'Add target set' }).click()
  const targetSearch = page.getByRole('searchbox', { name: 'Search targets for set 1' })
  await targetSearch.fill('oak slab')
  await page.getByRole('button', { name: 'Add Oak Slab', exact: true }).click()
  await targetSearch.fill('oak stairs')
  await page.getByRole('button', { name: 'Add Oak Stairs', exact: true }).click()
  await page.getByRole('radio', { name: '3x3 grid' }).check()

  const single = page.getByRole('region', { name: 'Single-query results for set 1' })
  const overlap = page.getByRole('region', { name: 'Overlap results for set 1' })
  await expect(single.getByRole('heading', { name: 'Best single-query craft' })).toBeVisible()
  await expect(overlap.getByRole('heading', { name: 'Best overlap craft' })).toBeVisible()

  const aggregate = page.getByText(/^Aggregate score: /)
  await expect(aggregate).not.toHaveText('Aggregate score: 0')

  await page.getByRole('checkbox', { name: 'Enable set 1' }).uncheck()
  await expect(aggregate).toHaveText('Aggregate score: 0')
  await expect(page.getByText('Enable a target set to include it in optimization.')).toBeVisible()
  await expect(single).toHaveCount(0)
  await expect(overlap).toHaveCount(0)
})
