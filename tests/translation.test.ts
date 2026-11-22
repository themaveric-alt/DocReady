import { test, expect } from 'vitest'
import {
  detectLanguage,
  pairFor,
} from '../src/features/translation/models/language'
import {
  normalizeEnglishHeading,
  parseGlossary,
  translateParagraph,
} from '../src/features/translation/models/segments'
import { structurePage } from '../src/features/translation/pdf-translator/documentStructure'
import { wrapText } from '../src/features/translation/layoutText'

test('real n-gram detection declines short or unsupported source languages', () => {
  expect(
    detectLanguage(
      'Please read this document before sending the signed application to our school.',
    ).language,
  ).toBe('en')
  expect(
    detectLanguage(
      'विद्यालय में शिक्षा आवश्यक है। कृपया सभी विद्यार्थियों को यह दस्तावेज़ पढ़ने दें।',
    ).language,
  ).toBe('hi')
  expect(detectLanguage('नाम').language).toBeUndefined()
  expect(
    detectLanguage(
      'Bonjour, veuillez vérifier votre dossier administratif avant lundi prochain.',
    ).language,
  ).toBe('fr')
  expect(pairFor('en', 'en')).toBeUndefined()
  expect(pairFor('en', 'hi')).toBe('en-hi')
  expect(pairFor('es', 'fr')).toBeUndefined()
})
test('protected tokens and glossary values are preserved exactly', async () => {
  const seen: string[] = []
  const value = await translateParagraph(
    'Send ID-27 by 20/11/2026 to user@example.org at https://example.org/form. Open /tmp/DocReady and keep Trenish.',
    'en',
    parseGlossary('Trenish = Trenish Chaturvedi'),
    async (fragment) => {
      seen.push(fragment)
      return fragment.toLowerCase()
    },
  )
  for (const entry of [
    'ID-27',
    '20/11/2026',
    'user@example.org',
    'https://example.org/form',
    '/tmp/DocReady',
    'Trenish Chaturvedi',
  ]) {
    expect(value).toContain(entry)
    expect(seen.join(' ')).not.toContain(entry)
  }
  expect(
    await translateParagraph('x = a + b', 'en', [], async () => 'bad'),
  ).toBe('x = a + b')
})
test('reconstructs a heading, wrapped paragraph and repeated table cell columns', () => {
  const text = (
    text: string,
    x: number,
    y: number,
    w: number,
    font = 12,
  ) => ({
    text,
    font,
    box: { x, y, width: w, height: 0.018 },
  })
  const blocks = structurePage(
    [
      text('Heading', 0.1, 0.09, 0.15, 20),
      text('Sentence begins on this line.', 0.1, 0.13, 0.29),
      text('This is part of the same paragraph.', 0.1, 0.153, 0.38),
      ...[0, 1, 2].flatMap((i) => [
        text('Item ' + i, 0.1, 0.3 + i * 0.035, 0.11),
        text('Count ' + i, 0.55, 0.3 + i * 0.035, 0.13),
      ]),
    ],
    4,
  )
  expect(blocks[0]).toMatchObject({ page: 4, role: 'heading' })
  expect(blocks[1].original).toMatch(/line\. This/)
  expect(blocks.filter((b) => b.role === 'cell')).toHaveLength(6)
})
test('wraps Indic text without dividing conjuncts and rejects an undersized text cell', () => {
  const segmenter = new Intl.Segmenter('hi', { granularity: 'grapheme' })
  const measure = (t: string) => [...segmenter.segment(t)].length
  expect(wrapText('क्षमा श्रद्धा विद्यार्थी', 6, measure)?.join(' ')).toBe(
    'क्षमा श्रद्धा विद्यार्थी',
  )
  expect(wrapText('क्ष', 0, measure)).toBeUndefined()
})

test('normalizes all-caps OCR titles while preserving acronyms and marked prose', () => {
  expect(normalizeEnglishHeading('DOCUMENT READY')).toBe('Document ready')
  expect(normalizeEnglishHeading('PLEASE VERIFY PDF DETAILS')).toBe(
    'Please verify PDF details',
  )
  expect(normalizeEnglishHeading('Please read THIS DOCUMENT')).toBe(
    'Please read THIS DOCUMENT',
  )
})

test('sends adjacent sentences together and rejects corrupted translation instead of completing it', async () => {
  const called: string[] = []
  const source =
    'Le dossier est prêt. Il contient toutes les pièces demandées.'
  await translateParagraph(source, 'fr', [], async (text) => {
    called.push(text)
    return text
  })
  expect(called).toEqual([source])
  await expect(
    translateParagraph(source, 'fr', [], async () => '□□'),
  ).rejects.toThrow('unreadable text')
})

test('the optional on-device language adapter retries transient failures without losing paragraphs', async () => {
  const { translateWithBrowser } =
    await import('../src/features/translation/models/browserTranslation')
  const { vi } = await import('vitest')
  const translate = vi
    .fn()
    .mockRejectedValueOnce(
      new DOMException('Temporarily busy', 'QuotaExceededError'),
    )
    .mockResolvedValueOnce('The file is ready. It contains a photo.')
  const destroy = vi.fn()
  vi.stubGlobal('Translator', {
    availability: vi.fn().mockResolvedValue('available'),
    create: vi.fn().mockResolvedValue({ translate, destroy }),
  })
  const result = vi.fn()
  try {
    await translateWithBrowser(
      'fr',
      'en',
      ['Le dossier est prêt. Il contient une photo.'],
      [],
      new AbortController().signal,
      vi.fn(),
      result,
    )
    expect(translate).toHaveBeenCalledTimes(2)
    expect(translate.mock.calls[0][0]).toContain('prêt. Il contient')
    expect(result).toHaveBeenCalledWith(
      0,
      'The file is ready. It contains a photo.',
    )
    expect(destroy).toHaveBeenCalledOnce()
  } finally {
    vi.unstubAllGlobals()
  }
})
