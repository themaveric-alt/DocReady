import { expect, test } from 'vitest'
import JSZip from 'jszip'
import { tools, toolPath } from '../src/catalog'
import { imageToolGroups, pdfSuiteCategories } from '../src/tools-config'
import { extractiveSummary, toMarkdown, type PdfTextPage } from '../src/features/pdf-suite/pdf-text'
import { ocrDocx } from '../src/lib/ocr-docx'

test('every published PDF-suite entry resolves to a real catalog route', () => {
  const ids = new Set(tools.map((tool) => tool.id))
  expect(pdfSuiteCategories).toHaveLength(7)
  for (const group of pdfSuiteCategories) {
    expect(group.tools.length).toBeGreaterThan(0)
    for (const id of group.tools) {
      expect(ids.has(id), `${group.label}: ${id}`).toBe(true)
      expect(toolPath(id)).toMatch(/^\/(?:tools|application-ready|printdesk)/)
    }
  }
  expect(imageToolGroups[0].tools).toContain('compress-image')
})

test('the local extractive summarizer ranks source sentences and preserves order', () => {
  const summary = extractiveSummary(
    'DocReady processes documents locally. Local processing keeps document bytes in the browser. A distant unrelated sentence is included for ranking. The browser can export the result without uploads.',
    2,
  )
  expect(summary).toHaveLength(2)
  expect(summary.join(' ')).toContain('browser')
})

test('structured PDF text produces Markdown headings and readable pages', () => {
  const pages: PdfTextPage[] = [{
    index: 0,
    width: 595,
    height: 842,
    lines: [
      { text: 'LOCAL REPORT', x: 20, y: 800, width: 170, height: 20, font: 24 },
      { text: 'Prepared entirely in the browser.', x: 20, y: 760, width: 260, height: 12, font: 11 },
    ],
  }]
  expect(toMarkdown(pages)).toContain('# LOCAL REPORT')
  expect(toMarkdown(pages)).toContain('Prepared entirely in the browser.')
})

test('editable DOCX export is a valid local OOXML zip', async () => {
  const zip = await JSZip.loadAsync(await (await ocrDocx('Heading\nA local paragraph.')).arrayBuffer())
  expect(await zip.file('word/document.xml')?.async('string')).toContain('A local paragraph.')
  expect(await zip.file('[Content_Types].xml')?.async('string')).toContain('word/document.xml')
})
