import { expect, test } from '@playwright/test'

test('intro completes at five seconds and restores the page', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  await expect(page.locator('.brand-splash')).toBeVisible()
  await expect(page.locator('#app-surface')).toHaveAttribute('inert', '')
  await page.clock.fastForward(4300)
  await expect(page.locator('.brand-splash')).toHaveCount(1)
  await page.clock.fastForward(700)
  await expect(page.locator('.brand-splash')).toHaveCount(0)
  await expect(page.locator('#app-surface')).not.toHaveAttribute('inert', '')
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
})

test('skip and category filtering work on a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 })
  await page.goto('/')
  await page.getByRole('button', { name: 'DocReady introduction. Click to skip' }).click()
  await expect(page.locator('.brand-splash')).toHaveCount(0)
  await expect(page.locator('.home-flagships > a')).toHaveCount(3)
  await expect(page.locator('.daily-strip > a')).toHaveCount(6)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.getByRole('button', { name: 'Convert', exact: true }).click()
  await expect(page.locator('#suite-results > section')).toHaveCount(2)
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect(page.locator('#suite-results > section')).toHaveCount(7)
})
