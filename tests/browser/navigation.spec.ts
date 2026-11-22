import { expect, test } from '@playwright/test'

test('header consolidates PDF links and opens all seven categories with keyboard dismissal', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  await expect(nav.getByRole('button', { name: 'PDF Tools', exact: true })).toHaveCount(1)
  await expect(nav.getByText('Browse PDF tools')).toHaveCount(0)
  await nav.getByRole('button', { name: 'PDF Tools', exact: true }).click()
  const menu = page.locator('#header-pdf-tools')
  await expect(menu.getByRole('heading')).toHaveCount(7)
  await expect(menu.getByRole('link')).toHaveCount(32)
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await nav.getByRole('button', { name: 'Image & Scan' }).click()
  await expect(page.locator('#header-image-tools').getByRole('link')).toHaveCount(4)
})

test('navbar stays within viewport and mobile drawer closes after selecting a tool', async ({ page }) => {
  for (const width of [320, 390, 768, 1024, 1025, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await expect(page.locator('.dr-bar .brand-subtitle')).toBeVisible()
    if (width <= 1024) {
      await page.getByRole('button', { name: 'Open menu', exact: true }).click()
      const drawer = page.getByRole('dialog')
      await expect(drawer.locator('.brand-subtitle')).toBeVisible()
      await drawer.locator('summary').filter({ hasText: /^Image & Scan/ }).click()
      await drawer.getByRole('link', { name: 'Multiple ID Cards Print' }).click()
      await expect(page).toHaveURL(/e-card-cutter/)
      await expect(page.getByRole('dialog')).toHaveCount(0)
    } else await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  }
})
