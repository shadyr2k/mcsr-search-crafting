import { expect, test } from '@playwright/test'

async function addStickSet(page: import('@playwright/test').Page, inventoryItem?: string) {
  await page.getByRole('button', { name: 'Add item set' }).click()
  await page.getByRole('searchbox', { name: 'Search Goals' }).fill('stick')
  await page.getByRole('button', { name: 'Stick', exact: true }).click()
  if (inventoryItem) {
    const inventory = page.getByRole('searchbox', { name: 'Search Inventory' })
    await inventory.fill(inventoryItem)
    await page.getByRole('button', { name: 'Oak Planks', exact: true }).click()
  }
  await page.getByRole('heading', { name: 'New item set' }).click()
  await page.getByRole('switch', { name: 'Crafting grid size' }).click()
  await page.getByRole('button', { name: 'Save item set' }).click()
}

test('keeps craft-row targets and junk counts ordered at every responsive breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')

  const calculated = page.getByRole('region', { name: 'Calculated searches for item set 6' })
  await calculated.getByRole('button', { name: 'Show all crafts for item set 6' }).click()
  const overlapCrafts = calculated.getByRole('region', { name: 'Overlap crafts' })
  await expect(overlapCrafts).toBeVisible()

  const craft = overlapCrafts.getByRole('listitem').last()
  await expect(craft).toBeVisible()

  const regularCalculated = page.getByRole('region', { name: 'Calculated searches for item set 1' })
  await regularCalculated.getByRole('button', { name: 'Show all crafts for item set 1' }).click()
  const regularCategory = regularCalculated.getByRole('region', { name: 'Regular crafts' })
  await regularCategory.getByRole('button', { name: 'other' }).click()
  const regularCraft = regularCategory.locator('.craft-result:has(.craft-result__junk-sizers)').first()
  await expect(regularCraft).toBeVisible()
  await expect(regularCraft.locator('.craft-result__junk')).toBeVisible()

  for (const width of [320, 375, 608, 672, 768, 896, 1152, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.waitForTimeout(100)
    const geometry = await craft.evaluate((row) => {
      const stepBars = [...row.querySelectorAll<HTMLElement>('.craft-result__step-bar')]
      const bar = stepBars.find((candidate) => candidate.querySelector('.craft-result__junk')) ?? stepBars[0]!
      const query = bar.querySelector<HTMLElement>('.craft-query')!
      const items = bar.querySelector<HTMLElement>('.craft-result__items')!
      const targets = bar.querySelector<HTMLElement>('.craft-result__targets')!
      const junk = bar.querySelector<HTMLElement>('.craft-result__junk')
      const count = junk?.querySelector<HTMLElement>('.craft-result__more-junk')
      return {
        craft: row.getBoundingClientRect().toJSON(),
        query: query.getBoundingClientRect().toJSON(),
        items: items.getBoundingClientRect().toJSON(),
        targets: targets.getBoundingClientRect().toJSON(),
        targetIcon: targets.querySelector<HTMLElement>('.item-icon')?.getBoundingClientRect().toJSON(),
        divider: bar.querySelector<HTMLElement>('.craft-result__junk-divider')?.getBoundingClientRect().toJSON(),
        junk: junk?.getBoundingClientRect().toJSON(),
        count: count?.getBoundingClientRect().toJSON(),
        arrow: row.querySelector<HTMLElement>('.craft-result__toggle-mark')?.getBoundingClientRect().toJSON(),
        junkLabel: junk?.getAttribute('aria-label'),
        countText: count?.textContent,
        itemsScrollWidth: items.scrollWidth,
        itemsClientWidth: items.clientWidth,
      }
    })

    // Every compact step remains a left-to-right sequence: query, targets,
    // junk, then the aggregate number. The number must remain visible whenever
    // one or more junk icons yields to the available width.
    expect(geometry.targets.left, `targets start after the query at ${width}px`).toBeGreaterThanOrEqual(geometry.query.right - 1)
    expect(geometry.targets.left - geometry.query.right, `targets stay adjacent to the query at ${width}px`).toBeLessThanOrEqual(16)
    expect(geometry.itemsScrollWidth, `item strip is not clipped at ${width}px`).toBeLessThanOrEqual(geometry.itemsClientWidth)
    expect(geometry.items.left).toBeGreaterThanOrEqual(geometry.craft.left - 1)
    expect(geometry.items.right).toBeLessThanOrEqual(geometry.craft.right + 1)
    if (width === 1440) {
      expect(geometry.targetIcon?.width, 'craft-row icons use their 32px default').toBe(32)
      expect(geometry.targetIcon?.height, 'craft-row icons use their 32px default').toBe(32)
    }

    if (!geometry.junk) {
      expect(geometry.arrow!.left, `arrow stays after targets when junk is hidden at ${width}px`).toBeGreaterThanOrEqual(geometry.targets.right - 1)
    } else {
      const countMatch = geometry.junkLabel?.match(/^Junk preview: (\d+) of (\d+) items$/)
      expect(countMatch, `junk count is available at ${width}px`).not.toBeNull()
      const visibleJunk = Number(countMatch![1])
      const totalJunk = Number(countMatch![2])
      expect(geometry.junk.left, `junk follows targets at ${width}px`).toBeGreaterThanOrEqual(geometry.targets.right - 1)
      expect(geometry.junk.left - geometry.targets.right, `junk keeps its padded separation at ${width}px`).toBeLessThanOrEqual(16)
      expect(geometry.divider, `a centered divider separates targets and junk at ${width}px`).not.toBeNull()
      expect(Math.abs((geometry.divider!.left - geometry.targets.right) - (geometry.junk.left - geometry.divider!.right)), `divider has matching gaps at ${width}px`).toBeLessThanOrEqual(1)
      expect(Math.abs((geometry.divider!.top + geometry.divider!.bottom) / 2 - (geometry.targetIcon!.top + geometry.targetIcon!.bottom) / 2), `divider is vertically centered on the icons at ${width}px`).toBeLessThanOrEqual(1)
      if (totalJunk > visibleJunk) {
        expect(geometry.count, `junk count replaces hidden icons at ${width}px`).not.toBeNull()
        expect(geometry.countText).toBe(`+${totalJunk - visibleJunk}`)
        expect(geometry.count!.left).toBeGreaterThanOrEqual(geometry.junk.left - 1)
        expect(geometry.count!.right).toBeLessThanOrEqual(geometry.junk.right + 1)
      } else {
        expect(geometry.count, `junk count is hidden when every junk icon fits at ${width}px`).toBeUndefined()
      }
      expect(geometry.arrow!.left, `arrow stays after the overlap craft at ${width}px`).toBeGreaterThanOrEqual(geometry.junk.right - 1)
    }

    const regularGeometry = await regularCraft.evaluate((row) => {
      const bar = row.querySelector<HTMLElement>('.craft-result__toggle, .craft-result__bar')!
      const query = bar.querySelector<HTMLElement>('.craft-query')!
      const items = bar.querySelector<HTMLElement>('.craft-result__items')!
      const targets = bar.querySelector<HTMLElement>('.craft-result__targets')!
      const junk = bar.querySelector<HTMLElement>('.craft-result__junk')
      const arrow = bar.querySelector<HTMLElement>('.craft-result__toggle-mark')!
      return {
        craft: row.getBoundingClientRect().toJSON(),
        query: query.getBoundingClientRect().toJSON(),
        items: items.getBoundingClientRect().toJSON(),
        targets: targets.getBoundingClientRect().toJSON(),
        divider: bar.querySelector<HTMLElement>('.craft-result__junk-divider')?.getBoundingClientRect().toJSON(),
        junk: junk?.getBoundingClientRect().toJSON(),
        arrow: arrow.getBoundingClientRect().toJSON(),
        itemsScrollWidth: items.scrollWidth,
        itemsClientWidth: items.clientWidth,
      }
    })

    expect(regularGeometry.targets.left, `regular targets start after the query at ${width}px`).toBeGreaterThanOrEqual(regularGeometry.query.right - 1)
    expect(regularGeometry.targets.left - regularGeometry.query.right, `regular targets stay adjacent to the query at ${width}px`).toBeLessThanOrEqual(16)
    if (regularGeometry.junk) {
      expect(regularGeometry.junk.left, `regular junk follows targets at ${width}px`).toBeGreaterThanOrEqual(regularGeometry.targets.right - 1)
      expect(regularGeometry.junk.left - regularGeometry.targets.right, `regular junk keeps its padded separation at ${width}px`).toBeLessThanOrEqual(16)
      expect(regularGeometry.divider, `regular crafts use a centered divider at ${width}px`).not.toBeNull()
      expect(Math.abs((regularGeometry.divider!.left - regularGeometry.targets.right) - (regularGeometry.junk.left - regularGeometry.divider!.right)), `regular divider has matching gaps at ${width}px`).toBeLessThanOrEqual(1)
      expect(regularGeometry.arrow.left, `regular arrow stays last at ${width}px`).toBeGreaterThanOrEqual(regularGeometry.junk.right - 1)
    } else {
      expect(regularGeometry.arrow.left, `regular arrow stays after targets at ${width}px`).toBeGreaterThanOrEqual(regularGeometry.targets.right - 1)
    }
    expect(regularGeometry.itemsScrollWidth, `regular item strip is not clipped at ${width}px`).toBeLessThanOrEqual(regularGeometry.itemsClientWidth)
    expect(regularGeometry.items.left).toBeGreaterThanOrEqual(regularGeometry.craft.left - 1)
    expect(regularGeometry.items.right).toBeLessThanOrEqual(regularGeometry.craft.right + 1)
  }
})

