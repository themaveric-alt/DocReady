import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('core pages and mobile command dialog pass automated WCAG checks', async ({
  page,
}) => {
  test.setTimeout(60_000)
  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
  const failures = []
  async function check(route: string) {
    const results = await new AxeBuilder({ page }).withTags(tags).analyze()
    failures.push(
      ...results.violations.map((v) => ({
        route,
        id: v.id,
        targets: v.nodes.map((n) => ({
          target: n.target,
          detail: n.failureSummary,
        })),
      })),
    )
  }
  for (const target of [
    '/',
    '/workspace',
    '/tools/resize-image',
    '/tools/e-card-cutter',
    '/tools/unlock-pdf',
    '/tools/ocr',
    '/tools/remove-background',
    '/tools/encrypted-vault',
    '/application-ready',
    '/printdesk',
    '/tools/document-doctor',
    '/tools/smart-application-pack',
    '/tools/workflow-automation',
    '/tools/bilingual-composer',
    '/tools/smart-form-assistant',
    '/settings',
  ]) {
    await page.goto(target)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('main .skeleton')).toHaveCount(0)
    await check(target)
  }
  await page.setViewportSize({ width: 360, height: 800 })
  await page.getByRole('button', { name: /Search tools/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await check('Mobile command dialog')
  expect(failures).toEqual([])
})
