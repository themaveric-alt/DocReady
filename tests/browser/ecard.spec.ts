import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import JSZip from 'jszip'
import {
  decodePDFRawStream,
  PDFArray,
  PDFDocument,
  PDFRawStream,
} from 'pdf-lib'
import { mmToPoints } from '../../src/features/e-card-studio/printLayout'

const fixture = (name: string) => resolve('tests/fixtures/ecard', name)
const route = '/tools/e-card-cutter'
const selector = '.ecard-card'
async function select(page: Page, ...files: string[]) {
  await page
    .getByLabel('Drop card files here')
    .setInputFiles(files.map(fixture))
}
async function viaButton(page: Page, button: string, file: string) {
  const chosen = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: button, exact: true }).click()
  await (await chosen).setFiles(fixture(file))
}
async function downloaded(page: Page, button: Locator) {
  const event = page.waitForEvent('download')
  await button.click()
  const file = await event
  return {
    name: file.suggestedFilename(),
    bytes: await readFile((await file.path())!),
  }
}
function pdfButton(page: Page) {
  return page.getByRole('button', { name: 'Download PDF', exact: true })
}
async function confirm(page: Page) {
  const action = page.getByRole('button', {
    name: 'Confirm crops and sides',
    exact: true,
  })
  if (await action.isVisible()) await action.click()
  await expect(pdfButton(page)).toBeEnabled()
}
async function pdfDownload(page: Page) {
  const file = await downloaded(page, pdfButton(page))
  expect(file.name).toBe(await page.getByLabel('Output filename').inputValue())
  return PDFDocument.load(file.bytes)
}
function content(pdf: PDFDocument, index = 0) {
  const page = pdf.getPage(index)
  const contents = page.node.Contents()
  const streams =
    contents instanceof PDFArray
      ? contents.asArray().map((i) => pdf.context.lookup(i))
      : [contents]
  return streams
    .map((s) =>
      s instanceof PDFRawStream
        ? Buffer.from(decodePDFRawStream(s).decode()).toString()
        : '',
    )
    .join('\n')
}
function transforms(text: string) {
  return [...text.matchAll(/^([\d.]+) 0 0 ([\d.]+) 0 0 cm$/gm)]
    .map((m) => [Number(m[1]), Number(m[2])])
    .filter(([w, h]) => w > 5 && h > 5)
}
async function rasterSize(page: Page, bytes: Buffer, type: string) {
  return page.evaluate(
    async ({ data, type }) => {
      const decoded = atob(data)
      const bmp = await createImageBitmap(
        new Blob([Uint8Array.from(decoded, (c) => c.charCodeAt(0))], { type }),
      )
      const size = [bmp.width, bmp.height]
      bmp.close()
      return size
    },
    { data: bytes.toString('base64'), type },
  )
}