test('uses every selected palette color for dark editor controls', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Choose color theme' }).click()
  await expect(page.getByRole('menuitemradio')).toHaveCount(10)
  await page.getByRole('menuitemradio', { name: 'Select cyan theme' }).click()
  await page.getByRole('switch', { name: 'Switch to dark mode' }).click()
  await page.getByRole('button', { name: 'Add item set' }).click()

  const editorColors = await page.locator('.item-set-editor').evaluate((editor) => ({
    control: getComputedStyle(editor.querySelector<HTMLElement>('.grid-size-switch__control')!).backgroundColor,
    label: getComputedStyle(editor.querySelector<HTMLElement>('.grid-size-switch__label')!).backgroundColor,
  }))
  expect(editorColors.control).not.toBe('rgb(81, 36, 58)')
  expect(editorColors.label).not.toBe('rgb(81, 36, 58)')

  await page.getByRole('button', { name: 'Choose color theme' }).click()
  await page.getByRole('menuitemradio', { name: 'Select plain white / black theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme-color', 'white')
  await expect.poll(() => page.locator('html').evaluate((root) => getComputedStyle(root).getPropertyValue('--page').trim())).toBe('#050505')
})

test('keeps expanded craft sections anchored while collapsing', async ({ page }) => {
  await page.goto('/')
  const calculated = page.getByRole('region', { name: 'Calculated searches for item set 6' })
  const toggle = calculated.getByRole('button', { name: 'Show all crafts for item set 6' })
  await toggle.click()
  const categories = calculated.locator('.craft-categories')
  const content = categories.locator('.craft-categories__content')
  await expect(categories).toHaveClass(/craft-categories--open/)

  const before = await content.evaluate((element) => element.getBoundingClientRect().top)
  await calculated.getByRole('button', { name: 'Hide crafts for item set 6' }).click()
  await page.waitForTimeout(75)
  const during = await content.evaluate((element) => ({
    top: element.getBoundingClientRect().top,
    transform: getComputedStyle(element.parentElement!).transform,
    opacity: getComputedStyle(element.parentElement!).opacity,
  }))

  expect(during.top).toBeCloseTo(before, 0)
  expect(during.transform).toBe('none')
  expect(Number(during.opacity)).toBeLessThan(1)
  await page.waitForTimeout(175)
  await expect(categories).toHaveClass(/craft-categories--closing/)
  const release = await categories.evaluate((element) => ({
    marginTop: Number.parseFloat(getComputedStyle(element).marginTop),
    paddingTop: Number.parseFloat(getComputedStyle(element).paddingTop),
  }))
  expect(release.marginTop).toBeGreaterThan(0)
  expect(release.marginTop).toBeLessThan(12.8)
  expect(release.paddingTop).toBeGreaterThan(0)
  expect(release.paddingTop).toBeLessThan(12.8)
  await expect(categories).not.toHaveClass(/craft-categories--closing/)
})

