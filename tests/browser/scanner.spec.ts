import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const scanner = '/tools/scan-document'
const cornerPattern = /^Corner [1-4]/
const sourceCorners = [
  [160, 222],
  [1050, 111],
  [1150, 1280],
  [74, 1418],
]

async function tiltedPage(page: Page) {
  const pixels = await page.evaluate((corners) => {
    const surface = document.createElement('canvas')
    surface.width = 1260
    surface.height = 1530
    const ctx = surface.getContext('2d')!
    ctx.fillStyle = '#282a30'
    ctx.fillRect(0, 0, surface.width, surface.height)

    const [a, b, c, d] = corners
    const dx1 = b[0] - c[0],
      dx2 = d[0] - c[0]
    const dy1 = b[1] - c[1],
      dy2 = d[1] - c[1]
    const sx = a[0] - b[0] + c[0] - d[0],
      sy = a[1] - b[1] + c[1] - d[1]
    const den = dx1 * dy2 - dx2 * dy1
    const g = (sx * dy2 - dx2 * sy) / den,
      h = (dx1 * sy - sx * dy1) / den
    function project(u: number, v: number) {
      const w = g * u + h * v + 1
      return [
        ((b[0] - a[0] + g * b[0]) * u + (d[0] - a[0] + h * d[0]) * v + a[0]) /
          w,
        ((b[1] - a[1] + g * b[1]) * u + (d[1] - a[1] + h * d[1]) * v + a[1]) /
          w,
      ] as const
    }
    function box(
      u: number,
      v: number,
      w: number,
      h: number,
      fill: string | CanvasGradient,
    ) {
      ctx.beginPath()
      ctx.moveTo(...project(u, v))
      ctx.lineTo(...project(u + w, v))
      ctx.lineTo(...project(u + w, v + h))
      ctx.lineTo(...project(u, v + h))
      ctx.closePath()
      ctx.fillStyle = fill
      ctx.fill()
    }
    const shadow = ctx.createLinearGradient(80, 360, 1165, 310)
    shadow.addColorStop(0, '#99978f')
    shadow.addColorStop(0.28, '#a7a59d')
    shadow.addColorStop(0.65, '#f0eee6')
    shadow.addColorStop(1, '#fbf8f0')
    box(0, 0, 1, 1, shadow)
    box(0.11, 0.12, 0.52, 0.015, '#19212a')
    for (let row = 0; row < 17; row++)
      for (let word = 0; word < 7; word++)
        box(
          0.11 + word * 0.11,
          0.24 + row * 0.026,
          0.055 + (word % 3) * 0.012,
          0.006,
          '#262a30',
        )
    box(0.66, 0.76, 0.17, 0.045, '#aa1537')
    return surface.toDataURL('image/png').split(',')[1]
  }, sourceCorners)
  return {
    name: 'angled-scan.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pixels, 'base64'),
  }
}

async function pngDownload(page: Page) {
  await page.getByLabel('Export format').selectOption('png')
  await page.getByRole('button', { name: 'Generate scan' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download scan-1.png' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('scan-1.png')
  return readFile((await file.path())!)
}

async function pixelStats(page: Page, png: Buffer) {
  return page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (character) =>
      character.charCodeAt(0),
    )
    const bitmap = await createImageBitmap(
      new Blob([bytes], { type: 'image/png' }),
    )
    const { width, height } = bitmap
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const sample = (x: number, y: number) =>
      [
        ...ctx.getImageData(Math.round(x * width), Math.round(y * height), 1, 1)
          .data,
      ].slice(0, 3)
    const pixels = ctx.getImageData(0, 0, width, height).data
    let black = 0,
      other = 0
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i],
        g = pixels[i + 1],
        b = pixels[i + 2]
      if (r === 0 && g === 0 && b === 0) black++
      else if (r !== 255 || g !== 255 || b !== 255) other++
    }
    return {
      width,
      height,
      black,
      other,
      darkPaper: sample(0.17, 0.69),
      lightPaper: sample(0.83, 0.69),
      stamp: sample(0.73, 0.78),
    }
  }, png.toString('base64'))
}

