import { expect, test } from '@playwright/test'

test('scores ranked results, excludes a disabled set, and reloads the ordered workspace', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'MCSR Search Crafting' })).toBeVisible()
  await expect(page.getByLabel('Inventory name')).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Inventory name')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('searchbox', { name: 'Search inventory items' })).toBeFocused()

  await page.getByRole('searchbox', { name: 'Search inventory items' }).fill('oak planks')
  await page.getByRole('checkbox', { name: 'Oak Planks minecraft:oak_planks' }).check()
  await page.getByRole('searchbox', { name: 'Search inventory items' }).fill('stick')
  await page.getByRole('checkbox', { name: 'Stick minecraft:stick' }).check()
  await expect(page.getByText('2 selected items')).toBeVisible()

  await page.getByRole('button', { name: 'Add target set' }).click()
  const oakSearch = page.getByRole('searchbox', { name: 'Search targets for set 1' })
  await oakSearch.fill('oak slab')
  await page.getByRole('button', { name: 'Add Oak Slab', exact: true }).click()
  await oakSearch.fill('oak stairs')
  await page.getByRole('button', { name: 'Add Oak Stairs', exact: true }).click()
  await page.getByRole('radio', { name: '3x3 grid' }).check()

  const single = page.getByRole('region', { name: 'Single-query results for set 1' })
  await expect(single.getByRole('heading', { name: 'Best single-query craft' })).toBeVisible()
  await expect(single.locator('p').filter({ hasText: 'Query:' }).locator('code')).toHaveText('ak s')
  await expect(single.getByText(
    'Targets: Oak Slab (minecraft:oak_slab), Oak Stairs (minecraft:oak_stairs)',
  )).toBeVisible()
  await expect(single.getByText('Total score').locator('..').getByText('4.5', { exact: true })).toBeVisible()
  await expect(page.getByText('Overlap supplies this set’s aggregate contribution.')).toBeVisible()

  const overlap = page.getByRole('region', { name: 'Overlap results for set 1' })
  await expect(overlap.getByRole('heading', { name: 'Best overlap craft' })).toBeVisible()
  await expect(overlap.getByText(/Sequence:\s+sl\s+→\s+st/)).toBeVisible()
  await expect(overlap.locator('.result-step h6 code')).toHaveText([' sl', ' st'])
  await expect(overlap.getByText('New targets: Oak Slab (minecraft:oak_slab)')).toBeVisible()
  await expect(overlap.getByText('New targets: Oak Stairs (minecraft:oak_stairs)')).toBeVisible()
  await expect(overlap.getByText('Total score').locator('..').getByText('2', { exact: true })).toBeVisible()
  await expect(overlap.getByText('No complete overlap sequence.')).toHaveCount(0)

  const aggregate = page.getByText(/^Aggregate score: /)
  await expect(aggregate).toHaveText('Aggregate score: 2')

  await page.getByRole('button', { name: 'Add target set' }).click()
  const stickSearch = page.getByRole('searchbox', { name: 'Search targets for set 2' })
  await stickSearch.fill('stick')
  await page.getByRole('button', { name: 'Add Stick', exact: true }).click()
  await page.getByRole('article', { name: 'Target set 2' }).getByRole('radio', { name: '2x2 grid' }).check()
  await page.getByRole('button', { name: 'Move set 2 up' }).click()

  const firstEditor = page.getByRole('article', { name: 'Target set 1' })
  const secondEditor = page.getByRole('article', { name: 'Target set 2' })
  await expect(firstEditor.getByText('Stick', { exact: true })).toBeVisible()
  await expect(secondEditor.getByText('Oak Slab', { exact: true })).toBeVisible()
  await expect(secondEditor.getByText('Oak Stairs', { exact: true })).toBeVisible()

  await secondEditor.getByRole('checkbox', { name: 'Enable set 2' }).uncheck()
  await expect(aggregate).toHaveText('Aggregate score: 0')
  await expect(page.getByRole('region', { name: 'Single-query results for set 2' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Overlap results for set 2' })).toHaveCount(0)

  await page.reload()

  const reloadedFirst = page.getByRole('article', { name: 'Target set 1' })
  const reloadedSecond = page.getByRole('article', { name: 'Target set 2' })
  await expect(reloadedFirst.getByText('Stick', { exact: true })).toBeVisible()
  await expect(reloadedFirst.getByRole('checkbox', { name: 'Enable set 1' })).toBeChecked()
  await expect(reloadedFirst.getByRole('radio', { name: '2x2 grid' })).toBeChecked()
  await expect(reloadedSecond.getByText('Oak Slab', { exact: true })).toBeVisible()
  await expect(reloadedSecond.getByText('Oak Stairs', { exact: true })).toBeVisible()
  await expect(reloadedSecond.getByRole('checkbox', { name: 'Enable set 2' })).not.toBeChecked()
  await expect(reloadedSecond.getByRole('radio', { name: '3x3 grid' })).toBeChecked()
})

test('renders an exact Unicode source line and UTF-16 matched span', async ({ page }) => {
  const items = {
    schema_version: 1,
    items: {
      'fixture:base': {
        name: 'Base Ingredient',
        search_lines: [{ source: 'name', text: 'Base Ingredient' }],
        generation_method: 'fixture',
        confidence: 'source_reproduced',
      },
      'fixture:unicode-target': {
        name: 'Unicode Target',
        search_lines: [{ source: 'name', text: '😀İx' }],
        generation_method: 'fixture',
        confidence: 'source_reproduced',
      },
      'fixture:unicode-junk': {
        name: 'Unicode Junk',
        search_lines: [{ source: 'name', text: '😀İ' }],
        generation_method: 'fixture',
        confidence: 'source_reproduced',
      },
    },
  }
  const recipes = {
    schema_version: 1,
    recipes: ['unicode-target', 'unicode-junk'].map((name) => ({
      id: `fixture:${name}`,
      type: 'minecraft:crafting_shapeless',
      output_item_id: `fixture:${name}`,
      output_count: 1,
      ingredient_slots: [{ accepted_items: ['fixture:base'] }],
      width: 1,
      height: 1,
      fits_2x2: true,
      fits_3x3: true,
    })),
  }

  await page.route('**/data/search-items.json', (route) => route.fulfill({ json: items }))
  await page.route('**/data/crafting-recipes.json', (route) => route.fulfill({ json: recipes }))
  await page.goto('/')

  await page.getByRole('searchbox', { name: 'Search inventory items' }).fill('base ingredient')
  await page.getByRole('checkbox', { name: 'Base Ingredient fixture:base' }).check()
  await page.getByRole('button', { name: 'Add target set' }).click()
  await page.getByRole('searchbox', { name: 'Search targets for set 1' }).fill('unicode target')
  await page.getByRole('button', { name: 'Add Unicode Target', exact: true }).click()

  const single = page.getByRole('region', { name: 'Single-query results for set 1' })
  await expect(single.getByRole('heading', { name: 'Best single-query craft' })).toBeVisible()
  await expect(single.locator('p').filter({ hasText: 'Query:' }).locator('code')).toHaveText('x')
  await expect(single.getByText('name · fixture:unicode-target · span 3–4')).toBeVisible()
  const sourceLine = single.locator('.search-line').filter({ hasText: '😀İx' })
  await expect(sourceLine).toHaveText('😀İx')
  await expect(sourceLine.locator('mark')).toHaveText('x')
})
