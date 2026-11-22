import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createCanvas } from '@napi-rs/canvas'
import decodeQR from 'jsqr'
import { degrees, PDFDocument, PDFName, StandardFonts, rgb } from 'pdf-lib'
import { mmToPoints } from '../../src/features/e-card-studio/printLayout'

const W = mmToPoints(210),
  H = mmToPoints(297)
const cw = mmToPoints(85.6),
  ch = mmToPoints(53.98)
const red = rgb(0.83, 0.13, 0.2),
  blue = rgb(0.08, 0.3, 0.79)
const green = rgb(0.11, 0.74, 0.21),
  black = rgb(0.1, 0.1, 0.1)
const cards = '.ecard-card'
const download = (page: Page) =>
  page.getByRole('button', { name: 'Download PDF', exact: true })
const ready = (page: Page) =>
  page.getByText('Your Card Is Ready to Print', { exact: true })
// QR version 1, error correction M, containing only the fictional QA payload.
const testQR = [
  '111111101010001111111',
  '100000101000101000001',
  '101110100100001011101',
  '101110101110101011101',
  '101110100110001011101',
  '100000100010001000001',
  '111111101010101111111',
  '000000001100000000000',
  '101101110110001001011',
  '001111000010100001110',
  '111100111010100101001',
  '100010011110100001011',
  '000010110001000100010',
  '000000001000010100100',
  '111111101110011110111',
  '100000101011101010001',
  '101110100101001111111',
  '101110101010010110010',
  '101110101111000000100',
  '100000100001101111000',
  '111111101101110011010',
]
type Layout =
  'pair' | 'borderless' | 'split' | 'single' | 'blank' | 'rotated' | 'scan'

async function fixture(kind: Layout) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  function sheet() {
    const page = doc.addPage([W, H])
    page.drawText('Synthetic e-Aadhaar test page with fictional content', {
      x: 40,
      y: H - 65,
      size: 16,
      font,
    })
    page.drawRectangle({
      x: 20,
      y: 249,
      width: W - 40,
      height: H - 343,
      borderColor: black,
      borderWidth: 1.4,
    })
    page.drawRectangle({ x: 64, y: 495, width: 75, height: 42, color: green })
    page.drawText(
      'Instructions only. Please keep the complete original file.',
      { x: 50, y: 567, size: 13, font },
    )
    return page
  }
  function face(
    page: ReturnType<typeof sheet>,
    side: 'front' | 'back',
    x: number,
    y: number,
    border = true,
  ) {
    if (border)
      page.drawRectangle({
        x,
        y,
        width: cw,
        height: ch,
        borderColor: black,
        borderWidth: 0.85,
      })
    const color = side === 'front' ? red : blue
    page.drawRectangle({
      x: x + 12,
      y: y + ch - 25,
      width: cw - 24,
      height: 10,
      color,
    })
    page.drawRectangle({ x: x + 18, y: y + 47, width: 42, height: 59, color })
    page.drawText(
      side === 'front'
        ? 'Front side · Aadhaar sample'
        : 'Back side · Aadhaar sample',
      { x: x + 71, y: y + 99, font, size: 10 },
    )
    page.drawText(
      side === 'front' ? 'DOB test · Gender test' : 'Address: test location',
      { x: x + 71, y: y + 79, font, size: 10 },
    )
    page.drawText('Synthetic credential artwork', {
      x: x + 71,
      y: y + 60,
      font,
      size: 9,
    })
    page.drawText('FICTIONAL TEST CONTENT', {
      x: x + 13,
      y: y + 21,
      font,
      size: 9,
    })
    if (side === 'back') {
      for (const [row, modules] of testQR.entries())
        for (const [column, value] of [...modules].entries())
          if (value === '1')
            page.drawRectangle({
              x: x + cw - 57 + column * 2,
              y: y + 12 + (20 - row) * 2,
              width: 2,
              height: 2,
              color: black,
            })
    }
  }
  const one = sheet()
  if (kind === 'rotated') {
    one.setMediaBox(-20, -30, W + 60, H + 80)
    one.setCropBox(12, 19, W, H)
    one.setRotation(degrees(90))
    face(one, 'front', 64, 65)
    face(one, 'back', 312, 65)
  } else if (kind === 'split') {
    face(sheet(), 'back', 170, 55)
    face(sheet(), 'front', 170, 62)
  } else if (kind !== 'blank') {
    if (kind === 'borderless') {
      one.drawLine({
        start: { x: 35, y: 214 },
        end: { x: W - 35, y: 214 },
        thickness: 1,
        color: black,
        dashArray: [8, 2],
      })
    }
    face(
      one,
      kind === 'scan' ? 'back' : 'front',
      38,
      50,
      kind !== 'borderless',
    )
    if (kind !== 'single')
      face(
        one,
        kind === 'scan' ? 'front' : 'back',
        316,
        50,
        kind !== 'borderless',
      )
  }
  if (kind === 'scan') {
    const bmp = await render(await doc.save(), 1, 1.65)
    const scan = await PDFDocument.create()
    scan
      .addPage([W, H])
      .drawImage(await scan.embedPng(bmp.toBuffer('image/png')), {
        x: 0,
        y: 0,
        width: W,
        height: H,
      })
    return scan.save()
  }
  return doc.save()
}

