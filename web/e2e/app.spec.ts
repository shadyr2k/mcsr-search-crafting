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

async function expectFluidLayout(page: import('@playwright/test').Page) {
  const measurements = await page.locator('html').evaluate(() => {
    const elements = document.querySelectorAll<HTMLElement>([
      '.app-header',
      '.workspace-grid',
      '.item-set-workspace',
      '.language-selector',
      '.results-column',
      '.language-info-panel',
      '.site-info-panel',
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

    await page.getByRole('button', { name: 'site info' }).click()
    const siteInfo = page.locator('.site-info-panel')
    await expect(siteInfo).toBeVisible()
    const siteInfoHeight = await siteInfo.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }))
    expect(siteInfoHeight.scrollHeight).toBeLessThanOrEqual(siteInfoHeight.clientHeight)
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