test.beforeEach(async ({ page }) => {
  await page.goto(route)
  await page.getByRole('button', { name: /Other \/ Custom E-Card/ }).click()
  await expect(
    page.getByRole('heading', { name: 'AI E-Card Cutter' }),
  ).toBeVisible()
})
test('detects two PDF regions, prints one precise A4 sheet and excludes outside text', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await select(page, 'two-sides.pdf')
  await expect(page.locator(selector)).toHaveCount(2)
  await expect(page.getByText('High-confidence side suggestion')).toHaveCount(2)
  await expect(page.getByAltText('Front print placement')).toBeVisible()
  await expect(page.getByAltText('Back print placement')).toBeVisible()
  const pdf = await pdfDownload(page)
  expect(pdf.getPageCount()).toBe(1)
  expect(pdf.getPage(0).getWidth()).toBeCloseTo(mmToPoints(210), 5)
  expect(pdf.getPage(0).getHeight()).toBeCloseTo(mmToPoints(297), 5)
  const placements = transforms(content(pdf))
  expect(placements).toHaveLength(2)
  for (const [width, height] of placements) {
    expect(width).toBeCloseTo(mmToPoints(85.6), -1)
    expect(height).toBeCloseTo(mmToPoints(53.98), -1)
  }
  expect(content(pdf)).not.toContain('Synthetic workflow fixture')
  await page
    .getByRole('heading', { name: 'Print preview' })
    .scrollIntoViewIfNeeded()
  if (process.env.DOCREADY_QA_SCREENSHOTS)
    await page.screenshot({
      path: info.outputPath('ecard-desktop.png'),
      fullPage: true,
    })
  expect(errors).toEqual([])
})
test('loads separate images with front and back controls, swaps and makes exact duplex pages', async ({
  page,
}) => {
  await viaButton(page, 'Add Front', 'front.png')
  await expect(page.locator(selector)).toHaveCount(1)
  await viaButton(page, 'Add Back', 'back.png')
  await expect(page.locator(selector)).toHaveCount(2)
  const sides = () =>
    page.locator(selector).locator('header strong').allTextContents()
  expect(await sides()).toEqual(['Front', 'Back'])
  await page.getByRole('button', { name: 'Swap Sides' }).click()
  expect(await sides()).toEqual(['Back', 'Front'])
  await page.getByRole('button', { name: 'Duplex', exact: true }).click()
  await page.getByLabel('Horizontal alignment').selectOption('left')
  await page.getByLabel('Duplex flip edge').selectOption('short')
  await page.getByLabel('Vertical alignment').selectOption('top')
  await confirm(page)
  const pdf = await pdfDownload(page)
  expect(pdf.getPageCount()).toBe(2)
  expect(transforms(content(pdf, 0))).toHaveLength(1)
  expect(transforms(content(pdf, 1))).toHaveLength(1)
})
test('detects stacked cards, suggests sides with local OCR and writes a 300 DPI PNG', async ({
  page,
}) => {
  await select(page, 'stack.png')
  await expect(page.locator(selector)).toHaveCount(2)
  await expect(pdfButton(page)).toBeDisabled()
  await page
    .getByText('Check side suggestions with local OCR', { exact: true })
    .click()
  await page.getByRole('button', { name: 'Check side clues' }).click()
  await expect(page.getByText('High-confidence side suggestion')).toHaveCount(2)
  await page.getByRole('button', { name: 'Top & bottom', exact: true }).click()
  await page.getByLabel('Export format').selectOption('png')
  await page.getByRole('button', { name: 'Prepare selected export' }).click()
  const image = await downloaded(
    page,
    page.getByRole('button', { name: 'Download docready-sheet-1.png' }),
  )
  expect(await rasterSize(page, image.bytes, 'image/png')).toEqual([2480, 3508])
  const metadata = image.bytes.indexOf('pHYs')
  expect(image.bytes.readUInt32BE(metadata + 4)).toBe(11811)
})
test('mobile crop correction handles a faint single side and downloads a 600 DPI printable PDF', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 360, height: 760 })
  await select(page, 'faint.png')
  const editor = page.getByRole('dialog', { name: 'Adjust four-corner crop' })
  await expect(editor).toBeVisible()
  const handle = editor.getByRole('button', { name: 'Top left crop corner' })
  await handle.focus()
  await handle.press('ArrowRight')
  await handle.press('ArrowDown')
  await editor.getByRole('button', { name: 'Rotate 90°' }).click()
  await editor.getByRole('button', { name: 'Apply crop' }).click()
  await expect(page.locator(selector)).toHaveCount(1)
  await expect(
    page.getByText('Please confirm which side is Front and which is Back.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Single card', exact: true }).click()
  await page.getByLabel('Print resolution').selectOption('600')
  await expect(page.getByText(/Below 600 DPI/)).toBeVisible()
  await confirm(page)
  await expect(page.getByAltText('Back print placement')).toHaveCount(0)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360)
  if (process.env.DOCREADY_QA_SCREENSHOTS)
    await page.screenshot({
      path: info.outputPath('ecard-mobile.png'),
      fullPage: true,
    })
  expect((await pdfDownload(page)).getPageCount()).toBe(1)
})
test('unlocks a synthetic encrypted PDF after an incorrect local attempt and transmits no private data', async ({
  page,
  context,
}) => {
  const requests: { url: string; method: string; body: string | null }[] = []
  context.on('request', (r) =>
    requests.push({ url: r.url(), method: r.method(), body: r.postData() }),
  )
  await select(page, 'locked.pdf')
  const secret = page.getByLabel('PDF password')
  await expect(secret).toBeVisible()
  await expect(page.getByRole('dialog').getByText('by Trenish')).toBeVisible()
  await secret.fill('intentional-incorrect')
  await page.getByRole('button', { name: 'Open PDF', exact: true }).click()
  await expect(page.getByText('Incorrect password. Try again.')).toBeVisible()
  await secret.fill('local-test-password')
  await page.getByRole('button', { name: 'Open PDF', exact: true }).click()
  await expect(page.locator(selector)).toHaveCount(2)
  await confirm(page)
  expect((await pdfDownload(page)).getPageCount()).toBe(1)
  expect(
    requests
      .filter((r) => r.url.startsWith('http'))
      .every(
        (r) =>
          r.method === 'GET' &&
          !r.body &&
          new URL(r.url).origin === new URL(page.url()).origin,
      ),
  ).toBe(true)
  expect(JSON.stringify(requests)).not.toMatch(
    /local-test-password|intentional-incorrect|locked\.pdf|Private Sample E-42/,
  )
  const persisted = await page.evaluate(async () => ({
    storage: [JSON.stringify(localStorage), JSON.stringify(sessionStorage)],
    db: (await indexedDB.databases()).map((d) => d.name),
    cached: (
      await Promise.all(
        (await caches.keys()).map(async (c) =>
          (await (await caches.open(c)).keys()).map((r) => r.url),
        ),
      )
    ).flat(),
  }))
  expect(JSON.stringify(persisted)).not.toMatch(
    /local-test-password|intentional-incorrect|locked\.pdf|Private Sample E-42|blob:/,
  )
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await page.getByRole('button', { name: 'Clear workspace' }).click()
  await expect(page.locator(selector)).toHaveCount(0)
  await expect(page.getByText('locked.pdf', { exact: true })).toHaveCount(0)
})
test('packs a batch, rejects overlapping custom placements and exports a real ZIP with its cropped PNGs', async ({
  page,
}) => {
  await select(page, 'two-sides.pdf', 'front.png', 'back.png', 'stack.png')
  await expect(page.locator(selector)).toHaveCount(6)
  await confirm(page)
  await page
    .getByRole('button', { name: 'Multiple cards', exact: true })
    .click()
  await expect(page.locator('.ecard-paper-card')).toHaveCount(6)
  await page
    .getByRole('button', { name: 'Custom position', exact: true })
    .click()
  const frontX = page.getByLabel('Front X (mm)', { exact: true })
  await frontX.fill('80')
  await expect(page.getByText(/Two cards overlap/)).toBeVisible()
  await page.getByRole('button', { name: 'Restore aligned positions' }).click()
  await page
    .getByRole('button', { name: 'Multiple cards', exact: true })
    .click()
  await page.getByLabel('Export format').selectOption('zip')
  await page.getByRole('button', { name: 'Prepare selected export' }).click()
  const bundled = await downloaded(
    page,
    page.getByRole('button', { name: 'Download docready-card-studio.zip' }),
  )
  const zip = await JSZip.loadAsync(bundled.bytes)
  expect(Object.keys(zip.files).sort()).toEqual([
    'docready-back.png',
    'docready-card-1.png',
    'docready-card-2.png',
    'docready-card-3.png',
    'docready-card-4.png',
    'docready-card-print.pdf',
    'docready-front.png',
  ])
  const pdf = await PDFDocument.load(
    await zip.file('docready-card-print.pdf')!.async('uint8array'),
  )
  expect(transforms(content(pdf))).toHaveLength(6)
  const back = await zip.file('docready-back.png')!.async('nodebuffer')
  const [w, h] = await rasterSize(page, back, 'image/png')
  expect(w / h).toBeCloseTo(85.6 / 53.98, 1)
})
test('keeps a whole eligible PDF as a vector and opens the print action', async ({
  page,
}) => {
  await select(page, 'full-page.pdf')
  const editor = page.getByRole('dialog', { name: 'Adjust four-corner crop' })
  await expect(editor).toBeVisible()
  await editor.getByRole('button', { name: 'Use whole source' }).click()
  await editor.getByRole('button', { name: 'Apply crop' }).click()
  await confirm(page)
  const pdf = await pdfDownload(page)
  expect(pdf.getPage(0).node.Resources()?.toString()).toMatch(/EmbeddedPdfPage/)
  const popupEvent = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Print', exact: true }).click()
  const popup = await popupEvent
  await expect(
    popup.getByRole('heading', { name: 'DocReadyApp print preview' }),
  ).toBeVisible()
  await expect(popup.getByText('by Trenish', { exact: true })).toBeVisible()
  await expect(popup.locator('footer')).toHaveText(
    '© 2026 DocReady • Crafted & Engineered by Trenish',
  )
  await popup.emulateMedia({ media: 'print' })
  await expect(popup.locator('footer')).toBeHidden()
  await popup.emulateMedia({ media: 'screen' })
  await expect(popup.locator('.sheet')).toHaveAttribute(
    'style',
    /width: 210mm; height: 297mm/,
  )
  await popup.evaluate(() => {
    window.print = () =>
      document.body.setAttribute('data-print-requested', 'yes')
  })
  await popup.getByRole('button', { name: 'Print sheets' }).click()
  await expect(popup.locator('body')).toHaveAttribute(
    'data-print-requested',
    'yes',
  )
  await popup.close()
})
test('processes and exports a perspective card offline after loading the static detector', async ({
  page,
  context,
}) => {
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true)
  await select(page, 'skew.png')
  await expect(page.locator(selector)).toHaveCount(1)
  await expect(page.getByText('Side unknown', { exact: true })).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (
          await Promise.all(
            (await caches.keys()).map(async (c) =>
              (await (await caches.open(c)).keys()).some((r) =>
                r.url.includes('/cardDetection.worker-'),
              ),
            ),
          )
        ).some(Boolean),
      ),
    )
    .toBe(true)
  await context.setOffline(true)
  await page.reload()
  await select(page, 'skew.png')
  await expect(page.getByText('Side unknown', { exact: true })).toBeVisible()
  await confirm(page)
  expect((await pdfDownload(page)).getPageCount()).toBe(1)
})
test('captures a frame from a simulated camera only after explicit interaction', async ({
  page,
}) => {
  await expect(page.getByLabel('Live card camera preview')).toHaveCount(0)
  await page.getByRole('button', { name: 'Camera', exact: true }).click()
  const camera = page.getByRole('dialog', { name: 'Capture a card photo' })
  await camera.getByRole('button', { name: 'Capture photo' }).click()
  await expect(camera).toHaveCount(0)
  await expect(page.locator(selector).locator('small').first()).toHaveText(
    'camera-card.jpg',
  )
})

