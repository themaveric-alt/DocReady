import { useState } from 'react'
import {
  Button,
  ErrorState,
  Field,
  Panel,
  Progress,
  Results,
  useOperation,
} from '../../components/shared'
import { saveFile } from '../../lib/files'
import type { TextBlock } from '../translation/types'
import { openPhotoPrint } from './printPhotos'
import './advanced.css'

type Language = 'en' | 'hi' | 'both'
const templates = [
  ['Application', 'आवेदन'],
  ['Formal letter', 'औपचारिक पत्र'],
  ['Leave request', 'अवकाश आवेदन'],
  ['Cover letter', 'परिचय पत्र'],
  ['Declaration', 'घोषणा'],
  ['Notice', 'सूचना'],
  ['Office communication', 'कार्यालय संवाद'],
  ['Custom document', 'स्वनिर्मित दस्तावेज़'],
] as const

export function composeText(
  category: number,
  language: Language,
  input: {
    name: string
    recipient: string
    date: string
    subject: string
    en: string
    hi: string
  },
) {
  const make = (local: boolean) => {
    const paragraphs: string[] = []
    if (input.date)
      paragraphs.push((local ? 'दिनांक: ' : 'Date: ') + input.date)
    if (input.recipient)
      paragraphs.push((local ? 'प्रति: ' : 'To: ') + input.recipient)
    if (input.subject)
      paragraphs.push((local ? 'विषय: ' : 'Subject: ') + input.subject)
    const salutation =
      category === 0 ||
      category === 1 ||
      category === 2 ||
      category === 3 ||
      category === 6
    if (salutation)
      paragraphs.push(local ? 'महोदय / महोदया,' : 'Dear Sir or Madam,')
    const text = (local ? input.hi : input.en).trim()
    if (text) paragraphs.push(text)
    if (input.name)
      paragraphs.push(
        (salutation ? (local ? 'सादर,\n' : 'Sincerely,\n') : '') + input.name,
      )
    return [templates[category][local ? 1 : 0], ...paragraphs].join('\n\n')
  }
  return language === 'both'
    ? make(false) + '\n\n────────────\n\n' + make(true)
    : make(language === 'hi')
}
export async function unicodePDF(
  text: string,
  name: string,
  signal: AbortSignal,
) {
  if (!text.trim() || text.length > 24_000)
    throw Error('Enter text between 1 and 24,000 characters.')
  const { searchablePDF } =
    await import('../translation/pdf-translator/searchablePDF')
  const blocks: TextBlock[] = text
    .trim()
    .split(/\n{2,}/u)
    .map((translated, index) => ({
      id: String(index),
      page: 0,
      role: index === 0 ? 'heading' : 'paragraph',
      original: translated,
      translated,
      box: { x: 0, y: 0, width: 1, height: 0.04 },
    }))
  const item = await searchablePDF(
    name,
    [{ index: 0, width: 595.28, height: 841.89, scanned: false }],
    blocks,
    'reflow',
    16,
    'sans',
    signal,
  )
  return { ...item, name: name + '.pdf' }
}
const clean = {
  name: '',
  recipient: '',
  date: '',
  subject: '',
  en: '',
  hi: '',
}
export default function BilingualComposer() {
  const [category, setCategory] = useState(0),
    [language, setLanguage] = useState<Language>('both'),
    [input, setInput] = useState(clean)
  const [preview, setPreview] = useState(''),
    [printError, setPrintError] = useState('')
  const op = useOperation()
  const field = (key: keyof typeof clean, value: string) =>
    setInput({ ...input, [key]: value })
  const ready =
    language === 'hi'
      ? Boolean(input.hi.trim())
      : language === 'en'
        ? Boolean(input.en.trim())
        : Boolean(input.en.trim() && input.hi.trim())
  return (
    <div className="advanced-space advanced-columns">
      <Panel title="Choose a document and add your details">
        <div className="form-grid">
          <Field label="Document category">
            <select
              value={category}
              onChange={(e) => setCategory(+e.target.value)}
            >
              {templates.map(([en], i) => (
                <option value={i} key={en}>
                  {en}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Document language">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
            >
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="both">Hindi + English</option>
            </select>
          </Field>
        </div>
        <div className="form-grid">
          {(
            [
              ['name', 'Your name'],
              ['recipient', 'Recipient or office'],
              ['date', 'Date as you want it printed'],
              ['subject', 'Subject'],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                maxLength={180}
                value={input[key]}
                onChange={(e) => field(key, e.target.value)}
              />
            </Field>
          ))}
        </div>
        {language !== 'hi' && (
          <Field label="Facts or message in English">
            <textarea
              rows={5}
              maxLength={10000}
              value={input.en}
              onChange={(e) => field('en', e.target.value)}
            />
          </Field>
        )}
        {language !== 'en' && (
          <Field label="तथ्य या संदेश हिंदी में">
            <textarea
              rows={5}
              maxLength={10000}
              lang="hi"
              value={input.hi}
              onChange={(e) => field('hi', e.target.value)}
            />
          </Field>
        )}
        <p className="muted">
          The template arranges the facts you enter. Add your own wording in
          each chosen language.
        </p>
        <Button
          disabled={!ready || op.pending}
          onClick={() => {
            setPreview(composeText(category, language, input))
            op.reset()
          }}
        >
          Build editable draft
        </Button>
      </Panel>
      <Panel title="Review and export">
        <Field label="Editable document preview">
          <textarea
            className="composer-draft"
            lang={language === 'en' ? 'en' : 'hi'}
            rows={18}
            value={preview}
            maxLength={24000}
            onChange={(e) => {
              setPreview(e.target.value)
              op.reset()
            }}
          />
        </Field>
        <div className="action-row">
          <Button
            variant="secondary"
            disabled={!preview.trim()}
            onClick={() =>
              saveFile({
                name: 'docready-composed-document.txt',
                blob: new Blob([preview], {
                  type: 'text/plain;charset=utf-8',
                }),
              })
            }
          >
            Download TXT
          </Button>
          <Button
            disabled={!preview.trim() || op.pending}
            onClick={() =>
              void op.run(async () => [
                await unicodePDF(
                  preview,
                  'docready-composed-document',
                  new AbortController().signal,
                ),
              ])
            }
          >
            Prepare Unicode PDF
          </Button>
          <Button
            variant="secondary"
            disabled={!preview.trim() || op.pending}
            onClick={() => {
              setPrintError('')
              openPhotoPrint(
                () =>
                  unicodePDF(
                    preview,
                    'docready-composed-document',
                    new AbortController().signal,
                  ),
                setPrintError,
              )
            }}
          >
            Print PDF
          </Button>
        </div>
        <Progress pending={op.pending} label="Embedding Unicode fonts" />
        <ErrorState error={op.error || printError} />
        <Results items={op.items} />
      </Panel>
    </div>
  )
}
