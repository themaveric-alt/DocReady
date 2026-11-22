import { useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Languages,
  ShieldCheck,
} from 'lucide-react'
import {
  Button,
  Dropzone,
  ErrorState,
  Field,
  FileList,
  FilePreview,
  Panel,
  useObjectUrl,
} from '../../../components/shared'
import {
  errorText,
  images,
  PDF,
  saveFile,
  sizeLabel,
  stem,
  type ImageMime,
} from '../../../lib/files'
import { canvasBlob, imageSize } from '../../../lib/raster'
import { detectLanguage, languageNames, pairFor } from '../models/language'
import {
  installModel,
  modelInstalled,
  removeModel,
} from '../models/modelLoader'
import { estimatedDownload } from '../models/modelRegistry'
import { parseGlossary } from '../models/segments'
import {
  browserTranslationAvailable,
  translateWithBrowser,
} from '../models/browserTranslation'
import { translateBlocks } from '../models/translationEngine'
import type {
  Box,
  Extraction,
  JobProgress,
  Language,
  OCRLanguage,
  Pair,
  TextBlock,
} from '../types'
import { extractImage } from '../image-translator/imageOCR'
import { extractPdf } from '../pdf-translator/pdfTextExtractor'
import {
  overlayBox,
  renderTranslatedImage,
  type ImageMode,
} from '../image-translator/translatedImageRenderer'
import { exportImage } from '../image-translator/imageExport'
import { PdfDocument, type PDFMode } from '../pdf-translator/pdfLayoutEngine'
import { exportHTML } from '../pdf-translator/pdfExportEngine'
import { searchablePDF } from '../pdf-translator/searchablePDF'
import { LanguageSelector } from './LanguageSelector'
import { OriginalImage, OriginalPDF } from './OriginalPreview'
import { BlockEditor, ImageBoxFields } from './TranslationEditor'

const numberOfPages = (pages: Extraction['pages']) => pages.length
const opposite = (language: Language) => (language === 'en' ? 'hi' : 'en')
const steps = ['Upload', 'Choose Languages', 'Translate & Review', 'Export']