test('scanner locates a tilted sheet, straightens it, preserves color, and exports binary ink', async ({
  page,
  baseURL,
}) => {
  const requests: Array<{ method: string; url: string }> = []
  const errors: string[] = []
  page
    .context()
    .on('request', (request) =>
      requests.push({ method: request.method(), url: request.url() }),
    )
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (entry) => {
    if (entry.type() === 'error') errors.push(entry.text())
  })
  await page.addInitScript(() => {
    const downloads: string[] = []
    const released: string[] = []
    const click = HTMLAnchorElement.prototype.click
    const revoke = URL.revokeObjectURL
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && this.href.startsWith('blob:'))
        downloads.push(this.href)
      click.call(this)
    }
    URL.revokeObjectURL = (url: string) => {
      if (downloads.includes(url)) released.push(url)
      revoke(url)
    }
    Object.defineProperty(window, 'scannerDownloadsReleased', {
      get: () => [downloads.length, released.length],
    })
  })
  const response = await page.goto(scanner)
  const policy = response?.headers()['content-security-policy']
  expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval'")
  expect(policy).toContain("worker-src 'self' blob:")
  expect(policy).not.toContain("'unsafe-eval'")
  const fixture = await tiltedPage(page)
  await page.locator('input[type=file]').setInputFiles(fixture)
  await expect(page.getByText(/Page edges detected/)).toBeVisible()
  const handles = page.getByRole('button', { name: cornerPattern })
  await expect(handles).toHaveCount(4)
  const locations = await handles.evaluateAll((nodes) =>
    nodes.map((node) => {
      const style = (node as HTMLElement).style
      return [parseFloat(style.left), parseFloat(style.top)]
    }),
  )
  for (const [[x, y], [targetX, targetY]] of locations.map((point, i) => [
    point,
    sourceCorners[i],
  ])) {
    expect(Math.abs(x - (targetX * 100) / 1260)).toBeLessThan(2)
    expect(Math.abs(y - (targetY * 100) / 1530)).toBeLessThan(2)
  }
  await page.getByRole('button', { name: 'Preview page' }).click()
  await expect(page.getByAltText('Straightened page')).toBeVisible()
  const source = page.getByAltText('Source document')
  const beforeDrag = await source.boundingBox()
  const handle = handles.first()
  await handle.scrollIntoViewIfNeeded()
  const handleBox = (await handle.boundingBox())!
  const x = handleBox.x + handleBox.width / 2
  const y = handleBox.y + handleBox.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await expect(
    page.getByRole('img', { name: 'Magnified crop detail' }),
  ).toBeVisible()
  await page.mouse.move(x + 3, y + 4, { steps: 3 })
  await page.mouse.up()
  await expect(
    page.getByRole('img', { name: 'Magnified crop detail' }),
  ).toHaveCount(0)
  await expect(page.getByText(/Manual crop/)).toBeVisible()
  expect((await source.boundingBox())?.width).toBe(beforeDrag?.width)
  await page.getByRole('button', { name: 'Redetect edges' }).click()
  await expect(page.getByText(/Page edges detected/)).toBeVisible()

  await expect(page.getByLabel('Scan filter')).toHaveValue('magic')
  await page.getByRole('button', { name: 'Preview page' }).click()
  await expect(page.getByAltText('Straightened page')).toBeVisible()
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.screenshot({
    path: 'test-results/screenshots/scanner-desktop.png',
    fullPage: true,
  })
  const magic = await pixelStats(page, await pngDownload(page))

  await page.getByLabel('Scan filter').selectOption('original')
  const original = await pixelStats(page, await pngDownload(page))
  expect(original.width).toBeGreaterThan(1020)
  expect(original.width).toBeLessThan(1120)
  expect(original.height).toBeGreaterThan(1150)
  expect(original.height).toBeLessThan(1230)
  expect(original.lightPaper[0] - original.darkPaper[0]).toBeGreaterThan(45)
  expect(magic.darkPaper[0]).toBeGreaterThan(original.darkPaper[0] + 45)
  expect(Math.abs(magic.lightPaper[0] - magic.darkPaper[0])).toBeLessThan(20)
  expect(magic.stamp[0] - magic.stamp[1]).toBeGreaterThan(60)
  expect(magic.width).toBe(original.width)

  await page.getByLabel('Scan filter').selectOption('bw')
  const binary = await pixelStats(page, await pngDownload(page))
  expect(binary.other).toBe(0)
  expect(binary.black).toBeGreaterThan(13000)
  expect(binary.black / (binary.width * binary.height)).toBeLessThan(0.13)
  expect(binary.darkPaper).toEqual([255, 255, 255])
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, 'scannerDownloadsReleased')),
    )
    .toEqual([3, 3])
  expect(errors).toEqual([])
  expect(requests.some(({ url }) => url.endsWith('/libs/opencv.js'))).toBe(true)
  expect(
    requests.some(({ url }) => url.endsWith('/libs/opencv-4.12.0.wasm')),
  ).toBe(true)
  expect(
    requests.filter(
      ({ method, url }) => method !== 'GET' || new URL(url).origin !== baseURL,
    ),
  ).toEqual([])
})

test('scanner works offline on a narrow viewport before its first online use', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 850 })
  await page.goto('/')
  const fixture = await tiltedPage(page)
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true)
  await context.setOffline(true)
  await page.goto(scanner)
  await expect(page.getByText(/Offline · Cached tools/)).toBeVisible()
  await page.locator('input[type=file]').setInputFiles(fixture)
  await expect(page.getByText(/Page edges detected/)).toBeVisible()
  await page.getByRole('button', { name: 'Preview page' }).click()
  await expect(page.getByAltText('Straightened page')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  )
  const handle = page.getByRole('button', { name: cornerPattern }).first()
  await handle.scrollIntoViewIfNeeded()
  const box = (await handle.boundingBox())!
  const x = Math.round(box.x + box.width / 2)
  const y = Math.round(box.y + box.height / 2)
  const mobile = await context.newCDPSession(page)
  await mobile.send('Emulation.setTouchEmulationEnabled', { enabled: true })
  await mobile.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }],
  })
  await expect(
    page.getByRole('img', { name: 'Magnified crop detail' }),
  ).toBeVisible()
  await mobile.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x + 8, y: y + 4 }],
  })
  await mobile.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
  await expect(page.getByText(/Manual crop/)).toBeVisible()
  await mobile.detach()
  await page.getByRole('button', { name: 'Preview page' }).click()
  await expect(page.getByAltText('Straightened page')).toBeVisible()
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.screenshot({
    path: 'test-results/screenshots/scanner-mobile.png',
    fullPage: true,
  })
  const png = await pngDownload(page)
  expect(Array.from(png.subarray(0, 8))).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ])
})