test('persists independent saved item sets and excludes disabled rows', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'MCSR Search Crafting' })).toBeVisible()
  const itemSets = page.getByRole('article', { name: /Item set \d+/ })
  await expect(itemSets.first()).toBeVisible()
  const initialItemSetCount = await itemSets.count()
  const firstAddedEntryNumber = initialItemSetCount + 1
  const secondAddedEntryNumber = initialItemSetCount + 2

  await addStickSet(page, 'oak planks')
  await expect(page.getByRole('article', { name: `Item set ${firstAddedEntryNumber}` })).toBeVisible()
  await expect(page.getByRole('button', { name: `Show all crafts for item set ${firstAddedEntryNumber}` })).toBeVisible()

  await addStickSet(page)
  await expect(page.getByRole('article', { name: `Item set ${secondAddedEntryNumber}` })).toBeVisible()
  const secondCalculated = page.getByRole('region', { name: `Calculated searches for item set ${secondAddedEntryNumber}` })
  await expect(secondCalculated.getByText('No viable search')).toBeVisible()

  await page.getByRole('article', { name: `Item set ${secondAddedEntryNumber}` }).getByRole('button', { name: `Enable item set ${secondAddedEntryNumber}` }).click()
  await expect(page.getByText('Disabled')).toBeVisible()
  await page.reload()

  await expect(page.getByRole('article', { name: `Item set ${firstAddedEntryNumber}` })).toBeVisible()
  const secondAddedItemSet = page.getByRole('article', { name: `Item set ${secondAddedEntryNumber}` })
  await expect(secondAddedItemSet.getByRole('button', { name: `Enable item set ${secondAddedEntryNumber}` })).toHaveAttribute('aria-pressed', 'false')
  await expect(secondAddedItemSet.getByText('2×2')).toBeVisible()
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

test('uses the compact language picker on the stacked language-info page', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 1000 })
  await page.goto('/')
  await page.getByRole('button', { name: 'language info' }).click()
  await expect(page.getByRole('heading', { name: /more language info/i })).toBeVisible()

  const languagePicker = await page.locator('.workspace-transition--language-info > .language-selector').evaluate((selector) => ({
    categoryDisplay: getComputedStyle(selector.querySelector<HTMLElement>('.language-selector__category')!).display,
    searchDisplay: getComputedStyle(selector.querySelector<HTMLElement>('.language-selector__search')!).display,
    titleDisplay: getComputedStyle(selector.querySelector<HTMLElement>('.language-selector__title')!).display,
  }))
  expect(languagePicker.titleDisplay).toBe('none')
  expect(languagePicker.categoryDisplay).toBe('none')
  expect(languagePicker.searchDisplay).not.toBe('none')
})

test('uses a full-page fade when navigating to language info from another tab', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  const pageTransition = page.locator('.page-transition')
  await page.getByRole('button', { name: 'recipe book sim' }).click()
  await expect(pageTransition).toHaveClass(/page-transition--exiting/)
  await expect(page.locator('.recipe-book-sim')).toBeVisible()
  await expect(pageTransition).not.toHaveClass(/page-transition--exiting/)
  await page.getByRole('button', { name: 'language info' }).click()
  await expect(pageTransition).toHaveClass(/page-transition--exiting/)
  await expect(page.getByRole('heading', { name: /more language info/i })).toBeVisible()
  await expect(pageTransition).not.toHaveClass(/page-transition--exiting/)

  await page.getByRole('button', { name: 'recipe book sim' }).click()
  await expect(pageTransition).toHaveClass(/page-transition--exiting/)
  await expect(page.locator('.recipe-book-sim')).toBeVisible()
  await expect(pageTransition).not.toHaveClass(/page-transition--exiting/)

  await page.getByRole('button', { name: 'search crafting' }).click()
  await expect(pageTransition).toHaveClass(/page-transition--exiting/)
  await expect(page.locator('.workspace-transition--home')).toBeVisible()
  await expect(pageTransition).not.toHaveClass(/page-transition--exiting/)
})