test('adds a second manual crop from an existing source and reuses a custom size', async ({
  page,
}) => {
  await select(page, 'faint.png')
  const editor = page.getByRole('dialog', { name: 'Adjust four-corner crop' })
  await editor.getByRole('button', { name: 'Apply crop' }).click()
  await page.getByRole('button', { name: 'Add crop from source' }).click()
  await editor.getByRole('button', { name: 'Apply crop' }).click()
  await expect(page.locator(selector)).toHaveCount(2)
  await confirm(page)
  await page.getByLabel('Physical card size').selectOption('custom')
  await page
    .getByLabel('Lock custom sizing to the crop’s aspect ratio')
    .uncheck()
  await page.getByLabel('Card width (mm)', { exact: true }).fill('80')
  await page.getByLabel('Card height (mm)', { exact: true }).fill('48')
  await page.getByRole('button', { name: 'Save size for this session' }).click()
  await page.getByLabel('Physical card size').selectOption('id1')
  await page.getByLabel('Saved size presets').selectOption('0')
  await expect(page.getByLabel('Card width (mm)', { exact: true })).toHaveValue(
    '80',
  )
  await page.getByLabel('Export format').selectOption('jpeg')
  await page.getByRole('button', { name: 'Prepare selected export' }).click()
  const jpeg = await downloaded(
    page,
    page.getByRole('button', { name: 'Download docready-sheet-1.jpg' }),
  )
  expect([...jpeg.bytes.subarray(0, 3)]).toEqual([255, 216, 255])
  expect(await rasterSize(page, jpeg.bytes, 'image/jpeg')).toEqual([2480, 3508])
})
