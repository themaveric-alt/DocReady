/**
 * The PDF workstation's typed navigation map.
 *
 * The application previously kept its registry in catalog.ts rather than in a
 * tools-config.js file. Keeping this small, dependency-free map next to the
 * catalog makes the seven PDF groups reusable by the landing menu, homepage,
 * command palette and route-integrity tests without duplicating tool names.
 */
export const pdfSuiteCategories = [
  {
    id: 'organize-pdf',
    label: 'Organize PDF',
    description: 'Merge, split, remove, extract and arrange pages.',
    tools: [
      'merge-pdf',
      'split-pdf',
      'remove-pages',
      'extract-pages',
      'organize-pdf',
      'scan-to-pdf',
    ],
  },
  {
    id: 'optimize-pdf',
    label: 'Optimize PDF',
    description: 'Compress, repair and recognize scanned documents.',
    tools: ['compress-pdf', 'repair-pdf', 'ocr-pdf'],
  },
  {
    id: 'convert-to-pdf',
    label: 'Convert to PDF',
    description: 'Build PDFs from images, Office files or HTML.',
    tools: [
      'image-to-pdf',
      'word-to-pdf',
      'powerpoint-to-pdf',
      'excel-to-pdf',
      'html-to-pdf',
    ],
  },
  {
    id: 'convert-from-pdf',
    label: 'Convert from PDF',
    description: 'Export pages and extracted structures to editable files.',
    tools: ['pdf-to-image', 'pdf-to-word', 'pdf-to-powerpoint', 'pdf-to-excel'],
  },
  {
    id: 'edit-pdf',
    label: 'Edit PDF',
    description: 'Rotate, number, watermark, crop, annotate and fill forms.',
    tools: [
      'rotate-pdf',
      'number-pdf',
      'watermark-pdf',
      'crop-pdf',
      'edit-pdf',
      'pdf-forms',
    ],
  },
  {
    id: 'pdf-security',
    label: 'PDF Security',
    description: 'Unlock, protect, sign, redact and compare local PDFs.',
    tools: [
      'unlock-pdf',
      'protect-pdf',
      'sign-pdf',
      'redact-pdf',
      'compare-pdf',
    ],
  },
  {
    id: 'pdf-intelligence',
    label: 'PDF Intelligence',
    description: 'Summarize, translate and turn document text into Markdown.',
    tools: ['ai-summarizer', 'pdf-translator', 'pdf-to-markdown'],
  },
] as const

export type PdfSuiteCategoryId = (typeof pdfSuiteCategories)[number]['id']
export type ToolTier = 'free' | 'premium'

export const pdfSuiteToolIds = new Set(
  pdfSuiteCategories.flatMap((category) => category.tools),
)

/** Image tools are kept separate from the PDF suite but share its target-size
 * compressor. This makes the standalone Image Compressor discoverable in the
 * same registry audit without pretending it is a PDF operation. */
export const imageToolGroups = [
  {
    id: 'optimize-images',
    label: 'Optimize / Image Tools',
    tools: ['compress-image', 'resize-image', 'convert-image', 'batch-image'],
  },
] as const