test('keeps the shared language selector visible when returning to search crafting', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  const pageTransition = page.locator('.page-transition')
  await page.getByRole('button', { name: 'language info' }).click()
  await expect(page.getByRole('heading', { name: /more language info/i })).toBeVisible()
  await expect(pageTransition).not.toHaveClass(/page-transition--(exiting|entering)/)
  await page.getByRole('button', { name: 'search crafting' }).click()

  const languageTransition = await page.locator('.workspace-transition--home > .language-selector').evaluate((selector) => ({
    animation: getComputedStyle(selector).animationName,
    opacity: getComputedStyle(selector).opacity,
    fadesLanguage: selector.parentElement?.classList.contains('workspace-transition--fade-language-column'),
  }))
  expect(languageTransition.fadesLanguage).toBe(false)
  expect(languageTransition.animation).toBe('none')
  expect(languageTransition.opacity).toBe('1')
  await expect(pageTransition).not.toHaveClass(/page-transition--(exiting|entering)/)
})

test('uses the full fade for stacked craft and language-info pages', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 1000 })
  await page.goto('/')
  const pageTransition = page.locator('.page-transition')
  await page.getByRole('button', { name: 'language info' }).click()
  await expect(pageTransition).toHaveClass(/page-transition--exiting/)
  await expect(page.getByRole('heading', { name: /more language info/i })).toBeVisible()
  await expect(pageTransition).not.toHaveClass(/page-transition--exiting/)
})

test('keeps items added from recipe details after a reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'recipe book sim' }).click()

  await page.locator('.recipe-book-sim__book-items button').first().click()
  const addItem = page.locator('.recipe-book-sim__detail-add')
  await expect(addItem).toBeEnabled()
  const detailGeometry = await page.locator('.recipe-book-sim__detail').evaluate((detail) => {
    const title = detail.querySelector<HTMLElement>('.recipe-book-sim__detail-title')!
    const heading = detail.querySelector<HTMLElement>('.recipe-book-sim__detail-heading')!
    const localizedName = title.querySelector<HTMLElement>('p')!
    const add = title.querySelector<HTMLElement>('.recipe-book-sim__detail-add')!
    const book = document.querySelector<HTMLElement>('.recipe-book-sim__book')!
    return {
      add: add.getBoundingClientRect().toJSON(),
      heading: heading.getBoundingClientRect().toJSON(),
      localizedName: localizedName.getBoundingClientRect().toJSON(),
      bookShadow: getComputedStyle(book).boxShadow,
    }
  })
  expect(detailGeometry.bookShadow).toBe('none')
  expect(detailGeometry.add.top).toBeLessThanOrEqual(detailGeometry.heading.top)
  expect(detailGeometry.add.bottom).toBeGreaterThanOrEqual(detailGeometry.localizedName.bottom)
  const addLabel = await addItem.getAttribute('aria-label')
  const addedName = addLabel!.replace(/^Add (.*) to simulator inventory$/, '$1')
  await addItem.click()
  await expect(addItem).toBeDisabled()
  await expect(page.getByRole('button', { name: `Remove ${addedName}` })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('mcsr.recipe-book-inventory.v1'))).not.toBeNull()

  await page.reload()
  await page.getByRole('button', { name: 'recipe book sim' }).click()
  await page.locator('.recipe-book-sim__book-items button').first().click()
  await expect(page.getByRole('button', { name: addLabel! })).toBeDisabled()
  await expect(page.getByRole('button', { name: `Remove ${addedName}` })).toBeVisible()
})

test('opens the responsive craft lookup setup page', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 })
  await page.goto('/')
  await page.getByRole('button', { name: 'craft lookup' }).click()

  await expect(page.getByRole('region', { name: 'lookup setup' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Look up crafts' })).toBeDisabled()
  const layout = await page.locator('.craft-lookup').evaluate((lookup) => ({
    scrollWidth: lookup.scrollWidth,
    clientWidth: lookup.clientWidth,
    columns: getComputedStyle(lookup.querySelector<HTMLElement>('.craft-lookup__layout')!).gridTemplateColumns,
    goalPicker: lookup.querySelector<HTMLElement>('.item-picker--main-goals')!.getBoundingClientRect().toJSON(),
    goalSelection: lookup.querySelector<HTMLElement>('.item-picker--main-goals .item-picker__selected')!.getBoundingClientRect().toJSON(),
    inventorySelection: lookup.querySelector<HTMLElement>('.item-picker:not(.item-picker--main-goals) .item-picker__selected')!.getBoundingClientRect().toJSON(),
    lookupButton: lookup.querySelector<HTMLElement>('.item-set-editor__save-next-to-goals')!.getBoundingClientRect().toJSON(),
  }))
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth)
  expect(layout.columns.split(' ').length).toBe(1)
  expect(layout.goalSelection.height).toBeGreaterThan(layout.inventorySelection.height)
  expect(layout.lookupButton.left).toBeGreaterThanOrEqual(layout.goalSelection.right - 1)
  expect(layout.lookupButton.top).toBeGreaterThanOrEqual(layout.goalSelection.top - 1)
  expect(layout.lookupButton.bottom).toBeLessThanOrEqual(layout.goalSelection.bottom + 1)
})

