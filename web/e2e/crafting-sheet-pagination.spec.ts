import { expect, test, type Page } from '@playwright/test'

async function openManyItemSets(page: Page, animated = false) {
  await page.emulateMedia({ reducedMotion: animated ? 'no-preference' : 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'crafting sheet', exact: true }).waitFor()
  await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('mcsr.target-workspace.v1')!)
    workspace.entries = Array.from({ length: 24 }, (_, index) => ({ ...workspace.entries[index === 10 ? 0 : index % workspace.entries.length], id: `paged-${index}`, order: index }))
    localStorage.setItem('mcsr.target-workspace.v1', JSON.stringify(workspace))
  })
  await page.reload()
  if (!animated) await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' })
  await page.getByRole('button', { name: 'crafting sheet', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Expand item set 1', exact: true })).toBeVisible()
}

test('opening, switching and closing editors never becomes the measured page-row height', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 })
  await openManyItemSets(page, true)
  const cards = page.locator('.crafting-sheet__entry')
  const capacities: number[] = []
  for (const height of [900, 1080, 1200]) {
    await page.setViewportSize({ width: 1920, height })
    await page.evaluate(async () => { for (let frame = 0; frame < 8; frame++) await new Promise(requestAnimationFrame) })
    const capacity = await cards.count()
    expect(capacity).toBeGreaterThan(4)
    capacities.push(capacity)
    await page.getByRole('button', { name: 'Expand item set 1', exact: true }).click()
    await expect(cards.first().locator('.keyboard-visual')).toBeVisible()
    await page.getByRole('button', { name: 'Expand item set 2', exact: true }).click()
    await expect.poll(() => cards.count()).toBe(capacity)
    await page.getByRole('button', { name: 'Collapse item set 2', exact: true }).click()
    await expect(cards.locator('.crafting-sheet__details--closing')).toHaveCount(0)
    await expect.poll(() => cards.count()).toBe(capacity)
  }
  expect(capacities[1]).toBeGreaterThan(capacities[0])
  expect(capacities[2]).toBeGreaterThanOrEqual(capacities[1])
  await page.getByRole('button', { name: 'Expand item set 1', exact: true }).click()
  await page.setViewportSize({ width: 1920, height: 900 })
  await expect.poll(() => cards.count()).toBe(capacities[0])
  await page.getByRole('button', { name: 'Expand item set 2', exact: true }).click()
  await expect.poll(() => cards.count()).toBe(capacities[0])
})

test('pages through every item set without horizontal scrolling at mobile, tablet and desktop sizes', async ({ page }) => {
  await openManyItemSets(page)
  for (const width of [320, 375, 768, 1024, 1152, 1153, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: width < 768 ? 740 : 1000 })
    const sets = page.getByRole('region', { name: 'Selected item sets' })
    const previous = sets.getByRole('button', { name: 'Previous item-set columns' })
    const next = sets.getByRole('button', { name: 'Next item-set columns' })
    await expect.poll(() => sets.locator('.crafting-sheet__set-columns').evaluate(element => {
      const styles = getComputedStyle(element)
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
      const expected = element.clientWidth >= rem * 40 + Number.parseFloat(styles.columnGap) ? 2 : 1
      return Number(styles.getPropertyValue('--crafting-sheet-visible-columns')) === expected
    })).toBe(true)
    while (await previous.count() && await previous.isEnabled()) await previous.click()
    if (width === 320 || width === 1920) {
      const hiddenHeader = await page.addStyleTag({ content: '.app-header { opacity: 0 !important; }' })
      await sets.screenshot({ path: test.info().outputPath(`sheet-pagination-${width}.png`) })
      await hiddenHeader.evaluate(element => element.remove())
    }
    const reached = new Set<string>()
    do {
      await page.evaluate(async () => { for (let frame = 0; frame < 5; frame++) await new Promise(requestAnimationFrame) })
      for (const label of await sets.locator('.crafting-sheet__entry-label').allTextContents()) reached.add(label)
      const violations = await sets.evaluate(element => {
        const columns = element.querySelector<HTMLElement>('.crafting-sheet__set-columns')!
        const rect = columns.getBoundingClientRect()
        return {
          pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
          columnOverflow: columns.scrollWidth > columns.clientWidth + 1,
          columnVerticalOverflow: columns.scrollHeight > columns.clientHeight + 1,
          escapedCards: [...columns.querySelectorAll('.crafting-sheet__entry')].some(card => {
            const bounds = card.getBoundingClientRect()
            return bounds.left < rect.left - 1 || bounds.right > rect.right + 1
          }),
        }
      })
      expect(violations, `width ${width}`).toEqual({ pageOverflow: false, columnOverflow: false, columnVerticalOverflow: false, escapedCards: false })
      if (!await next.count() || await next.isDisabled()) break
      await next.click()
    } while (true)
    expect(reached.size, `width ${width}`).toBe(24)
  }
})

test('changes between one and two columns exactly when two comfortable cards fit', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 720 })
  await openManyItemSets(page)
  const columns = page.locator('.crafting-sheet__set-columns')
  let narrow = 320
  let wide = 1024
  while (wide - narrow > 1) {
    const width = Math.floor((narrow + wide) / 2)
    await page.setViewportSize({ width, height: 720 })
    const fitsTwo = await columns.evaluate(element => {
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
      return element.clientWidth >= rem * 40 + Number.parseFloat(getComputedStyle(element).columnGap)
    })
    if (fitsTwo) wide = width
    else narrow = width
  }
  const breakpoint = wide
  for (const width of [breakpoint - 1, breakpoint, breakpoint + 1]) {
    await page.setViewportSize({ width, height: 720 })
    await expect.poll(() => columns.locator('.crafting-sheet__set-column').count()).toBe(width < breakpoint ? 1 : 2)
    expect(await columns.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  }
  await page.setViewportSize({ width: 320, height: 740 })
  await page.getByRole('button', { name: 'Next item-set columns' }).click()
  const entry = page.getByRole('region', { name: 'item set 11', exact: true })
  await entry.getByRole('button', { name: 'Expand item set 11' }).click()
  const queryInput = entry.getByRole('searchbox', { name: /Craft query for/ }).first()
  await expect(queryInput).toBeVisible()
  await queryInput.scrollIntoViewIfNeeded()
  await page.evaluate(async () => { for (let frame = 0; frame < 3; frame++) await new Promise(requestAnimationFrame) })
  await queryInput.click()
  const query = 'steel'
  await queryInput.fill(query)
  const choice = page.getByRole('list', { name: /Calculated craft suggestions for/ }).getByRole('button').first()
  await expect(choice.locator('.crafting-sheet__query-text').first()).toHaveText(query.replaceAll(' ', '_'))
  await choice.click()
  expect(await entry.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await page.getByRole('button', { name: 'Next item-set columns' }).click()
  await page.getByRole('button', { name: 'Previous item-set columns' }).click()
  await expect(queryInput).toHaveValue(query.replaceAll(' ', '_'))
  await entry.getByRole('checkbox', { name: 'Include item set 11' }).uncheck()
  await page.getByRole('button', { name: 'Next item-set columns' }).click()
  await page.getByRole('button', { name: 'Previous item-set columns' }).click()
  await expect(entry.getByRole('checkbox', { name: 'Include item set 11' })).not.toBeChecked()
  await page.setViewportSize({ width: 1024, height: 720 })
  await expect.poll(() => columns.locator('.crafting-sheet__set-column').count()).toBe(2)
  await expect(entry.getByRole('checkbox', { name: 'Include item set 11' })).not.toBeChecked()
})
