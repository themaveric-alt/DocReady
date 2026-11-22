import { renderToStaticMarkup } from 'react-dom/server'
import { stem, type Output } from '../../../lib/files'
import { embeddedFontCSS, ensureFonts } from '../fonts'
import { PdfDocument, type PDFMode } from './pdfLayoutEngine'
import type { SourcePage, TextBlock } from '../types'

export const printRules = `
@page { size: A4; margin: 14mm; }
.translated-paper { color: #182137; background: #fff; overflow-wrap:anywhere; line-height: 1.56; }
.translation-doc-page { margin-bottom: 16px; padding: 12px 18px; }
.translation-doc-page p, .translation-doc-page h2, .translation-doc-page h3 { margin: 0 0 .65em; font-family: inherit; letter-spacing: normal; }
.translation-doc-page h2 { font-size: 1.3em; line-height: 1.4; }
.translation-doc-page h3 { font-size: 1.12em; }
.translation-doc-page p[data-role="list"] { padding-left: 1.1em; text-indent: -.8em; }
.translation-doc-page pre { white-space:pre-wrap; font-family:monospace; }
.translation-doc-page table { width:100%; border-collapse:collapse; margin-bottom:1em; }
.translation-doc-page td { border:1px solid #c9ced8; padding:.4em; vertical-align:top; }
.translation-page-number { font-size:.8em; color:#546380; margin-bottom:1.2em; }
.translation-bilingual { display:grid; grid-template-columns:1fr 1fr; gap:.4em 1.15em; }
.translation-bilingual-row { display:contents; }
.translation-pair { margin-bottom:1.25em; border-bottom:1px solid #ccd3de; }
.translation-pair span { font-size:.8em; color:#546380; }
.translation-positioned { position:relative; width:640px; transform-origin:top left; }
.translation-positioned-block { position:absolute; line-height:1.5; }
.translation-positioned-block p, .translation-positioned-block h2 { margin:0; font-size:inherit; line-height:1.5; }
@media print {
  body { margin: 0; }
  .translation-doc-page { break-inside:auto; break-after:page; padding:0; margin:0; }
  .translation-doc-page:last-child { break-after:auto; }
  .translation-doc-page h2, .translation-doc-page h3 { break-after:avoid; }
  .translation-pair, .translation-doc-page tr { break-inside:avoid; }
  .translation-positioned { break-inside:avoid; max-width:100%; max-height:258mm; }
}
`

export async function exportHTML(
  name: string,
  pages: SourcePage[],
  blocks: TextBlock[],
  mode: PDFMode,
  font: number,
  fontStyle: 'sans' | 'serif',
): Promise<Output> {
  await ensureFonts()
  const fonts = await embeddedFontCSS()
  const body = renderToStaticMarkup(
    <PdfDocument
      pages={pages}
      blocks={blocks}
      mode={mode}
      font={font}
      fontStyle={fontStyle}
    />,
  )
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; base-uri 'none'"><title>Translated document</title><style>${fonts}\n${printRules}</style><body>${body}</body></html>`
  return {
    name: stem(name) + '-translated.html',
    blob: new Blob([html], { type: 'text/html;charset=utf-8' }),
  }
}
