import { expect, test } from '@playwright/test'

for (const compact of [false, true]) test(`populated lookup rows reserve separate space for language, previews and disclosure (${compact ? 'compact' : 'normal'})`, async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  if (compact) {
    await page.getByRole('button', { name: 'settings', exact: true }).click()
    await page.getByRole('switch', { name: 'compact layout' }).click()
    await page.getByRole('button', { name: 'save settings' }).click()
  }
  await page.getByRole('button', { name: 'craft lookup', exact: true }).click()
  await page.getByRole('button', { name: 'Add target items' }).click()
  await page.getByRole('searchbox', { name: 'Search Goals' }).fill('stick')
  await page.getByRole('button', { name: 'Stick', exact: true }).click()
  await page.getByRole('button', { name: 'Use inventory preset Overworld' }).click()
  await page.getByRole('button', { name: 'Look up crafts' }).click()
  const rows = page.locator('.calculated-search-row--craft-lookup:has(.craft-previews)')
  await expect(rows.first()).toBeVisible({ timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready)
  const widths = new Set(Array.from({ length: 281 }, (_, index) => 320 + index * 8))
  for (const breakpoint of [512, 544, 560, 576, 608, 672, 704, 752, 832, 880, 896, 1120, 1152, 1200, 1536]) {
    for (const delta of [-1, 0, 1]) widths.add(breakpoint + delta)
  }
  const viewports = [...widths].sort((a, b) => a - b).map((width) => ({ width, height: 1000 }))
  viewports.push({ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 })
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.evaluate(async () => { for (let frame = 0; frame < 3; frame++) await new Promise(requestAnimationFrame) })
    const failures = await rows.evaluateAll((elements) => {
      const problems: string[] = []
      for (const row of elements) {
        const summary = row.querySelector('.calculated-search-row__summary')!
        const name = summary.querySelector('.craft-lookup__language-name')!
        const previews = summary.querySelector('.craft-previews')!
        const score = summary.querySelector('.craft-lookup__score')!
        const toggle = summary.querySelector('button')!
        const boxes = [name, previews, score, toggle].map((element) => element.getBoundingClientRect())
        const bounds = summary.getBoundingClientRect()
        for (let left = 0; left < boxes.length; left++) for (let right = left + 1; right < boxes.length; right++) {
          const a = boxes[left], b = boxes[right]
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) problems.push(`${name.textContent}: overlapping summary cells`)
        }
        if (innerWidth <= 672 && boxes[1].top < boxes[0].bottom - 1) problems.push(`${name.textContent}: mobile previews must sit below language`)
        if (innerWidth > 672 && boxes[1].left < boxes[0].right - 1) problems.push(`${name.textContent}: desktop previews must sit beside language`)
        if (boxes[2].left < boxes[1].right - 1) problems.push(`${name.textContent}: score must follow previews`)
        for (const box of boxes) {
          if (box.left < bounds.left - 1 || box.right > bounds.right + 1 || box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1) problems.push(`${name.textContent}: escaped summary`)
        }
        if (boxes[3].width < 32 || boxes[3].height < 32) problems.push(`${name.textContent}: unusable disclosure`)
        for (const preview of previews.children) {
          if (!preview.checkVisibility({ checkVisibilityCSS: true })) continue
          const rect = preview.getBoundingClientRect()
          if (rect.left < boxes[1].left - 1 || rect.right > boxes[1].right + 1) problems.push(`${name.textContent}: clipped preview`)
          for (const part of preview.querySelectorAll('.craft-query, .craft-query > *')) {
            const partBounds = part.getBoundingClientRect()
            if (partBounds.left < rect.left - 1 || partBounds.right > rect.right + 1) problems.push(`${name.textContent}: clipped query content`)
          }
        }
      }
      if (document.documentElement.scrollWidth > innerWidth + 1) problems.push('page overflow')
      return problems
    })
    expect(failures, `Lookup at ${viewport.width}x${viewport.height}: ${failures.join(', ')}`).toEqual([])
  }
  await page.setViewportSize({ width: 320, height: 568 })
  await rows.first().screenshot({ path: test.info().outputPath('lookup-mobile.png') })
  await rows.first().locator('.calculated-search-row__toggle').click()
  await expect(rows.first().locator('.craft-categories--open')).toBeVisible()
})
