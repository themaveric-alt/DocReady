import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib'
import { paperSizes, pdfBlob } from './pdf-edit'
export const resumeStyles = {
  'Modern Professional': {
    size: 31,
    heading: 11,
    line: true,
    center: false,
    band: true,
  },
  'Minimal Classic': {
    size: 29,
    heading: 10,
    line: false,
    center: true,
    band: false,
  },
  'Clean Editorial': {
    size: 36,
    heading: 11,
    line: true,
    center: false,
    band: false,
  },
  'Student Resume': {
    size: 27,
    heading: 12,
    line: true,
    center: true,
    band: true,
  },
  'Technical Resume': {
    size: 25,
    heading: 10,
    line: true,
    center: false,
    band: false,
  },
} as const
export type ResumeStyle = keyof typeof resumeStyles
export type ResumeData = {
  name: string
  contact: string
  sections: { id: string; title: string; body: string }[]
  layout: ResumeStyle
  font: 'sans' | 'serif' | 'mono'
  margin: number
  spacing: number
  color: string
}
function lines(text: string, font: PDFFont, size: number, max: number) {
  const width = (line: string) => font.widthOfTextAtSize(line, size)
  const result: string[] = []
  for (const row of text.split(/\r?\n/)) {
    let current = ''
    for (const token of row.trim().split(/\s+/)) {
      if (!token) continue
      const proposed = current ? current + ' ' + token : token
      if (width(proposed) <= max) {
        current = proposed
        continue
      }
      if (current) result.push(current)
      current = ''
      for (const ch of token) {
        if (current && width(current + ch) > max) {
          result.push(current)
          current = ''
        }
        current += ch
      }
    }
    result.push(current)
  }
  return result
}
export async function makeResume(data: ResumeData, paper: string) {
  if (!data.name.trim()) throw Error('Enter your name before exporting.')
  if (!Number.isFinite(data.margin) || data.margin < 20 || data.margin > 85)
    throw Error('Page margins must be 20–85 pt.')
  const doc = await PDFDocument.create()
  const fonts = {
    sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold],
    serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold],
    mono: [StandardFonts.Courier, StandardFonts.CourierBold],
  }
  const [regular, bold] = await Promise.all(
    fonts[data.font].map((f) => doc.embedFont(f)),
  )
  const [width, height] =
    paper === 'A5' ? paperSizes.A4 : (paperSizes[paper] ?? paperSizes.A4)
  const margin = data.margin,
    usable = width - 2 * margin,
    style = resumeStyles[data.layout],
    lineHeight = 13.4 * data.spacing
  const color = data.color.slice(1),
    accent = rgb(
      ...([0, 2, 4].map((i) => parseInt(color.slice(i, i + 2), 16) / 255) as [
        number,
        number,
        number,
      ]),
    )
  const ink = rgb(0.13, 0.17, 0.25),
    secondary = rgb(0.29, 0.34, 0.43),
    rule = rgb(0.84, 0.87, 0.94)
  let page: PDFPage = doc.addPage([width, height]),
    y = height - margin
  const next = () => {
    page = doc.addPage([width, height])
    y = height - margin
  }
  const room = (points: number) => {
    if (y - points < margin) next()
  }
  function write(
    text: string,
    font: PDFFont,
    size: number,
    tone: ReturnType<typeof rgb>,
    step: number,
    center = false,
  ) {
    for (const row of lines(text, font, size, usable)) {
      room(step)
      if (row)
        page.drawText(row, {
          x: center
            ? margin + (usable - font.widthOfTextAtSize(row, size)) / 2
            : margin,
          y: y - size,
          font,
          size,
          color: tone,
        })
      y -= step
    }
  }
  try {
    if (style.band)
      page.drawRectangle({
        x: margin,
        y: y - 4,
        height: 4,
        width: usable,
        color: accent,
      })
    if (style.band) y -= 17
    write(
      data.name.trim(),
      bold,
      style.size,
      ink,
      style.size + 10,
      style.center,
    )
    if (data.contact.trim())
      write(data.contact.trim(), regular, 10, secondary, 15, style.center)
    y -= 11
    for (const section of data.sections.filter(
      (s) => s.body.trim() && s.title.trim(),
    )) {
      room(18 + lineHeight)
      write(
        data.layout === 'Clean Editorial'
          ? section.title
          : section.title.toUpperCase(),
        bold,
        style.heading,
        accent,
        16,
      )
      if (style.line) {
        page.drawLine({
          start: { x: margin, y },
          end: { x: width - margin, y },
          thickness: 0.55,
          color: rule,
        })
        y -= 5
      }
      write(section.body.trim(), regular, 10, ink, lineHeight)
      y -= 10 * data.spacing
    }
  } catch (e) {
    if (String(e).includes('WinAnsi'))
      throw Error(
        'Resume PDF export uses Western fonts. Remove unsupported characters such as emoji or Devanagari before exporting.',
      )
    throw e
  }
  doc.setTitle(data.name.trim() + ' — Resume')
  return { blob: pdfBlob(await doc.save()), pages: doc.getPageCount() }
}
