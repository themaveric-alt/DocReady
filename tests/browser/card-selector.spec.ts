import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'

test('card selector exposes eight offline SVG choices before upload', async ({ page }) => {
  await page.goto('/tools/e-card-cutter')
  const selector = page.getByRole('group', { name: 'Government e-card type' })
  await expect(selector.getByRole('button')).toHaveCount(8)
  await expect(page.getByLabel('Drop card files here')).toHaveCount(0)
  await selector.getByRole('button', { name: /e-PAN Card/ }).click()
  await expect(selector.getByRole('button', { name: /e-PAN Card/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Drop card files here')).toHaveCount(1)
  expect(await selector.locator('img').count()).toBe(0)
  await page.getByLabel('Drop card files here').setInputFiles(resolve('tests/fixtures/ecard/two-sides.pdf'))
  // Review/detection must not fabricate a second side when a fixture has one.
  await expect(page.locator('.ecard-card').first()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByLabel('Output filename')).toHaveValue(/^PAN_Card_\d{4}-\d{2}-\d{2}\.pdf$/)
  await expect(page.getByRole('button', { name: 'Front & Back JPG', exact: true })).toBeVisible()
})
