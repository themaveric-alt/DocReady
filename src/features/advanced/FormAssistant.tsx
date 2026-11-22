import { useState } from 'react'
import { useJourneySources } from '../../components/ToolJourney'
import {
  PDFCheckBox,
  PDFDropdown,
  PDFHexString,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFString,
  PDFTextField,
  type PDFField,
} from 'pdf-lib'
import {
  Button,
  Check,
  Dropzone,
  ErrorState,
  Field,
  FilePreview,
  Panel,
  Progress,
  Results,
  useOperation,
} from '../../components/shared'
import { PDF, saveFile, stem } from '../../lib/files'
import { openEdit, pdfBlob } from '../../lib/pdf-edit'
import { loadRender, renderBlob } from '../../lib/pdf-render'
import { translationFontBytes } from '../translation/fonts'
import { localDocumentText } from './documentInput'
import './advanced.css'

type Value = string | boolean | string[]
type Detected = {
  id: string
  label: string
  kind: 'text' | 'check' | 'options' | 'multiple'
  options?: string[]
  multi?: boolean
  value: Value
}
function labelOf(field: PDFField) {
  const name = field.acroField.dict.lookup(PDFName.of('TU'))
  return name instanceof PDFString || name instanceof PDFHexString
    ? name.decodeText() || field.getName()
    : field.getName()
}
function controls(fields: PDFField[]) {
  const found: Detected[] = []
  const skipped: string[] = []
  for (const field of fields) {
    const id = field.getName(),
      label = labelOf(field)
    if (field.isReadOnly()) {
      skipped.push(label)
      continue
    }
    if (field instanceof PDFTextField)
      found.push({
        id,
        label,
        kind: 'text',
        multi: field.isMultiline(),
        value: field.getText() ?? '',
      })
    else if (field instanceof PDFCheckBox)
      found.push({ id, label, kind: 'check', value: field.isChecked() })
    else if (field instanceof PDFRadioGroup)
      found.push({
        id,
        label,
        kind: 'options',
        options: field.getOptions(),
        value: field.getSelected() ?? '',
      })
    else if (field instanceof PDFDropdown || field instanceof PDFOptionList)
      found.push({
        id,
        label,
        kind: field.isMultiselect() ? 'multiple' : 'options',
        options: field.getOptions(),
        value: field.isMultiselect()
          ? field.getSelected()
          : (field.getSelected()[0] ?? ''),
      })
    else skipped.push(label)
  }
  return { found, skipped }
}
async function previewPDF(file: Blob, index: number) {
  const doc = await loadRender(file, { workerRendering: true })
  try {
    const page = await doc.getPage(index + 1),
      { width, height } = page.getViewport({ scale: 1 })
    return await renderBlob(
      doc,
      index,
      Math.min(1.65, 1100 / Math.max(width, height)),
    )
  } finally {
    await doc.dispose()
  }
}
async function fill(file: File, edited: Detected[], flatten: boolean) {
  const doc = await openEdit(file),
    form = doc.getForm()
  if (form.hasXFA())
    throw Error(
      'This PDF uses XFA forms. Use the worksheet or a compatible XFA reader.',
    )
  const hasIndic = edited.some(
    (e) =>
      typeof e.value === 'string' && /\p{Script=Devanagari}/u.test(e.value),
  )
  const custom = edited.some(
    (e) => typeof e.value === 'string' && /[^\u0000-\u00ff]/u.test(e.value),
  )
  const font = custom
    ? await (async () => {
        doc.registerFontkit((await import('@pdf-lib/fontkit')).default)
        const bytes = await translationFontBytes()
        return doc.embedFont(bytes[hasIndic ? 1 : 0], { subset: false })
      })()
    : undefined
  for (const item of edited) {
    const field = form.getField(item.id)
    if (field instanceof PDFTextField && typeof item.value === 'string')
      field.setText(item.value)
    else if (field instanceof PDFCheckBox)
      item.value ? field.check() : field.uncheck()
    else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      const picked = Array.isArray(item.value)
        ? item.value
        : item.value
          ? [String(item.value)]
          : []
      if (picked.length) field.select(picked)
      else field.clear()
    } else if (field instanceof PDFRadioGroup) {
      if (item.value) field.select(String(item.value))
      else field.clear()
    }
  }
  try {
    form.updateFieldAppearances(font)
  } catch {
    throw Error(
      'Some text cannot be displayed in this form. Use supported characters or export the worksheet.',
    )
  }
  if (flatten) form.flatten({ updateFieldAppearances: false })
  return pdfBlob(await doc.save({ updateFieldAppearances: false }))
}
export default function FormAssistant() {
  const [file, setFile] = useState<File>(),
    [fields, setFields] = useState<Detected[]>(),
    [skipped, setSkipped] = useState<string[]>([])
  const [pages, setPages] = useState(1),
    [index, setIndex] = useState(0),
    [preview, setPreview] = useState<Blob>()
  const [finished, setFinished] = useState<Blob>(),
    [flatten, setFlatten] = useState(false),
    [worksheet, setWorksheet] = useState(''),
    [message, setMessage] = useState('')
  const op = useOperation()
  useJourneySources(file ? 1 : 0)
  const unavailable = fields?.length === 0
  const update = (entry: Detected, value: Value) => {
    setFields((items) =>
      items?.map((i) => (i.id === entry.id ? { ...i, value } : i)),
    )
    op.reset()
    setFinished(undefined)
  }
  return (
    <div className="advanced-space">
      <Panel title="Inspect an interactive form">
        <Dropzone
          compact
          label="Choose a PDF form"
          accept={[PDF]}
          onFiles={(f) => {
            setFile(f[0])
            setFields(undefined)
            setSkipped([])
            setPreview(undefined)
            setFinished(undefined)
            setWorksheet('')
            setIndex(0)
            setMessage('')
            op.reset()
          }}
        />
        <Button
          disabled={!file || op.pending}
          onClick={() =>
            void op.run(async () => {
              const pdf = await openEdit(file!),
                form = pdf.getForm()
              const result = form.hasXFA()
                ? { found: [], skipped: [] }
                : controls(form.getFields())
              setFields(result.found)
              setSkipped(result.skipped)
              setPages(pdf.getPageCount())
              setPreview(await previewPDF(file!, 0))
              setFinished(undefined)
              setMessage(
                form.hasXFA()
                  ? 'XFA form detected. Use the standalone preparation worksheet.'
                  : result.found.length
                    ? result.found.length + ' editable fields found.'
                    : 'No supported interactive fields. Use the standalone preparation worksheet.',
              )
              return []
            })
          }
        >
          Find PDF fields
        </Button>
        <Progress pending={op.pending} label="Processing the form locally" />
        <ErrorState error={op.error} />
        {message && <p role="status">{message}</p>}
        {!!skipped.length && (
          <details>
            <summary>
              {skipped.length} read-only or unsupported fields
            </summary>
            <ul>
              {skipped.map((name, i) => (
                <li key={i}>{name}</li>
              ))}
            </ul>
          </details>
        )}
      </Panel>
      {fields && (
        <div className="advanced-columns">
          <Panel
            title={
              unavailable ? 'Preparation worksheet' : 'Fill supported fields'
            }
          >
            {unavailable ? (
              <>
                <p className="muted">
                  This worksheet is a separate text file for preparing
                  answers. It does not fill a scanned or flat PDF.
                </p>
                <Button
                  variant="secondary"
                  disabled={op.pending}
                  onClick={() =>
                    void op.run(async () => {
                      const { text, truncated } = await localDocumentText(
                        file!,
                        new AbortController().signal,
                        () => {},
                        'eng',
                        4,
                      )
                      setWorksheet(
                        (text ? text + '\n\n' : '') +
                          'Answers to enter in the original form\n' +
                          (truncated
                            ? '[Source text limited to the first four pages]\n'
                            : ''),
                      )
                      return []
                    })
                  }
                >
                  Extract reference text with local OCR
                </Button>
                <Field label="Editable worksheet">
                  <textarea
                    rows={12}
                    maxLength={25000}
                    value={worksheet}
                    onChange={(e) => setWorksheet(e.target.value)}
                  />
                </Field>
                <Button
                  disabled={!worksheet.trim()}
                  onClick={() =>
                    saveFile({
                      name: 'form-preparation-worksheet.txt',
                      blob: new Blob([worksheet], {
                        type: 'text/plain;charset=utf-8',
                      }),
                    })
                  }
                >
                  Download worksheet
                </Button>
              </>
            ) : (
              <>
                <fieldset disabled={op.pending}>
                  {fields.map((item) =>
                    item.kind === 'check' ? (
                      <Check
                        key={item.id}
                        label={item.label}
                        checked={Boolean(item.value)}
                        onChange={(checked) => update(item, checked)}
                      />
                    ) : (
                      <Field key={item.id} label={item.label}>
                        {item.kind === 'text' ? (
                          item.multi ? (
                            <textarea
                              value={String(item.value)}
                              maxLength={4000}
                              rows={4}
                              onChange={(e) => update(item, e.target.value)}
                            />
                          ) : (
                            <input
                              value={String(item.value)}
                              maxLength={4000}
                              onChange={(e) => update(item, e.target.value)}
                            />
                          )
                        ) : item.kind === 'multiple' ? (
                          <select
                            multiple
                            value={item.value as string[]}
                            onChange={(e) =>
                              update(
                                item,
                                Array.from(
                                  e.currentTarget.selectedOptions,
                                  (v) => v.value,
                                ),
                              )
                            }
                          >
                            {item.options?.map((value) => (
                              <option value={value} key={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <select
                            value={String(item.value)}
                            onChange={(e) => update(item, e.target.value)}
                          >
                            <option value="">Leave blank</option>
                            {item.options?.map((value) => (
                              <option value={value} key={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                        )}
                      </Field>
                    ),
                  )}
                  <Check
                    label="Flatten fields for printing"
                    checked={flatten}
                    onChange={(value) => {
                      setFlatten(value)
                      setFinished(undefined)
                      op.reset()
                    }}
                  />
                  <p className="muted">
                    This creates a new PDF. Review long text and unusual fonts
                    in the preview before use.
                  </p>
                  <Button
                    onClick={() =>
                      void op.run(async () => {
                        const blob = await fill(file!, fields, flatten)
                        const thumb = await previewPDF(blob, index)
                        setPreview(thumb)
                        setFinished(blob)
                        return [
                          { name: stem(file!.name) + '-completed.pdf', blob },
                        ]
                      })
                    }
                  >
                    Preview and prepare filled PDF
                  </Button>
                </fieldset>
              </>
            )}
          </Panel>
          <Panel title="PDF preview">
            {pages > 1 && (
              <Field label="Preview page">
                <select
                  value={index}
                  disabled={op.pending}
                  onChange={(e) => {
                    const next = +e.target.value
                    setIndex(next)
                    void (async () => {
                      try {
                        setPreview(await previewPDF(finished ?? file!, next))
                      } catch {
                        setPreview(undefined)
                      }
                    })()
                  }}
                >
                  {Array.from({ length: Math.min(80, pages) }, (_, i) => (
                    <option value={i} key={i}>
                      Page {i + 1}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <FilePreview
              file={preview}
              label={finished ? 'Filled PDF page' : 'Original PDF page'}
            />
          </Panel>
        </div>
      )}
      <Results items={op.items} />
    </div>
  )
}