async function render(bytes: Uint8Array, index: number, scale = 1.4) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl:
      process.cwd() + '/node_modules/pdfjs-dist/standard_fonts/',
  })
  const document = await task.promise
  try {
    const page = await document.getPage(index)
    const viewport = page.getViewport({ scale })
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    )
    await page.render({ canvas, viewport }).promise
    return canvas
  } finally {
    await task.destroy()
  }
}

function colors(canvas: Awaited<ReturnType<typeof render>>) {
  const pixels = canvas
    .getContext('2d')
    .getImageData(0, 0, canvas.width, canvas.height).data
  const counts = { red: 0, blue: 0, green: 0, dark: 0 }
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]]
    if (r > 135 && g < 105 && b < 100) counts.red++
    if (b > 125 && r < 100 && g < 130) counts.blue++
    if (g > 135 && r < 110 && b < 110) counts.green++
    if (Math.max(r, g, b) < 75) counts.dark++
  }
  return counts
}

async function upload(page: Page, kind: Layout) {
  await page.goto('/tools/e-card-cutter')
  await page.getByRole('button', { name: /e-Aadhaar Card/ }).click()
  await page.getByLabel('Drop card files here').setInputFiles({
    name: 'fictional-layout.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await fixture(kind)),
  })
}
async function exportPDF(page: Page) {
  const [result] = await Promise.all([
    page.waitForEvent('download'),
    download(page).click(),
  ])
  return readFile((await result.path())!)
}
async function review(page: Page) {
  const confirm = page.getByRole('button', {
    name: 'Confirm crops and sides',
  })
  await expect(ready(page).or(confirm)).toBeVisible()
  if (await confirm.isVisible()) await confirm.click()
  await expect(ready(page)).toBeVisible()
}
async function pvc(page: Page) {
  await page
    .getByRole('button', { name: 'PVC Card — Actual Size', exact: true })
    .click()
  return exportPDF(page)
}
async function checkPair(bytes: Buffer) {
  const doc = await PDFDocument.load(bytes)
  expect(doc.getPageCount()).toBe(2)
  for (const page of doc.getPages()) {
    expect(page.getWidth()).toBeCloseTo(cw, 7)
    expect(page.getHeight()).toBeCloseTo(ch, 7)
    expect(
      page.node.Resources()!.lookup(PDFName.of('XObject')).toString(),
    ).toContain('Image')
  }
  const front = colors(await render(bytes, 1))
  const reverse = await render(bytes, 2, 2)
  const back = colors(reverse)
  expect(front.red).toBeGreaterThan(1000)
  expect(front.blue).toBe(0)
  expect(back.blue).toBeGreaterThan(1000)
  expect(back.red).toBe(0)
  expect(front.green + back.green).toBe(0)
  expect(back.dark).toBeGreaterThan(350)
  const pixels = reverse
    .getContext('2d')
    .getImageData(0, 0, reverse.width, reverse.height)
  expect(decodeQR(pixels.data, reverse.width, reverse.height)?.data).toBe(
    'DOCREADY-TEST',
  )
}