test('keeps each lookup language and its expandable text-only craft previews in one row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.getByRole('button', { name: 'craft lookup' }).click()
  await page.getByRole('searchbox', { name: 'Search Goals' }).fill('stick')
  await page.getByRole('button', { name: 'Stick', exact: true }).click()
  await page.getByRole('button', { name: 'Use inventory preset Overworld' }).click()
  await page.getByRole('button', { name: 'Look up crafts' }).click()

  const languageRow = page.locator('.calculated-search-row--craft-lookup:has(.craft-previews)').first()
  await expect(languageRow).toBeVisible({ timeout: 15000 })
  await expect(languageRow.locator('.calculated-search-row__summary .item-icon')).toHaveCount(0)
  const previewCount = await languageRow.locator('.craft-previews > li').count()
  expect(previewCount).toBeGreaterThan(0)
  expect(previewCount).toBeLessThanOrEqual(3)

  // Previews never wrap into a second line. At smaller widths whole preview
  // chips disappear rather than being clipped or pushing the row taller.
  for (const width of [1050, 640, 360]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect.poll(async () => languageRow.locator('.craft-previews').evaluate((list) => {
      const visiblePreviews = [...list.children].filter((preview) => {
        const style = getComputedStyle(preview)
        return style.display !== 'none' && style.visibility !== 'hidden'
      })
      const lines = new Set(visiblePreviews.map((preview) => Math.round(preview.getBoundingClientRect().top)))
      return {
        oneLine: lines.size <= 1,
        notClipped: list.scrollWidth <= list.clientWidth + 1,
      }
    })).toEqual({ oneLine: true, notClipped: true })
  }

  await languageRow.locator('.calculated-search-row__toggle').click()
  await expect(languageRow.locator('.craft-categories--open')).toBeVisible()

  const languageGroup = page.locator('.craft-lookup__language-group:has(.craft-lookup__language-more)').first()
  const showAll = languageGroup.locator('.craft-lookup__language-more')
  await expect(showAll).toBeVisible({ timeout: 15000 })
  const initialCount = await languageGroup.locator('ol > li').count()
  await showAll.click()
  await expect(showAll).toHaveAttribute('aria-expanded', 'true')
  expect(await languageGroup.locator('ol > li').count()).toBeGreaterThan(initialCount)
})

test('keeps the simulator language picker within its control at narrow widths', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: 'recipe book sim' }).click()

  const trigger = page.getByRole('button', { name: 'Simulator language' })
  await trigger.click()
  const geometry = await page.locator('.recipe-book-sim__language-menu').evaluate((menu) => {
    const trigger = menu.querySelector<HTMLElement>('.recipe-book-sim__language-trigger')!
    const list = menu.querySelector<HTMLElement>('[role="listbox"]')!
    return {
      trigger: trigger.getBoundingClientRect().toJSON(),
      list: list.getBoundingClientRect().toJSON(),
      triggerScrollWidth: trigger.scrollWidth,
      triggerClientWidth: trigger.clientWidth,
      listScrollWidth: list.scrollWidth,
      listClientWidth: list.clientWidth,
    }
  })

  expect(geometry.list.left).toBeCloseTo(geometry.trigger.left, 0)
  expect(geometry.list.right).toBeCloseTo(geometry.trigger.right, 0)
  expect(geometry.triggerScrollWidth).toBeLessThanOrEqual(geometry.triggerClientWidth)
  expect(geometry.listScrollWidth).toBeLessThanOrEqual(geometry.listClientWidth)
})

test('keeps item sets visible beside the editor on desktop and under it when stacked', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Add item set' }).click()
  await expect(page.getByRole('region', { name: 'New item set' })).toBeVisible()

  const desktop = await page.locator('.workspace-transition').evaluate((workspace) => {
    const itemSets = workspace.querySelector<HTMLElement>('.item-set-workspace')!
    const results = workspace.querySelector<HTMLElement>('.results-column')!
    const editor = workspace.querySelector<HTMLElement>('.item-set-editor-overlay')!
    return {
      editor: editor.getBoundingClientRect().toJSON(),
      editorRadius: Number.parseFloat(getComputedStyle(editor).borderTopLeftRadius),
      itemSets: itemSets.getBoundingClientRect().toJSON(),
      results: results.getBoundingClientRect().toJSON(),
    }
  })
  expect(desktop.editor.left).toBeCloseTo(desktop.results.left, 0)
  expect(desktop.editor.right).toBeCloseTo(desktop.results.right, 0)
  expect(desktop.editor.left).toBeGreaterThan(desktop.itemSets.right)
  expect(desktop.editorRadius).toBeGreaterThan(0)

  await page.setViewportSize({ width: 720, height: 1000 })
  const stacked = await page.locator('.workspace-transition').evaluate((workspace) => {
    const itemSets = workspace.querySelector<HTMLElement>('.item-set-workspace')!
    const editor = workspace.querySelector<HTMLElement>('.item-set-editor-overlay')!
    return {
      editor: editor.getBoundingClientRect().toJSON(),
      itemSets: itemSets.getBoundingClientRect().toJSON(),
    }
  })
  expect(stacked.editor.left).toBeCloseTo(stacked.itemSets.left, 0)
  expect(stacked.editor.right).toBeCloseTo(stacked.itemSets.right, 0)
  expect(stacked.editor.top).toBeCloseTo(stacked.itemSets.top, 0)
})

