import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'

test('image tool moves through entry, workspace, output and reset without persisting its file', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/tools/resize-image')
  const journey = page.locator('.tool-journey')
  await expect(journey).toHaveAttribute('data-stage', '1')
  await expect(page.getByLabel('Width (px)')).toBeHidden()
  await page.locator('input[type=file]').setInputFiles(resolve('tests/fixtures/sample.png'))
  await expect(journey).toHaveAttribute('data-stage', '2')
  await page.getByLabel('Width (px)').fill('120')
  await page.getByRole('button', { name: 'Process image', exact: true }).click()
  await expect(journey).toHaveAttribute('data-stage', '3')
  await expect(page.getByRole('button', { name: /Save to Encrypted Vault/ })).toBeVisible()
  await page.getByRole('button', { name: 'Back to workspace' }).click()
  await expect(journey).toHaveAttribute('data-stage', '2')
  await page.getByRole('button', { name: 'Start over', exact: true }).click()
  await expect(page.locator('.tool-journey')).toHaveAttribute('data-stage', '1')
  expect(errors).toEqual([])
})

test('scanner camera is primary, import is secondary and mobile entry does not overflow', async ({ page }) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/tools/scan-document')
    const camera = page.getByRole('button', { name: /Open Camera \/ Scan Document/ })
    await expect(camera).toBeVisible()
    await expect(page.getByLabel('Scan filter')).toBeHidden()
    const gallery = page.getByText('Import from Gallery / Files', { exact: true })
    expect((await camera.boundingBox())!.y).toBeLessThan((await gallery.boundingBox())!.y)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  }
})

test('global vault bridge opens unlock flow without writing plaintext', async ({ page }) => {
  await page.goto('/tools/resize-image')
  await page.evaluate(() => window.VaultBridge.saveFile(new Blob(['SYNTHETIC_NOTE_123'], { type: 'text/plain' }), 'synthetic-note.txt', 'Scanned Docs'))
  const dialog = page.getByRole('dialog', { name: 'Save to Encrypted Vault' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Master password or PIN', { exact: true })).toBeVisible()
  const stored = await page.evaluate(() => JSON.stringify(localStorage))
  expect(stored).not.toContain('SYNTHETIC_NOTE_123')
  await dialog.getByRole('button', { name: 'Close dialog' }).click()
})