test('lower card detection prepares exact PVC and A4 previews and exports without the rest of the page', async ({
  page,
  context,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (event) => {
    if (event.type() === 'error') errors.push(event.text())
  })
  const requests: { url: string; method: string; body: string | null }[] = []
  context.on('request', (r) =>
    requests.push({ url: r.url(), method: r.method(), body: r.postData() }),
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await upload(page, 'pair')
  await expect(page.locator(cards)).toHaveCount(2)
  await expect(ready(page)).toBeVisible()
  await expect(page.getByAltText('Front print placement')).toBeVisible()
  await expect(page.getByAltText('Back print placement')).toBeVisible()
  const preview = await page
    .getByAltText('Back crop preview')
    .evaluate(async (image: HTMLImageElement) => {
      await image.decode()
      const c = new OffscreenCanvas(image.naturalWidth, image.naturalHeight)
      const cx = c.getContext('2d')!
      cx.drawImage(image, 0, 0)
      const p = cx.getImageData(
        Math.floor(c.width * 0.14),
        Math.floor(c.height * 0.55),
        1,
        1,
      ).data
      return [c.width / c.height, ...p.slice(0, 3)]
    })
  expect(preview[0]).toBeCloseTo(85.6 / 53.98, 1)
  expect(preview[3]).toBeGreaterThan(130)
  await checkPair(await pvc(page))
  await page
    .getByLabel('Sheet to preview')
    .selectOption({ label: 'Back card' })
  await expect(page.getByAltText('Back print placement')).toBeVisible()
  await expect(page.getByText('85.6 × 53.98 mm · 2 sheets')).toBeVisible()
  if (process.env.DOCREADY_QA_SCREENSHOTS)
    await page
      .locator('.ecard-paper-panel')
      .screenshot({ path: info.outputPath('pvc-layout-mobile.png') })
  await page
    .getByRole('button', { name: 'A4 — Front & Back on One Sheet' })
    .click()
  for (const layout of ['Side by side', 'Top & bottom']) {
    await page.getByRole('button', { name: layout, exact: true }).click()
    const bytes = await exportPDF(page)
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBe(1)
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(W, 7)
    expect(pdf.getPage(0).getHeight()).toBeCloseTo(H, 7)
    const rendered = await render(bytes, 1)
    const ctx = rendered.getContext('2d')
    const rect = await page.locator('.ecard-paper').boundingBox()
    for (const [side, channel] of [
      ['Front', 0],
      ['Back', 2],
    ] as const) {
      const placement = await page
        .getByAltText(side + ' print placement')
        .boundingBox()
      const x = Math.round(
        ((placement!.x - rect!.x + placement!.width * 0.14) / rect!.width) *
          rendered.width,
      )
      const y = Math.round(
        ((placement!.y - rect!.y + placement!.height * 0.55) / rect!.height) *
          rendered.height,
      )
      const px = ctx.getImageData(x, y, 1, 1).data
      expect(px[channel]).toBeGreaterThan(125)
      expect(px[1]).toBeLessThan(130)
    }
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
  expect(errors).toEqual([])
  expect(
    requests
      .filter((r) => r.url.startsWith('http'))
      .every(
        (r) =>
          new URL(r.url).origin === new URL(page.url()).origin &&
          r.method === 'GET' &&
          !r.body &&
          !r.url.includes('fictional-layout'),
      ),
  ).toBe(true)
  expect(
    await page.evaluate(() =>
      JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
      }),
    ),
  ).not.toContain('fictional-layout')
  if (process.env.DOCREADY_QA_SCREENSHOTS)
    await page.screenshot({
      path: info.outputPath('pvc-mobile.png'),
      fullPage: true,
    })
})

for (const layout of ['borderless', 'split', 'scan', 'rotated'] as const) {
  test(`isolates compact front and back for the ${layout} layout`, async ({
    page,
  }) => {
    await upload(page, layout)
    await expect(page.locator(cards)).toHaveCount(2)
    if (layout === 'borderless') await expect(download(page)).toBeDisabled()
    if (layout === 'split') {
      await expect(
        page
          .locator(cards)
          .filter({ has: page.getByAltText('Front crop preview') }),
      ).toContainText('Page 3')
      await expect(
        page
          .locator(cards)
          .filter({ has: page.getByAltText('Back crop preview') }),
      ).toContainText('Page 2')
    }
    await review(page)
    await checkPair(await pvc(page))
  })
}

test('a missing back stays missing, and a failed detection cannot confirm an entire page', async ({
  page,
}) => {
  await upload(page, 'single')
  await expect(page.locator(cards)).toHaveCount(1)
  await expect(page.getByAltText('Back crop preview')).toHaveCount(0)
  await review(page)
  const one = await PDFDocument.load(await pvc(page))
  expect(one.getPageCount()).toBe(1)
  expect(one.getPage(0).getWidth()).toBeCloseTo(cw, 7)
  await upload(page, 'blank')
  const editor = page.getByRole('dialog', { name: 'Adjust four-corner crop' })
  await expect(editor).toContainText(
    'Automatic card detection needs adjustment.',
  )
  await expect(editor.getByAltText('Original card source')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(download(page)).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Confirm crops and sides' }),
  ).toHaveCount(0)
  await expect(ready(page)).toHaveCount(0)
})