test('keeps the complete menu bar visible while the page scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 480 })
  await page.goto('/')
  const header = page.locator('.app-header')
  await expect(header).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  const geometry = await header.evaluate((element) => ({
    position: getComputedStyle(element).position,
    top: element.getBoundingClientRect().top,
  }))
  expect(geometry.position).toBe('sticky')
  expect(geometry.top).toBeCloseTo(8, 0)
})

test('keeps long craft lists inside the panel and themed page background', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /english.*search crafts/ }).waitFor()
  await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('mcsr.target-workspace.v1')!)
    const entry = workspace.entries[0]
    workspace.entries = Array.from({ length: 45 }, (_, order) => ({
      ...entry, id: `long-list-${order}`, order,
    }))
    localStorage.setItem('mcsr.target-workspace.v1', JSON.stringify(workspace))
  })
  await page.reload()
  await page.getByRole('button', { name: 'Choose color theme' }).click()
  await page.getByRole('menuitemradio', { name: 'Select plain white / black theme' }).click()
  await page.getByRole('switch', { name: 'Switch to dark mode' }).click()
  await expect(page.locator('.calculated-search-row')).toHaveCount(45)

  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 })
    await page.locator('.calculated-search-row').last().scrollIntoViewIfNeeded()
    await expect.poll(() => page.locator('.results-column').evaluate((panel) => {
      const lastRow = panel.querySelector('.calculated-search-row:last-child')!
      const bottom = lastRow.getBoundingClientRect().bottom
      return {
        panelContainsRows: panel.getBoundingClientRect().bottom >= bottom,
        bodyContainsRows: document.body.getBoundingClientRect().bottom >= bottom,
      }
    })).toEqual({ panelContainsRows: true, bodyContainsRows: true })
  }
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(5, 5, 5)')
})

test('keeps the background fixed when scrolling back up and collapsing crafts', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Choose color theme' }).click()
  await page.getByRole('menuitemradio', { name: 'Select plain white / black theme' }).click()
  await page.getByRole('switch', { name: 'Switch to dark mode' }).click()

  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 800 })
    for (const mode of ['dark', 'light']) {
      if (await page.locator('html').getAttribute('data-theme') !== mode) {
        await page.getByRole('switch', { name: `Switch to ${mode} mode` }).click()
      }
      const toggle = page.getByRole('button', { name: 'Show all crafts for item set 6' })
      await toggle.click()
      await expect(page.locator('.craft-categories--open')).toBeVisible()
      const background = () => page.screenshot({
        fullPage: false,
        // Keep the real layout while isolating the background from panel shadows.
        style: '.app-shell, .app-shell * { visibility: hidden !important; }',
      })
      const before = await background()
      const expectSameBackground = async () => {
        const after = await background()
        const difference = await page.evaluate(async ([first, second]) => {
          const pixels = async (base64: string) => {
            const image = new Image()
            image.src = `data:image/png;base64,${base64}`
            await image.decode()
            const canvas = document.createElement('canvas')
            canvas.width = image.width
            canvas.height = image.height
            const context = canvas.getContext('2d')!
            context.drawImage(image, 0, 0)
            return context.getImageData(0, 0, canvas.width, canvas.height).data
          }
          const [a, b] = await Promise.all([pixels(first), pixels(second)])
          if (a.length !== b.length) return 255
          return a.reduce((maximum, channel, index) => Math.max(maximum, Math.abs(channel - b[index])), 0)
        }, [before.toString('base64'), after.toString('base64')])
        // Allow tiny gradient-dithering differences between browser repaints.
        expect(difference, `${mode} background at ${width}px`).toBeLessThanOrEqual(4)
      }
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await page.mouse.wheel(0, -300)
      await expectSameBackground()
      await page.getByRole('button', { name: 'Hide crafts for item set 6' }).click()
      await expect(page.locator('.craft-categories--closing')).toHaveCount(0)
      await expectSameBackground()
    }
  }
  // Paint the document canvas, including any viewport space beyond a shrinking body.
  await expect(page.locator('html')).toHaveCSS('background-image', /linear-gradient/)
  await expect(page.locator('html')).toHaveCSS('background-attachment', 'fixed, fixed, fixed')
  await expect(page.locator('body')).toHaveCSS('background-image', 'none')
})

async function expectFluidLayout(page: import('@playwright/test').Page) {
  const measurements = await page.locator('html').evaluate(() => {
    const elements = document.querySelectorAll<HTMLElement>([
      '.app-header',
      '.workspace-grid',
      '.item-set-workspace',
      '.language-selector',
      '.results-column',
      '.language-info-panel',

      '.recipe-book-sim',
      '.recipe-book-sim__layout',
      '.recipe-book-sim__book',
    ].join(', '))

    const visibleElements = [...elements].filter((element) => (
      getComputedStyle(element).visibility !== 'hidden' && element.clientWidth > 0
    ))

    return {
      page: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      },
      elements: visibleElements.map((element) => ({
        className: element.className,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      })),
    }
  })

  expect(measurements.page.scrollWidth).toBeLessThanOrEqual(measurements.page.clientWidth)
  for (const element of measurements.elements) {
    expect(element.scrollWidth, `${element.className} should fit its container`).toBeLessThanOrEqual(element.clientWidth)
  }
}

