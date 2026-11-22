import { expect, test, type Locator } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const credit = '© 2026 DocReady • Crafted & Engineered by Trenish'

async function checkLockup(brand: Locator, header: Locator) {
  await expect(brand.locator('.brand-subtitle')).toHaveText('by Trenish')
  await expect(brand.locator('.brand-name')).toHaveText('DocReadyApp')
  const measurements = await brand.evaluate((node) => {
    const title = node.querySelector('.brand-name')!
    const byline = node.querySelector('.brand-subtitle')!
    const lockup = node.querySelector('.brand-lockup')!
    const name = title.getBoundingClientRect(),
      sub = byline.getBoundingClientRect()
    const style = getComputedStyle(byline)
    return {
      stacked: name.bottom <= sub.top && name.left === sub.left,
      ratio: parseFloat(style.lineHeight) / parseFloat(style.fontSize),
      textFits: lockup.scrollWidth <= lockup.clientWidth,
    }
  })
  expect(measurements.stacked).toBe(true)
  expect(measurements.textFits).toBe(true)
  expect(measurements.ratio).toBeCloseTo(1.1, 2)
  const [logoBox, headerBox] = await Promise.all([
    brand.boundingBox(),
    header.boundingBox(),
  ])
  expect(logoBox!.y - headerBox!.y).toBeGreaterThanOrEqual(7)
  expect(
    headerBox!.y + headerBox!.height - logoBox!.y - logoBox!.height,
  ).toBeGreaterThanOrEqual(7)
}

test('mobile landing and workspace logos fit, align, and stay visible while scrolling', async ({
  page,
}) => {
  for (const width of [320, 360, 390, 430, 600, 650, 768]) {
    await page.setViewportSize({ width, height: 720 })
    for (const route of ['/', '/workspace']) {
      await page.goto(route)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const landing = route === '/'
      const header = page.locator(landing ? '.site-head' : '.topbar')
      const brand = header.locator('.brand')
      const toggle = header.getByRole('button', {
        name: landing ? 'Open menu' : 'Open workspace navigation',
      })
      await checkLockup(brand, header)
      const logo = (await brand.boundingBox())!
      const menu = (await toggle.boundingBox())!
      const actions = (await header
        .locator(landing ? '.dr-actions' : '.top-actions')
        .boundingBox())!
      expect(
        Math.abs(logo.y + logo.height / 2 - menu.y - menu.height / 2),
      ).toBeLessThanOrEqual(1)
      expect(menu.width).toBeGreaterThanOrEqual(44)
      expect(actions.x + actions.width).toBeLessThanOrEqual(width)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width)
      await page.evaluate(() =>
        window.scrollTo({ top: 460, behavior: 'instant' }),
      )
      await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBeGreaterThan(40)
      await expect
        .poll(async () => (await header.boundingBox())!.y)
        .toBeCloseTo(0, 0)
      await checkLockup(brand, header)
    }
  }
  await page.goto('/')
  for (const width of [880, 881, 1040, 1041, 1100, 1101, 1280, 1440]) {
    await page.setViewportSize({ width, height: 850 })
    const header = page.locator('.site-head')
    await checkLockup(header.locator('.brand'), header)
    const actions = (await header.locator('.dr-actions').boundingBox())!
    expect(actions.x + actions.width).toBeLessThanOrEqual(width)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
  }
})

test('mobile drawer keeps its branded header and routes into workspace navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 540 })
  await page.goto('/')
  const head = page.locator('.site-head')
  await head.getByRole('button', { name: 'Open menu' }).click()
  const siteDrawer = page.getByRole('dialog', { name: 'Menu' })
  await expect(siteDrawer.getByRole('navigation', { name: 'Mobile site navigation' })).toBeVisible()
  await checkLockup(siteDrawer.locator('.dialog-header .brand'), siteDrawer.locator('.dialog-header'))
  await siteDrawer.getByRole('link', { name: 'Open Workspace' }).click()
  await page
    .getByRole('button', { name: 'Open workspace navigation' })
    .click()
  const drawer = page.getByRole('dialog', { name: 'Workspace navigation' })
  const header = drawer.locator('.dialog-header')
  await checkLockup(header.locator('.brand'), header)
  const before = (await header.boundingBox())!.y
  await drawer.evaluate((node) =>
    node.scrollTo({ top: node.scrollHeight, behavior: 'instant' }),
  )
  await expect
    .poll(async () => (await header.boundingBox())!.y)
    .toBeCloseTo(before, 0)
  await checkLockup(header.locator('.brand'), header)
  await drawer.getByRole('button', { name: 'Close dialog' }).click()
  await expect(drawer).toHaveCount(0)
})

test('creator footer and logo work across desktop routes in both navigation themes', async ({
  page,
}) => {
  for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width: 1280, height: 850 })
    await page.goto('/settings')
    await page.getByLabel('Navigation theme').selectOption(theme)
    await page.getByRole('button', { name: 'Save preferences' }).click()
    for (const route of [
      '/',
      '/workspace',
      '/tools/scan-document',
      '/printdesk',
      '/privacy',
      '/settings',
    ]) {
      await page.goto(route)
      await expect(page.locator('html')).toHaveAttribute(
        'data-theme',
        theme,
      )
      const footer = page.getByRole('contentinfo')
      await expect(footer.locator('.creator-credit')).toHaveText(credit)
      await expect(footer.locator('.creator-credit strong')).toHaveText(
        'Trenish',
      )
      await expect(footer).toHaveCSS(
        'background-color',
        theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(26, 32, 48)',
      )
      await expect(
        page.locator(
          route === '/'
            ? '.site-head .brand-subtitle'
            : '.sidebar .brand-subtitle',
        ),
      ).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(1280)
    }
    const footerContrast = await new AxeBuilder({ page })
      .include('.site-footer')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(footerContrast.violations).toEqual([])
    await page.setViewportSize({ width: 390, height: 844 })
    await page
      .getByRole('button', { name: 'Open workspace navigation' })
      .click()
    await expect(
      page.getByRole('dialog').locator('.brand-subtitle'),
    ).toBeVisible()
    const results = await new AxeBuilder({ page })
      .include('.workspace-menu')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(results.violations).toEqual([])
    await page.screenshot({
      path: 'test-results/screenshots/branding-mobile-' + theme + '.png',
    })
    await page.getByRole('button', { name: 'Close dialog' }).click()
  }
})

test('the initial loading screen carries the byline', async ({ page }) => {
  await page.route('**/assets/index-*.js', (route) => route.abort())
  await page.goto('/')
  await expect(page.locator('.app-boot .brand-subtitle')).toBeVisible()
  await expect(page.locator('.app-boot')).toContainText(
    'Loading workspace…',
  )
})