export default function TranslationWorkspace({
  kind,
}: {
  kind: 'pdf' | 'image'
}) {
  const pdf = kind === 'pdf'
  const [file, setFile] = useState<File>()
  const [source, setSource] = useState<Language | 'auto'>('auto')
  const [target, setTarget] = useState<Language>('hi')
  const [ocr, setOCR] = useState<OCRLanguage>('hin+eng')
  const [range, setRange] = useState('')
  const [mixed, setMixed] = useState(false)
  const [glossary, setGlossary] = useState('')
  const [extraction, setExtraction] = useState<Extraction>()
  const [selected, setSelected] = useState('')
  const [pageIndex, setPageIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [filter, setFilter] = useState('')
  const [modelState, setModelState] = useState<{
    pair: Pair
    installed: boolean
  }>()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [job, setJob] = useState<JobProgress>()
  const [pdfMode, setPDFMode] = useState<PDFMode>('reflow')
  const [font, setFont] = useState(15)
  const [fontStyle, setFontStyle] = useState<'sans' | 'serif'>('sans')
  const [imageMode, setImageMode] = useState<ImageMode>('replace')
  const [positions, setPositions] = useState<Record<string, Box>>({})
  const [format, setFormat] = useState<ImageMime | typeof PDF>('image/png')
  const [dpi, setDPI] = useState(300)
  const [quality, setQuality] = useState(0.92)
  const [scale, setScale] = useState(1)
  const [preview, setPreview] = useState<Blob>()
  const [previewError, setPreviewError] = useState('')
  const active = useRef<AbortController | null>(null)
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
      active.current?.abort()
    }
  }, [])
  const review = useRef<HTMLElement>(null)
  const outputPanel = useRef<HTMLElement>(null)
  const pages = extraction?.pages ?? []
  const blocks = extraction?.blocks ?? []
  const page = pages[pageIndex]
  const editableBlocks = pdf
    ? blocks.filter((b) => b.page === page?.index)
    : blocks
  const boxBlock = blocks.find((b) => b.id === selected)
  const finished = blocks.filter((b) => b.translated.trim()).length
  const ready = !!blocks.length && finished === blocks.length
  const direction = source === 'auto' ? opposite(target) : source
  const pair = direction === target ? undefined : pairFor(direction, target)
  const installed = modelState?.pair === pair && modelState?.installed
  const stage = ready ? 3 : extraction ? 2 : file ? 1 : 0
  const previewUrl = useObjectUrl(preview)

  useEffect(() => {
    let current = true
    if (pair)
      void modelInstalled(pair)
        .then((value) => {
          if (current) setModelState({ pair, installed: value })
        })
        .catch(() => {})
    return () => {
      current = false
    }
  }, [pair])
  useEffect(() => {
    if (pdf || !file || !extraction || !finished) {
      setPreview(undefined)
      setPreviewError('')
      return
    }
    let current = true
    const timeout = setTimeout(async () => {
      let canvas: HTMLCanvasElement | undefined
      try {
        const { width, height } = extraction.pages[0]
        canvas = await renderTranslatedImage(
          file,
          extraction.blocks,
          imageMode,
          Math.min(1, 1450 / Math.max(width, height)),
          positions,
        )
        const blob = await canvasBlob(canvas, 'image/png')
        if (current) {
          setPreview(blob)
          setPreviewError('')
        }
      } catch (e) {
        if (current) {
          setPreview(undefined)
          setPreviewError(errorText(e))
        }
      } finally {
        if (canvas) canvas.width = canvas.height = 0
      }
    }, 180)
    return () => {
      current = false
      clearTimeout(timeout)
    }
  }, [pdf, file, extraction, finished, imageMode, positions])

  const report = (value: JobProgress) => {
    if (live.current && !active.current?.signal.aborted) setJob(value)
  }
  async function run(
    stage: string,
    task: (signal: AbortSignal) => Promise<void>,
  ) {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    setJob({ stage })
    setError('')
    setNotice('')
    try {
      await task(controller.signal)
    } catch (e) {
      if (live.current)
        setError(
          controller.signal.aborted
            ? 'Operation cancelled. Completed edits are still available.'
            : errorText(e),
        )
    } finally {
      active.current = null
      if (live.current) setJob(undefined)
    }
  }
  function selectFile(value?: File) {
    if (active.current) return
    if (value && value.size > (pdf ? 36 : 20) * 1024 * 1024) {
      setError(`Choose a ${pdf ? 'PDF under 36 MB' : 'photo under 20 MB'}.`)
      return
    }
    setFile(value)
    setExtraction(undefined)
    setNotice('')
    setError('')
    setPageIndex(0)
    setSelected('')
    setPositions({})
    setPreview(undefined)
  }
  function edit(id: string, changes: Partial<TextBlock>) {
    setExtraction(
      (previous) =>
        previous && {
          ...previous,
          blocks: previous.blocks.map((b) =>
            b.id === id ? { ...b, ...changes } : b,
          ),
        },
    )
  }
  function changeSource(value: Language | 'auto') {
    setSource(value)
    if (value === 'es' || value === 'fr' || value === 'de') {
      setOCR({ es: 'spa', fr: 'fra', de: 'deu' }[value] as OCRLanguage)
    }
    if (value !== 'auto' && value === target) changeTarget(opposite(value))
  }
  function changeTarget(value: Language) {
    if (target !== value && finished)
      setNotice(
        'Existing translations were kept. Remove text from a block to translate it again into the new target language.',
      )
    setTarget(value)
    if (source !== 'auto' && source === value) setSource(opposite(value))
  }
  function refresh(pair: Pair) {
    return modelInstalled(pair).then((value) => {
      if (live.current) setModelState({ pair, installed: value })
    })
  }
  async function extract(signal: AbortSignal) {
    if (!file) return
    const result = pdf
      ? await extractPdf(file, range, ocr, mixed, signal, report)
      : await extractImage(file, ocr, signal, report)
    signal.throwIfAborted()
    if (
      result.blocks.length > 200 ||
      result.blocks.reduce((sum, b) => sum + b.original.length, 0) > 48000
    )
      throw Error(
        'This selection is too large for one local session. Try fewer PDF pages or crop the source image.',
      )
    setExtraction(result)
    setSelected(result.blocks[0]?.id ?? '')
    setPageIndex(0)
    setPositions({})
    const auto = detectLanguage(
      result.blocks.map((b) => b.original).join('\n'),
    )
    if (source === 'auto') {
      if (auto.language && auto.language !== target)
        setNotice(
          'Detected ' +
            languageNames[auto.language] +
            '. Review the extracted text before translating.',
        )
      else if (auto.language)
        setNotice(
          'The detected language matches the target. Choose a different target.',
        )
      else
        setNotice(
          'Language detection was uncertain. Choose the source language before translating.',
        )
    }
    requestAnimationFrame(() =>
      review.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
    )
  }
  async function manualBox(signal: AbortSignal) {
    if (!file || pdf) return
    const { width, height } = await imageSize(file)
    signal.throwIfAborted()
    const id = crypto.randomUUID()
    const entry: TextBlock = {
      id,
      page: 0,
      role: 'paragraph',
      original: '',
      translated: '',
      box: { x: 0.1, y: 0.08, width: 0.55, height: 0.16 },
    }
    setExtraction((old) => ({
      pages: old?.pages ?? [{ index: 0, width, height, scanned: false }],
      blocks: [...(old?.blocks ?? []), entry],
      warnings: old?.warnings ?? [],
    }))
    setSelected(id)
  }
  async function translate(signal: AbortSignal) {
    const missing = blocks.filter((b) => !b.translated.trim())
    if (!missing.length) return
    if (missing.some((b) => !b.original.trim()))
      throw Error(
        'Enter the original text in empty blocks, or use the translated field to enter a manual caption.',
      )
    const auto = detectLanguage(blocks.map((b) => b.original).join('\n'))
    const language = source === 'auto' ? auto.language : source
    if (!language)
      throw Error(
        'This text is too short or mixed for reliable language detection. Choose the source language in Translate from.',
      )
    if (language === target)
      throw Error('Choose different source and target languages.')
    const verifiedPair = pairFor(language, target)
    const terms = parseGlossary(glossary)
    const text = missing.map((b) => b.original)
    const result = (index: number, translated: string) => {
      if (live.current && !signal.aborted)
        edit(missing[index].id, { translated })
    }
    if (verifiedPair)
      await translateBlocks(verifiedPair, text, terms, signal, report, result)
    else
      await translateWithBrowser(
        language,
        target,
        text,
        terms,
        signal,
        report,
        result,
      )
    if (live.current)
      setNotice(
        'Translation is ready to review. Check names, negation and any uncertain OCR lines before export.',
      )
  }
  const translatedText = () =>
    pages
      .map((p) =>
        blocks
          .filter((b) => b.page === p.index && b.translated.trim())
          .map((b) => b.translated)
          .join('\n\n'),
      )
      .filter(Boolean)
      .join('\n\n')
  async function copy() {
    try {
      await navigator.clipboard.writeText(translatedText())
      setNotice('Translated text copied.')
    } catch {
      setError('Clipboard unavailable. Download the TXT file instead.')
    }
  }
  async function writeImage(signal: AbortSignal) {
    if (!file) return
    const canvas = await renderTranslatedImage(
      file,
      blocks,
      imageMode,
      scale,
      positions,
    )
    try {
      signal.throwIfAborted()
      const output = await exportImage(
        canvas,
        file.name,
        format,
        quality,
        dpi,
      )
      signal.throwIfAborted()
      saveFile(output)
      setNotice(output.detail ?? 'Image exported.')
    } finally {
      canvas.width = canvas.height = 0
    }
  }
  const resolution = page
    ? `${Math.round(page.width * scale * (imageMode === 'side' ? 2 : 1))} × ${Math.round(page.height * scale * (imageMode === 'stack' ? 2 : 1))} px`
    : ''
  const count = job && job.total !== undefined && job.done !== undefined
  return (
    <div className="translation-studio">
      <ol className="translation-steps" aria-label="Translation workflow">
        {steps.map((name, i) => (
          <li key={name} aria-current={stage === i ? 'step' : undefined}>
            <span>{stage > i ? <Check size={15} /> : i + 1}</span>
            {name}
          </li>
        ))}
      </ol>
      <div className="translation-intake">
        <Panel title={pdf ? 'Source PDF' : 'Source image'}>
          <fieldset disabled={!!job}>
            <Dropzone
              accept={pdf ? [PDF] : [...images]}
              onFiles={(files) => selectFile(files[0])}
              description={
                pdf
                  ? 'PDF · Up to 36 MB and 12 selected pages'
                  : 'JPG, PNG or WebP · Up to 20 MB'
              }
            />
            <FileList
              files={file ? [file] : []}
              onChange={(files) => selectFile(files[0])}
            />
          </fieldset>
          {!pdf && file && !extraction && (
            <FilePreview file={file} label="Source image" />
          )}
        </Panel>
        <Panel title="Languages & model">
          <fieldset disabled={!!job}>
            <LanguageSelector
              source={source}
              target={target}
              ocr={ocr}
              setSource={changeSource}
              setTarget={changeTarget}
              setOCR={setOCR}
            />
            {pdf && (
              <div className="form-grid translation-more">
                <Field label="Pages">
                  <input
                    placeholder="All pages, or 1, 3–5"
                    value={range}
                    onChange={(e) => setRange(e.target.value)}
                  />
                </Field>
                <label className="translation-check">
                  <input
                    type="checkbox"
                    checked={mixed}
                    onChange={(e) => setMixed(e.target.checked)}
                  />{' '}
                  OCR all selected pages, including pages with native text
                </label>
              </div>
            )}
            <details className="translation-advanced">
              <summary>Terminology glossary</summary>
              <Field label="Glossary entries">
                <textarea
                  rows={3}
                  value={glossary}
                  maxLength={2500}
                  onChange={(e) => setGlossary(e.target.value)}
                  placeholder="DocReadyApp = DocReadyApp"
                />
              </Field>
              <small>
                One entry per line. The glossary stays in this tab until you
                leave or reload.
              </small>
            </details>
            {!pair && (
              <p className="mini">
                {browserTranslationAvailable()
                  ? 'This direction uses your browser’s on-device translation pack when available.'
                  : 'Spanish, French and German require a supported desktop browser with on-device translation.'}
              </p>
            )}
            {pair && (
              <div className="translation-model">
                <div>
                  <strong>
                    {languageNames[direction]} → {languageNames[target]}
                  </strong>
                  <small>
                    About {sizeLabel(estimatedDownload(pair))} download + 14
                    MB shared runtime ·{' '}
                    {installed
                      ? 'Saved for offline use'
                      : 'Available to load'}
                  </small>
                </div>
                <div className="action-row">
                  {!installed && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void run(
                          'Preparing model download',
                          async (signal) => {
                            await installModel(pair, signal, report)
                            await refresh(pair)
                            setNotice(
                              'Model saved. This direction is available offline when the app is cached.',
                            )
                          },
                        )
                      }
                    >
                      <Download size={16} /> Save offline
                    </Button>
                  )}
                  <Button
                    variant="quiet"
                    onClick={() =>
                      void run('Removing local model', async () => {
                        await removeModel(pair)
                        await refresh(pair)
                        setNotice(
                          'Local model files for this direction were removed.',
                        )
                      })
                    }
                  >
                    Remove model
                  </Button>
                </div>
              </div>
            )}
          </fieldset>
          <p className="mini">
            <ShieldCheck size={14} /> Only static model files are downloaded.
            Documents and text stay in this tab. Large models can be slow on
            low-memory devices.
          </p>
          <div className="action-row">
            <Button
              disabled={!file || !!job}
              onClick={() => void run('Reading the source file', extract)}
            >
              Extract text
            </Button>
            {!pdf && (
              <Button
                variant="secondary"
                disabled={!file || !!job || blocks.length >= 200}
                onClick={() => void run('Preparing a text box', manualBox)}
              >
                Add manual text box
              </Button>
            )}
            {job && (
              <Button
                variant="secondary"
                onClick={() => active.current?.abort()}
              >
                Cancel
              </Button>
            )}
          </div>
          {job && (
            <div className="translation-status" role="status">
              <strong>{job.stage}</strong>
              {count && (
                <>
                  <progress value={job.done} max={job.total} />
                  <small>
                    {job.unit === 'bytes'
                      ? sizeLabel(job.done!) + ' of ' + sizeLabel(job.total!)
                      : job.done + ' of ' + job.total + ' ' + job.unit}
                  </small>
                </>
              )}
            </div>
          )}
          <ErrorState error={error} />
          {notice && (
            <p role="status" className="notice">
              {notice}
            </p>
          )}
        </Panel>
      </div>
      {!!extraction && file && (
        <>
          <section
            ref={review}
            className="translation-review"
            aria-label="Translate and review"
          >
            <div className="section-head">
              <h2>Translate & review</h2>
              <div className="action-row">
                <Button
                  disabled={!!job || ready}
                  onClick={() =>
                    void run('Preparing local translation', translate)
                  }
                >
                  <Languages size={17} /> Translate remaining text
                </Button>
                <Button
                  variant="secondary"
                  disabled={!finished || !!job}
                  onClick={() => void copy()}
                >
                  Copy text
                </Button>
              </div>
            </div>
            {extraction.warnings.length > 0 && (
              <div className="notice">
                <strong>Some pages need review</strong>
                <ul>
                  {extraction.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {error && <ErrorState error={error} />}
            {job && (
              <p className="mini" role="status">
                {job.stage}
                {count && job.unit === 'blocks'
                  ? ' · ' + job.done + '/' + job.total
                  : ''}
              </p>
            )}
            <div className="translation-review-grid">
              <Panel
                title={pdf ? 'Original PDF' : 'Original image & text boxes'}
              >
                {pdf && page ? (
                  <>
                    <div className="translation-paging">
                      <Button
                        variant="quiet"
                        aria-label="Previous page"
                        disabled={pageIndex === 0}
                        onClick={() => setPageIndex((value) => value - 1)}
                      >
                        <ChevronLeft size={18} />
                      </Button>
                      <span>
                        Page {page.index + 1} · {pageIndex + 1} /{' '}
                        {numberOfPages(pages)}
                      </span>
                      <Button
                        variant="quiet"
                        aria-label="Next page"
                        disabled={pageIndex >= pages.length - 1}
                        onClick={() => setPageIndex((value) => value + 1)}
                      >
                        <ChevronRight size={18} />
                      </Button>
                    </div>
                    <Field label="Original PDF zoom">
                      <input
                        type="range"
                        min={0.7}
                        max={1.8}
                        step={0.1}
                        value={zoom}
                        onChange={(e) => setZoom(+e.target.value)}
                      />
                    </Field>
                    <OriginalPDF file={file} page={page.index} zoom={zoom} />
                  </>
                ) : (
                  <OriginalImage
                    file={file}
                    blocks={blocks}
                    positions={positions}
                    mode={imageMode}
                    selected={selected}
                    select={setSelected}
                    change={(id, box) =>
                      setPositions((value) => ({ ...value, [id]: box }))
                    }
                  />
                )}
              </Panel>
              <Panel
                title={
                  pdf ? 'Translated document' : 'Translated image preview'
                }
              >
                {pdf && page ? (
                  <PdfDocument
                    pages={pages}
                    blocks={blocks}
                    mode={pdfMode}
                    font={font}
                    fontStyle={fontStyle}
                    onlyPage={page.index}
                    onFallback
                  />
                ) : previewUrl ? (
                  <img
                    className="translation-image-output"
                    src={previewUrl}
                    alt="Preview of the translated image"
                  />
                ) : (
                  <p className="mini">
                    Translate or edit a text box to preview the image.
                  </p>
                )}
                <ErrorState error={previewError} />
              </Panel>
            </div>
            <Panel title="Editable text blocks">
              <fieldset disabled={!!job}>
                <Field label="Search original or translated text">
                  <input
                    type="search"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                </Field>
                <BlockEditor
                  blocks={editableBlocks}
                  filter={filter}
                  selected={selected}
                  pick={setSelected}
                  edit={edit}
                />
              </fieldset>
            </Panel>
          </section>
          <section ref={outputPanel} aria-label="Export translation">
            <Panel title="Export settings">
              <fieldset disabled={!!job}>
                <div className="form-grid">
                  {pdf ? (
                    <>
                      <Field label="Document layout">
                        <select
                          value={pdfMode}
                          onChange={(e) =>
                            setPDFMode(e.target.value as PDFMode)
                          }
                        >
                          <option value="reflow">
                            Clean reflowed document
                          </option>
                          <option value="layout">
                            Preserve positions where possible
                          </option>
                          <option value="bilingual-columns">
                            Bilingual · two columns
                          </option>
                          <option value="bilingual-blocks">
                            Bilingual · block by block
                          </option>
                          <option value="bilingual-pages">
                            Bilingual · original then translation
                          </option>
                        </select>
                      </Field>
                      <Field label="Unicode font">
                        <select
                          value={fontStyle}
                          onChange={(e) =>
                            setFontStyle(e.target.value as typeof fontStyle)
                          }
                        >
                          <option value="sans">Unicode sans</option>
                          <option value="serif">
                            Serif with Unicode fallback
                          </option>
                        </select>
                      </Field>
                      <Field label="Font size (px)">
                        <input
                          type="number"
                          min={10}
                          max={28}
                          value={font}
                          onChange={(e) =>
                            setFont(
                              Math.max(10, Math.min(28, +e.target.value)),
                            )
                          }
                        />
                      </Field>
                    </>
                  ) : (
                    <>
                      <Field label="Image layout">
                        <select
                          value={imageMode}
                          onChange={(e) => {
                            setImageMode(e.target.value as ImageMode)
                            setPositions({})
                          }}
                        >
                          <option value="overlay">Translation overlay</option>
                          <option value="replace">
                            Replace text with edge-color or panel
                          </option>
                          <option value="side">
                            Original + translation · side by side
                          </option>
                          <option value="stack">
                            Original + translation · top and bottom
                          </option>
                          <option value="captions">
                            Original with translated captions
                          </option>
                        </select>
                      </Field>
                      <Field label="Image output format">
                        <select
                          value={format}
                          onChange={(e) =>
                            setFormat(e.target.value as typeof format)
                          }
                        >
                          <option value="image/png">PNG</option>
                          <option value="image/jpeg">JPEG</option>
                          <option value="image/webp">WebP</option>
                          <option value={PDF}>PDF · image only</option>
                        </select>
                      </Field>
                      <Field label="Pixel scale">
                        <select
                          value={scale}
                          onChange={(e) => setScale(+e.target.value)}
                        >
                          <option value=".5">50%</option>
                          <option value="1">Original pixel size</option>
                          <option value="1.5">150% upscale</option>
                          <option value="2">200% upscale</option>
                        </select>
                      </Field>
                      <Field label="Print resolution">
                        <select
                          value={dpi}
                          onChange={(e) => setDPI(+e.target.value)}
                        >
                          <option value="150">150 pixels/in</option>
                          <option value="300">300 pixels/in</option>
                          <option value="600">600 pixels/in</option>
                        </select>
                      </Field>
                      {(format === 'image/jpeg' ||
                        format === 'image/webp') && (
                        <Field label="Image quality">
                          <input
                            type="range"
                            min=".45"
                            max="1"
                            step=".01"
                            value={quality}
                            onChange={(e) => setQuality(+e.target.value)}
                          />
                        </Field>
                      )}
                    </>
                  )}
                </div>
                {!pdf && imageMode !== 'captions' && boxBlock && (
                  <details className="translation-advanced" open>
                    <summary>Adjust selected text box</summary>
                    <ImageBoxFields
                      block={boxBlock}
                      position={
                        positions[boxBlock.id] ??
                        overlayBox(boxBlock.box, imageMode)
                      }
                      edit={(style) => edit(boxBlock.id, { style })}
                      move={(box) =>
                        setPositions((previous) => ({
                          ...previous,
                          [boxBlock.id]: box,
                        }))
                      }
                      reset={() => {
                        edit(boxBlock.id, { style: undefined })
                        setPositions((old) => {
                          const next = { ...old }
                          delete next[boxBlock.id]
                          return next
                        })
                      }}
                    />
                  </details>
                )}
              </fieldset>
              {pdf ? (
                <p className="mini">
                  The downloadable PDF combines a 180 DPI visual layer with
                  selectable Unicode text. Position matching can reflow a page
                  when a translation cannot fit.
                </p>
              ) : (
                <p className="mini">
                  {resolution && imageMode !== 'captions'
                    ? 'Expected image size ' + resolution + '. '
                    : ''}
                  Image export renders text into pixels. Print resolution sets
                  physical sizing. It cannot recover details lost in a
                  low-resolution input.
                </p>
              )}
              <div className="action-row">
                {pdf ? (
                  <>
                    <Button
                      disabled={!finished || !!job}
                      onClick={() =>
                        void run(
                          'Preparing document layout',
                          async (signal) => {
                            const output = await searchablePDF(
                              file.name,
                              pages,
                              blocks,
                              pdfMode,
                              font,
                              fontStyle,
                              signal,
                              report,
                            )
                            signal.throwIfAborted()
                            saveFile(output)
                            setNotice(output.detail ?? 'PDF exported.')
                          },
                        )
                      }
                    >
                      <Download size={17} /> Download translated PDF
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!finished || !!job}
                      onClick={() =>
                        void run(
                          'Generating Unicode document',
                          async (signal) => {
                            const result = await exportHTML(
                              file.name,
                              pages,
                              blocks,
                              pdfMode,
                              font,
                              fontStyle,
                            )
                            signal.throwIfAborted()
                            saveFile(result)
                          },
                        )
                      }
                    >
                      Download HTML
                    </Button>
                  </>
                ) : (
                  <Button
                    disabled={!finished || !!job}
                    onClick={() =>
                      void run('Generating translated image', writeImage)
                    }
                  >
                    <Download size={17} /> Download translated image
                  </Button>
                )}
                <Button
                  variant="secondary"
                  disabled={!finished || !!job}
                  onClick={() =>
                    saveFile({
                      name: stem(file.name) + '-translated.txt',
                      blob: new Blob([translatedText()], {
                        type: 'text/plain;charset=utf-8',
                      }),
                    })
                  }
                >
                  Download TXT
                </Button>
              </div>
              {error && <ErrorState error={error} />}
              {notice && (
                <p className="notice" role="status">
                  {notice}
                </p>
              )}
            </Panel>
          </section>
        </>
      )}
    </div>
  )
}