test('keeps every page fluid at each responsive breakpoint', async ({ page }) => {
  for (const width of [320, 375, 608, 672, 768, 896, 1152, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Add item set' })).toBeVisible()
    await expectFluidLayout(page)

    await page.getByRole('button', { name: 'language info' }).click()
    await expect(page.getByRole('heading', { name: /more language info/i })).toBeVisible()
    await expectFluidLayout(page)


    await page.getByRole('button', { name: 'recipe book sim' }).click()
    await expect(page.getByRole('region', { name: 'Recipe book results' })).toBeVisible()
    await expectFluidLayout(page)
  }
})

test('keeps pixel icons proportional and mobile navigation on one row', async ({ page }) => {
  const proportions: Array<{
    indicator: number
    arrow: number
    iconWidth: number
    iconHeight: number
    slotWidth: number
  }> = []

  for (const width of [320, 375, 608]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'MCSR Search Crafting' })).toBeVisible()

    const header = await page.locator('.app-header').evaluate((element) => {
      const icon = element.querySelector<HTMLElement>('.app-header__icon')!
      const title = element.querySelector<HTMLElement>('h1')!
      const buttons = [...element.querySelectorAll<HTMLElement>('.app-header__nav button')]
      const buttonTops = buttons.map((button) => Math.round(button.getBoundingClientRect().top))
      return {
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        iconRight: icon.getBoundingClientRect().right,
        titleLeft: title.getBoundingClientRect().left,
        titleWhiteSpace: getComputedStyle(title).whiteSpace,
        navRows: new Set(buttonTops).size,
        position: getComputedStyle(element).position,
        iconWidth: icon.getBoundingClientRect().width,
        iconHeight: icon.getBoundingClientRect().height,
      }
    })
    expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth)
    expect(header.titleWhiteSpace).toBe('nowrap')
    expect(header.titleLeft).toBeGreaterThanOrEqual(header.iconRight)
    expect(header.navRows).toBe(1)
    expect(header.position).toBe('sticky')
    expect(header.iconWidth).toBeCloseTo(header.iconHeight, 2)

    await page.getByRole('button', { name: 'recipe book sim' }).click()
    await expect(page.getByRole('region', { name: 'Recipe book results' })).toBeVisible()
    proportions.push(await page.locator('.recipe-book-sim__book').evaluate((book) => {
      const bookWidth = book.getBoundingClientRect().width
      const icon = book.querySelector<HTMLElement>('.recipe-book-sim__book-items .item-icon')!
      return {
        indicator: book.querySelector<HTMLElement>('.recipe-book-sim__craftable-indicator')!.getBoundingClientRect().width / bookWidth,
        arrow: book.querySelector<HTMLElement>('.recipe-book-sim__book-pages button, .recipe-book-sim__book-page-spacer')!.getBoundingClientRect().width / bookWidth,
        iconWidth: icon.getBoundingClientRect().width,
        iconHeight: icon.getBoundingClientRect().height,
        slotWidth: icon.closest<HTMLElement>('li')!.getBoundingClientRect().width,
      }
    }))
  }

  for (const proportion of proportions.slice(1)) {
    expect(proportion.indicator).toBeCloseTo(proportions[0].indicator, 2)
    expect(proportion.arrow).toBeCloseTo(proportions[0].arrow, 2)
    expect(proportion.iconWidth).toBeCloseTo(proportion.iconHeight, 2)
    expect(proportion.iconWidth).toBeLessThanOrEqual(proportion.slotWidth)
  }
  expect(proportions[0].iconWidth).toBeCloseTo(proportions[0].iconHeight, 2)
  expect(proportions[0].iconWidth).toBeLessThanOrEqual(proportions[0].slotWidth)
})

