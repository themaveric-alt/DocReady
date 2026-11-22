import {
  beginText,
  endText,
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFString,
  type PDFFont,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  TextRenderingMode,
  type PDFDocument,
  type PDFPage,
} from 'pdf-lib'

export type SearchLine = {
  text: string
  x: number
  baseline: number
  width: number
  size: number
}

const byteHex = (code: number) =>
  code.toString(16).padStart(4, '0').toUpperCase()
const utf16Hex = (text: string) =>
  Array.from({ length: text.length }, (_, index) =>
    text.charCodeAt(index).toString(16).padStart(4, '0'),
  )
    .join('')
    .toUpperCase()

/** The visible layer uses browser shaping. Embedded fonts back the invisible logical Unicode lines. */
export async function searchFonts(
  pdf: PDFDocument,
  fonts: [PDFFont, PDFFont],
) {
  await pdf.flush()
  return fonts.map((font) => {
    const { context } = pdf
    const root = context.lookup(font.ref, PDFDict)
    const descendant = root
      .lookup(PDFName.of('DescendantFonts'), PDFArray)
      .lookup(0, PDFDict)
    const name = descendant.lookup(PDFName.of('BaseFont'), PDFName)
    const descriptor = descendant.get(PDFName.of('FontDescriptor'))!
    const cid = context.register(
      context.obj({
        Type: 'Font',
        Subtype: 'CIDFontType2',
        BaseFont: name,
        FontDescriptor: descriptor,
        CIDSystemInfo: {
          Registry: PDFString.of('Adobe'),
          Ordering: PDFString.of('Identity'),
          Supplement: 0,
        },
        CIDToGIDMap: 'Identity',
        DW: 1000,
      }),
    )
    return { cid, name }
  })
}

/** The visible page is shaped with browser fonts. The invisible ToUnicode overlay stores each logical line exactly. */
export function addSearchLayer(
  pdf: PDFDocument,
  page: PDFPage,
  lines: SearchLine[],
  fonts: Awaited<ReturnType<typeof searchFonts>>,
) {
  const { context } = pdf
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  for (const line of lines) {
    if (!line.text.trim()) continue
    const glyphs = [...segmenter.segment(line.text)].flatMap(({ segment }) =>
      segment.length > 8 ? [...segment] : [segment],
    )
    const enc = new Map<string, number>([[' ', 32]])
    for (const glyph of glyphs)
      if (!enc.has(glyph)) enc.set(glyph, 32 + enc.size)
    if (enc.size > 220)
      throw Error(
        'A PDF export line contains too many unique characters. Reduce the line width.',
      )
    const mappings = [...enc].map(
      ([glyph, code]) => '<' + byteHex(code) + '> <' + utf16Hex(glyph) + '>',
    )
    const map = Array.from(
      { length: Math.ceil(mappings.length / 90) },
      (_, i) => mappings.slice(i * 90, i * 90 + 90),
    )
      .map(
        (rows) =>
          rows.length + ' beginbfchar\n' + rows.join('\n') + '\nendbfchar',
      )
      .join('\n')
    const cmap = context.flateStream(`
/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /DocReadyUnicode def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
${map}
endcmap
CMapName currentdict /CMap defineresource pop
end
end
`)
    const embedded = fonts[/\p{Script=Devanagari}/u.test(line.text) ? 1 : 0]
    const font = context.register(
      context.obj({
        Type: 'Font',
        Subtype: 'Type0',
        BaseFont: embedded.name,
        Encoding: 'Identity-H',
        DescendantFonts: [embedded.cid],
        ToUnicode: context.register(cmap),
      }),
    )
    const key = page.node.newFontDictionary('DocReadyUnicode', font)
    page.pushOperators(
      beginText(),
      setFontAndSize(key, line.size),
      setTextRenderingMode(TextRenderingMode.Invisible),
      setTextMatrix(
        line.width / (line.size * glyphs.length),
        0,
        0,
        1,
        line.x,
        page.getHeight() - line.baseline,
      ),
      showText(
        PDFHexString.of(
          glyphs.map((glyph) => byteHex(enc.get(glyph)!)).join(''),
        ),
      ),
      endText(),
    )
  }
}
