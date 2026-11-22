import { creator, creatorByline, creditPrefix } from '../../lib/branding'
import { finalCrop, intrinsic, type Card } from './cardCrop'
import {
  contain,
  marksFor,
  rulerFor,
  type PrintSettings,
  type Sheet,
} from './printLayout'
import { sheetDpi } from './printExport'

export function openPrintWindow() {
  const popup = window.open('', '_blank')
  if (!popup)
    throw Error(
      'The browser blocked the print tab. Allow popups or download the PDF to print.',
    )
  popup.opener = null
  popup.document.title = 'DocReadyApp print preview'
  popup.document.documentElement.lang = 'en'
  popup.document.documentElement.dataset.theme =
    document.documentElement.dataset.theme ?? 'light'
  const loading = popup.document.createElement('p')
  loading.textContent = 'Preparing your local print preview…'
  popup.document.body.append(loading)
  return popup
}

export async function fillPrintWindow(
  popup: Window,
  sheets: Sheet[],
  cards: Card[],
  settings: PrintSettings,
  signal: AbortSignal,
  report: (message: string) => void,
  ownURL: (url: string) => void,
) {
  const lookup = new Map(cards.map((card) => [card.id, card]))
  if (
    sheets.some((sheet) =>
      sheet.cards.some(
        ({ id }) => !lookup.get(id)?.detected || !lookup.get(id)?.accepted,
      ),
    )
  )
    throw Error('Review and confirm every crop before printing.')
  const doc = popup.document,
    paper = sheets[0]
  const styles = doc.createElement('style')
  styles.textContent = `
    @page { size: ${paper.width}mm ${paper.height}mm; margin: 0; }
    body { margin: 0; background: #efeff8; color: #172033; font: 16px system-ui, sans-serif; }
    header { position: sticky; top: 0; padding: 16px; background: #fff; z-index: 1; text-align: center; }
    h1 { font-size: 19px; margin: 8px 0; }
    .print-brand { display: inline-flex; align-items: center; gap: 9px; text-align: left; }
    .print-brand > span { display: grid; gap: 3px; line-height: 1.1; }
    .print-byline { font-size: 12px; color: #515b71; }
    .print-credit { padding: 16px; text-align: center; background: #fff; color: #515b71; font-size: 13px; }
    .print-credit strong { color: #4940be; }
    [data-theme='dark'] header, [data-theme='dark'] .print-credit { background: #1a2030; color: #f3f5fc; }
    [data-theme='dark'] .print-byline { color: #b1bdd5; }
    [data-theme='dark'] .print-credit strong { color: #bdb6ff; }
    header p { margin: 8px auto; max-width: 50ch; }
    button { color: #fff; background: #5140c1; border: none; padding: 10px 20px; border-radius: 10px; font: inherit; font-weight: 650; cursor: pointer; }
    button:focus-visible { outline: 3px solid #8675ec; outline-offset: 3px; }
    .sheet { position: relative; overflow: hidden; background: #fff; margin: 20px auto; box-shadow: 0 5px 24px #19122626; }
    .sheet img { position: absolute; display: block; }
    .guides { position: absolute; inset: 0; width: 100%; height: 100%; }
    @media print {
      html, body { background: #fff; margin: 0; padding: 0; }
      header, .print-credit { display: none; }
      .sheet { margin: 0; box-shadow: none; break-inside: avoid; }
      .sheet:not(:last-child) { break-after: page; }
    }`
  doc.head.append(styles)
  const viewport = doc.createElement('meta')
  viewport.name = 'viewport'
  viewport.content = 'width=device-width, initial-scale=1'
  doc.head.append(viewport)
  const header = doc.createElement('header'),
    heading = doc.createElement('h1'),
    note = doc.createElement('p'),
    action = doc.createElement('button')
  const brand = doc.createElement('span'),
    logo = doc.createElement('img'),
    lockup = doc.createElement('span'),
    wordmark = doc.createElement('strong'),
    byline = doc.createElement('span'),
    footer = doc.createElement('footer'),
    credit = doc.createElement('strong')
  brand.className = 'print-brand'
  logo.src = new URL('/logo.svg', window.location.origin).href
  logo.alt = ''
  logo.width = logo.height = 35
  wordmark.textContent = 'DocReadyApp'
  byline.className = 'print-byline'
  byline.textContent = creatorByline
  lockup.append(wordmark, byline)
  brand.append(logo, lockup)
  heading.textContent = 'Print preview'
  heading.setAttribute('aria-label', 'DocReadyApp print preview')
  footer.className = 'print-credit'
  credit.textContent = creator
  footer.append(creditPrefix, credit)
  note.textContent =
    'Use Actual Size / 100% for accurate print dimensions.' +
    (settings.mode === 'duplex'
      ? ` Turn on double-sided printing and flip on the ${settings.flip} edge.`
      : settings.mode === 'pvc'
        ? ' Select the ID-1 paper size in your printer driver. Check card alignment and front/back orientation.'
        : '')
  action.type = 'button'
  action.textContent = 'Print sheets'
  action.addEventListener('click', () => popup.print())
  header.append(brand, heading, note, action)
  const pages = doc.createDocumentFragment()
  const svgNS = 'http://www.w3.org/2000/svg'
  for (const [i, sheet] of sheets.entries()) {
    signal.throwIfAborted()
    if (popup.closed) throw Error('The print tab was closed.')
    const frame = doc.createElement('section')
    frame.className = 'sheet'
    frame.style.width = sheet.width + 'mm'
    frame.style.height = sheet.height + 'mm'
    frame.setAttribute('aria-label', 'Sheet ' + (i + 1))
    for (const [j, position] of sheet.cards.entries()) {
      report(`Preparing print preview · sheet ${i + 1}, card ${j + 1}`)
      const card = lookup.get(position.id)!
      const cropped = await finalCrop(
        card,
        position,
        sheetDpi(sheet, cards, settings.dpi),
        signal,
      )
      signal.throwIfAborted()
      const rect = contain(intrinsic(card), position)
      const image = doc.createElement('img')
      const url = URL.createObjectURL(cropped.blob)
      ownURL(url)
      image.src = url
      image.alt = 'Cropped card'
      image.style.left = position.x + rect.x + 'mm'
      image.style.top = position.y + rect.y + 'mm'
      image.style.width = rect.width + 'mm'
      image.style.height = rect.height + 'mm'
      await image.decode()
      frame.append(image)
    }
    const guides = doc.createElementNS(svgNS, 'svg')
    guides.setAttribute('class', 'guides')
    guides.setAttribute('viewBox', `0 0 ${sheet.width} ${sheet.height}`)
    guides.setAttribute('aria-hidden', 'true')
    for (const line of settings.mode === 'pvc'
      ? []
      : [
          ...marksFor(sheet, settings.marks),
          ...(settings.ruler ? rulerFor(sheet) : []),
        ]) {
      const stroke = doc.createElementNS(svgNS, 'line')
      for (const [attr, value] of Object.entries(line))
        stroke.setAttribute(attr, String(value))
      stroke.setAttribute('stroke', '#61708b')
      stroke.setAttribute('stroke-width', '.16')
      guides.append(stroke)
    }
    if (settings.ruler && settings.mode !== 'pvc') {
      const label = doc.createElementNS(svgNS, 'text')
      label.setAttribute('x', String(sheet.width / 2))
      label.setAttribute('y', String(sheet.height - 3))
      label.setAttribute('text-anchor', 'middle')
      label.setAttribute('font-size', '2.6')
      label.textContent = '50 mm · Actual Size / 100%'
      guides.append(label)
    }
    frame.append(guides)
    pages.append(frame)
  }
  signal.throwIfAborted()
  doc.body.replaceChildren(header, pages, footer)
}