test('keeps the recipe book pager centered and its summary below the book', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.getByRole('button', { name: 'recipe book sim' }).click()

  await expect(page.getByRole('heading', { name: 'recipe book simulator' })).toBeVisible()
  await expect(page.getByText('search crafting sandbox')).toBeVisible()

  const geometry = await page.locator('.recipe-book-sim').evaluate((simulator) => {
    const layout = simulator.querySelector<HTMLElement>('.recipe-book-sim__layout')!
    const column = simulator.querySelector<HTMLElement>('.recipe-book-sim__book-column')!
    const book = column.querySelector<HTMLElement>('.recipe-book-sim__book')!
    const summary = column.querySelector<HTMLElement>('.recipe-book-sim__result-count')!
    const pager = book.querySelector<HTMLElement>('.recipe-book-sim__book-pages')!
    const arrow = book.querySelector<HTMLImageElement>('.recipe-book-sim__book-page-icon--normal')!
    const search = book.querySelector<HTMLInputElement>('.recipe-book-sim__book-search input')!
    const items = book.querySelector<HTMLElement>('.recipe-book-sim__book-items')!
    const indicator = book.querySelector<HTMLElement>('.recipe-book-sim__craftable-indicator')!
    const icon = book.querySelector<HTMLElement>('.recipe-book-sim__book-items .item-icon')!
    const iconSlot = icon.closest<HTMLElement>('li')!
    const itemButton = iconSlot.querySelector<HTMLButtonElement>('button')!
    const bookBox = book.getBoundingClientRect()
    const summaryBox = summary.getBoundingClientRect()
    const pagerBox = pager.getBoundingClientRect()
    const arrowBox = arrow.getBoundingClientRect()
    const iconBox = icon.getBoundingClientRect()
    const iconSlotBox = iconSlot.getBoundingClientRect()
    const itemsBox = items.getBoundingClientRect()
    const indicatorBox = indicator.getBoundingClientRect()
    const searchBox = search.getBoundingClientRect()

    return {
      arrowAspectRatio: arrowBox.height / arrowBox.width,
      arrowCenterOffset: Math.abs(
        (arrowBox.top + arrowBox.height / 2) - (pagerBox.top + pagerBox.height / 2),
      ),
      arrowWidth: arrowBox.width,
      bookHeight: bookBox.height,
      bookWidth: bookBox.width,
      layoutTop: layout.getBoundingClientRect().top,
      bookTop: bookBox.top,
      summaryTop: summaryBox.top,
      bookBottom: bookBox.bottom,
      controlsFontFamily: getComputedStyle(simulator.querySelector<HTMLElement>('.recipe-book-sim__controls')!).fontFamily,
      resultCountFontFamily: getComputedStyle(summary).fontFamily,
      searchColor: getComputedStyle(search).color,
      searchTextAlign: getComputedStyle(search).textAlign,
      searchTextShadow: getComputedStyle(search).textShadow,
      fontFamily: getComputedStyle(search).fontFamily,
      resultCountFontWeight: getComputedStyle(summary).fontWeight,
      iconCenterOffset: (iconBox.left + iconBox.width / 2) - (iconSlotBox.left + iconSlotBox.width / 2),
      iconSlotWidth: iconSlotBox.width,
      iconWidth: iconBox.width,
      iconHeight: iconBox.height,
      indicatorLeft: (indicatorBox.left - bookBox.left) / bookBox.width,
      indicatorTop: (indicatorBox.top - bookBox.top) / bookBox.width,
      itemsLeft: (itemsBox.left - bookBox.left) / bookBox.width,
      itemsTop: (itemsBox.top - bookBox.top) / bookBox.width,
      itemsWidth: itemsBox.width / bookBox.width,
      searchLeft: (searchBox.left - bookBox.left) / bookBox.width,
      searchTop: (searchBox.top - bookBox.top) / bookBox.width,
      pagerLeft: (pagerBox.left - bookBox.left) / bookBox.width,
      pagerRight: (bookBox.right - pagerBox.right) / bookBox.width,
      hasStackText: book.querySelector('.recipe-book-sim__book-items li small') !== null,
      itemButtonBackground: getComputedStyle(itemButton).backgroundColor,
    }
  })

  expect(geometry.bookTop).toBeCloseTo(geometry.layoutTop, 0)
  expect(geometry.bookWidth).toBeCloseTo(480, 0)
  expect(geometry.bookHeight).toBeCloseTo(542, 0)
  expect(geometry.summaryTop).toBeGreaterThan(geometry.bookBottom)
  expect(geometry.arrowAspectRatio).toBeCloseTo(68 / 44, 2)
  expect(geometry.arrowWidth).toBeCloseTo(33.6, 0)
  expect(geometry.arrowCenterOffset).toBeLessThanOrEqual(1)
  expect(geometry.searchColor).toBe('rgb(255, 255, 255)')
  expect(geometry.searchTextAlign).toBe('left')
  expect(geometry.searchTextShadow).not.toBe('none')
  expect(geometry.controlsFontFamily).not.toContain('Monocraft')
  expect(geometry.resultCountFontFamily).toContain('Monocraft')
  expect(Number.parseInt(geometry.resultCountFontWeight, 10)).toBeGreaterThanOrEqual(700)
  expect(geometry.fontFamily).toContain('Monocraft')
  expect(geometry.indicatorLeft).toBeCloseTo(110 / 147, 2)
  expect(geometry.indicatorTop).toBeCloseTo(10 / 147, 2)
  expect(geometry.itemsLeft).toBeCloseTo(11 / 147, 2)
  expect(geometry.itemsTop).toBeCloseTo(30 / 147, 2)
  expect(geometry.itemsWidth).toBeCloseTo(125 / 147, 2)
  expect(geometry.iconCenterOffset).toBeCloseTo(-geometry.iconSlotWidth * .02, 0)
  expect(geometry.iconWidth).toBeCloseTo(geometry.iconHeight, 2)
  expect(geometry.iconWidth).toBeCloseTo(48, 1)
  expect(geometry.iconWidth).toBeLessThanOrEqual(geometry.itemsWidth * geometry.bookWidth / 5)
  expect(geometry.searchLeft).toBeCloseTo(22 / 147, 2)
  expect(geometry.searchTop).toBeCloseTo(7 / 147, 2)
  expect(geometry.pagerLeft).toBeCloseTo(8 / 147, 2)
  expect(geometry.pagerRight).toBeCloseTo(8 / 147, 2)
  expect(geometry.hasStackText).toBe(false)
  expect(geometry.itemButtonBackground).toBe('rgba(0, 0, 0, 0)')

  await page.getByRole('searchbox', { name: 'recipe book search' }).fill('no-matching-item')
  const emptyState = page.getByText('no craftable items match this search')
  await expect(emptyState).toBeVisible()
  await expect(emptyState).toHaveCSS('font-weight', '400')
  await expect(emptyState).toHaveCSS('font-family', /Monocraft/)
})
