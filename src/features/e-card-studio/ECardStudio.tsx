import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useJourneySources } from '../../components/ToolJourney'
import {
  Camera,
  Check,
  CreditCard,
  Crop,
  Download,
  Eye,
  FilePlus2,
  LockKeyhole,
  Printer,
  RotateCcw,
  RotateCw,
  ScanLine,
  ShieldCheck,
  Repeat2,
  Upload,
  X,
} from 'lucide-react'
import {
  Button,
  Check as Checkbox,
  Dropzone,
  ErrorState,
  Field,
  Modal,
  Panel,
  Progress,
  Results,
  useObjectUrl,
} from '../../components/shared'
import {
  errorText,
  images,
  PDF,
  saveFile,
  validateFiles,
  type Output,
  safeName,
  stem,
} from '../../lib/files'
import { openLocalOCR, type OCRLanguage } from '../../lib/local-ocr'
import type { RenderPDF } from '../../lib/pdf-render'
import {
  detectionCanvas,
  makeSources,
  presets,
  release,
  rotationIn,
  sideFromText,
  textIn,
  type Preset,
  type Source,
} from './cardInput'
import { intrinsic, previewCrop, type Card } from './cardCrop'
import {
  bounds,
  compactPDFQuad,
  fullQuad,
  paperLike,
} from './geometry'
import { openDetector, type Candidate } from './vision'
import { selectCardPair } from './cardPair'
import { manualWalletSeed, sourceWalletQuad } from './walletRegions'
import { CropEditor } from './CropEditor'
import { CardCamera } from './CardCamera'
import {
  LayoutChoice,
  NumberField,
  PaperPreview,
  PrintControls,
  sideLabel,
} from './PrintControls'
import {
  ID1,
  defaultPrint,
  planSheets,
  type Position,
  type PrintSettings,
  type Side,
  type Size,
} from './printLayout'
import { prepareExport, type ExportFormat } from './printExport'
import { fillPrintWindow, openPrintWindow } from './printWindow'
import './ecard.css'
import CardTypeSelector from './CardTypeSelector'
import { cardFilename, govtCards, layoutPrior, type GovtCardId } from './cardProfiles'
import { VaultBridge } from '../../lib/vault-bridge'

const accepts = [PDF, ...images]
const maxCards = 24
const maxPDFPages = () =>
  ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4) <=
  2
    ? 12
    : 24

function likelyAadhaar(source: Source, preset: Preset) {
  return (
    source.pdf &&
    (source.aadhaar || preset === 'aadhaar' || preset === 'masked')
  )
}

type SizeMode = 'id1' | 'ratio' | 'custom'
type Pick = { accepts: string[]; side?: Side; replace?: string }
type PasswordPrompt = {
  name: string
  incorrect: boolean
  resolve: (password: string) => void
  reject: (error: Error) => void
}
const confidence: Record<Card['confidence'], string> = {
  high: 'High-confidence side suggestion',
  uncertain: 'Uncertain side suggestion',
  unknown: 'Side unknown',
  manual: 'Side confirmed',
}

function flattenSize(
  card: Card,
  mode: SizeMode,
  custom: Size,
  locked: boolean,
) {
  if (card.physical) return card.physical
  if (mode === 'id1') return ID1
  const raw = intrinsic(card)
  return {
    width: custom.width,
    height:
      mode === 'ratio' || locked
        ? Math.round(((custom.width * raw.height) / raw.width) * 100) / 100
        : custom.height,
  }
}
function cardAssignments(cards: Card[], all: Card[]) {
  const used = new Set<Side>(
    all.filter((card) => card.side !== 'extra').map((card) => card.side),
  )
  const mapped = new Map<string, Card>()
  const priority = { manual: 0, high: 1, uncertain: 2, unknown: 3 }
  for (const card of [...cards].sort(
    (a, b) => priority[a.confidence] - priority[b.confidence],
  )) {
    if (card.side === 'extra' || used.has(card.side)) continue
    used.add(card.side)
    mapped.set(card.id, card)
  }
  return cards.map((card) => {
    const identified = mapped.get(card.id)
    if (identified) return identified
    if (card.side === 'extra' && card.confidence === 'manual') return card
    const next: Side = !used.has('front')
      ? 'front'
      : !used.has('back')
        ? 'back'
        : 'extra'
    if (next !== 'extra') used.add(next)
    return {
      ...card,
      side: next,
      accepted: false,
      confidence: card.side === 'extra' ? card.confidence : 'uncertain',
    }
  })
}
function PasswordDialog({
  request,
  close,
}: {
  request: PasswordPrompt
  close: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  function submit(e: FormEvent) {
    e.preventDefault()
    if (input.current?.value) {
      const secret = input.current.value
      input.current.value = ''
      request.resolve(secret)
    }
  }
  return (
    <Modal title="Unlock PDF on this device" branded onClose={close}>
      <p className="muted">
        Enter the password for <strong>{request.name}</strong>. It is used
        only to open this copy.
      </p>
      {request.incorrect && (
        <ErrorState error="Incorrect password. Try again." />
      )}
      <form className="ecard-password" onSubmit={submit} autoComplete="off">
        <Field label="PDF password">
          <input
            key={String(request.incorrect)}
            ref={input}
            type="password"
            autoComplete="off"
            autoFocus
            required
          />
        </Field>
        <Button type="submit">
          <LockKeyhole size={17} /> Open PDF
        </Button>
      </form>
    </Modal>
  )
}
function CardItem({
  card,
  index,
  mode,
  size,
  locked,
  edit,
  onSide,
  rotate,
  remove,
  replace,
  duplicate,
  patch,
}: {
  card: Card
  index: number
  mode: SizeMode
  size: Size
  locked: boolean
  edit: () => void
  onSide: (s: Side) => void
  rotate: () => void
  remove: () => void
  replace: () => void
  duplicate: () => void
  patch: (physical?: Size) => void
}) {
  const url = useObjectUrl(card.preview.blob)
  const current = flattenSize(card, mode, size, locked)
  const raw = intrinsic(card)
  return (
    <article className="ecard-card">
      <header>
        <div>
          <strong>{sideLabel(card)}</strong>
          <small title={card.source.file.name}>
            {card.source.file.name}
            {card.source.page !== undefined
              ? ` · Page ${card.source.page + 1}`
              : ''}
          </small>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label={'Remove crop ' + (index + 1)}
          onClick={remove}
        >
          <X size={17} />
        </button>
      </header>
      <div className="ecard-card-image">
        <img src={url} alt={sideLabel(card) + ' crop preview'} />
      </div>
      <p className={card.accepted ? 'ecard-reviewed' : 'ecard-warn'}>
        {card.detected
          ? confidence[card.confidence]
          : 'Boundary uncertain · review crop'}
      </p>
      <div className="ecard-card-actions">
        <Button variant="secondary" onClick={edit}>
          <Crop size={16} /> Adjust crop
        </Button>
        <Button variant="quiet" onClick={rotate}>
          <RotateCw size={16} /> Rotate
        </Button>
        <Button variant="quiet" onClick={replace}>
          Replace
        </Button>
        <Button variant="quiet" onClick={duplicate}>
          Add crop from source
        </Button>
      </div>
      <Field label={'Set side for crop ' + (index + 1)}>
        <select
          value={card.side}
          onChange={(e) => onSide(e.target.value as Side)}
        >
          <option value="front">Front</option>
          <option value="back">Back</option>
          <option value="extra">Extra card</option>
        </select>
      </Field>
      <details className="ecard-per-card">
        <summary>Card size override</summary>
        <div className="ecard-fields">
          <NumberField
            label="This card’s width (mm)"
            value={current.width}
            min={5}
            max={560}
            step={0.01}
            change={(width) =>
              patch({
                width,
                height: locked
                  ? Math.round(((width * raw.height) / raw.width) * 100) / 100
                  : current.height,
              })
            }
          />
          <NumberField
            label="This card’s height (mm)"
            value={current.height}
            min={5}
            max={560}
            step={0.01}
            change={(height) =>
              patch({
                height,
                width: locked
                  ? Math.round(((height * raw.width) / raw.height) * 100) /
                    100
                  : current.width,
              })
            }
          />
        </div>
        {card.physical && (
          <Button variant="quiet" onClick={() => patch()}>
            Use workspace size
          </Button>
        )}
      </details>
    </article>
  )
}
export default function ECardStudio() {
  const [selectedType, setSelectedType] = useState<GovtCardId | null>(null)
  const [outputName, setOutputName] = useState('Govt_ID_Card.pdf')
  const [cards, setCards] = useState<Card[]>([])
  useJourneySources(cards.length)
  const [settings, setSettings] = useState<PrintSettings>({ ...defaultPrint, marks: 'border' })
  const [preset, setPreset] = useState<Preset>('generic')
  const [sizeMode, setSizeMode] = useState<SizeMode>('custom')
  const [size, setSize] = useState<Size>({ width: 85.6, height: 54 })
  const [locked, setLocked] = useState(false)
  const [sizePresets, setSizePresets] = useState<Size[]>([])
  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [ocrLanguage, setOCRLanguage] = useState<OCRLanguage>('eng')
  const [editing, setEditing] = useState<string>()
  const [password, setPassword] = useState<PasswordPrompt>()
  const [resetDialog, setResetDialog] = useState(false)
  const [camera, setCamera] = useState(false)
  const [status, setStatus] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [items, setItems] = useState<Output[]>([])
  const job = useRef<AbortController | undefined>(undefined),
    resources = useRef(new Set<RenderPDF>())
  const sourcePages = useRef(new Map<File, Source[]>())
  const input = useRef<HTMLInputElement>(null),
    pick = useRef<Pick>({ accepts })
  const section = useRef<HTMLDivElement>(null)
  const printTab = useRef<Window | undefined>(undefined)
  const printURLs = useRef(new Set<string>())
  function clearPrint() {
    printTab.current?.close()
    printTab.current = undefined
    for (const url of printURLs.current) URL.revokeObjectURL(url)
    printURLs.current.clear()
  }
  const refs = useRef(cards)
  refs.current = cards
  const needsCrop = cards.some((c) => !c.detected)
  const review = cards.some((c) => !c.accepted)
  const dimensions = useMemo(
    () =>
      cards.map((card) => ({
        id: card.id,
        side: card.side,
        ...flattenSize(card, sizeMode, size, locked),
      })),
    [cards, sizeMode, size, locked],
  )
  const plan = useMemo(() => {
    try {
      return { sheets: planSheets(dimensions, settings), error: '' }
    } catch (e) {
      return { sheets: [], error: errorText(e) }
    }
  }, [dimensions, settings])
  const candidate = cards.find((c) => c.id === editing)
  const exportReady = Boolean(
    !needsCrop && !review && plan.sheets.length && !status,
  )
  useEffect(
    () => () => {
      job.current?.abort()
      for (const doc of resources.current) void doc.dispose().catch(() => {})
      clearPrint()
    },
    [],
  )
  function updateCards(next: Card[]) {
    const used = new Set(
      next.flatMap((c) => (c.source.pdf ? [c.source.pdf] : [])),
    )
    for (const doc of resources.current)
      if (!used.has(doc)) {
        resources.current.delete(doc)
        void doc.dispose().catch(() => {})
      }
    const files = new Set(next.map((card) => card.source.file))
    for (const file of sourcePages.current.keys())
      if (!files.has(file)) sourcePages.current.delete(file)
    refs.current = next
    setCards(next)
    setItems([])
  }
  function changeSettings(p: Partial<PrintSettings>) {
    setItems([])
    setSettings((s) => ({ ...s, ...p }))
  }
  async function run(
    label: string,
    action: (signal: AbortSignal) => Promise<void>,
  ) {
    if (job.current) return
    const current = new AbortController()
    job.current = current
    setStatus(label)
    setError('')
    setNotice('')
    try {
      await action(current.signal)
    } catch (e) {
      if (!current.signal.aborted) setError(errorText(e))
    } finally {
      if (job.current === current) {
        job.current = undefined
        setStatus('')
        setPassword(undefined)
      }
    }
  }
  function ask(file: File, signal: AbortSignal, incorrect: boolean) {
    return new Promise<string>((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason)
        return
      }
      const cancel = () => {
        signal.removeEventListener('abort', cancel)
        reject(Error('Password entry cancelled.'))
      }
      signal.addEventListener('abort', cancel, { once: true })
      setPassword({
        name: file.name,
        incorrect,
        resolve: (secret) => {
          signal.removeEventListener('abort', cancel)
          setPassword(undefined)
          resolve(secret)
        },
        reject: (e) => {
          signal.removeEventListener('abort', cancel)
          setPassword(undefined)
          reject(e)
        },
      })
    })
  }
  async function detectSources(
    sources: Source[],
    signal: AbortSignal,
    maximum: number,
    requestedSide?: Side,
  ) {
    const output: Card[] = []
    const byFile = new Map<
      File,
      {
        source: Source
        region: Candidate
        side?: Side
        high: boolean
        rank: number
        rotation?: number
      }[]
    >()
    let detector: ReturnType<typeof openDetector> | undefined
    let failed = false
    try {
      try {
        detector = openDetector(signal)
      } catch {
        failed = true
      }
      for (const [i, source] of sources.entries()) {
        signal.throwIfAborted()
        setStatus(
          `Finding card boundaries · source ${i + 1} of ${sources.length}`,
        )
        const page = Boolean(
          source.pdf && paperLike(source.width, source.height),
        )
        const aadhaar = likelyAadhaar(source, preset)
        const analysis = page ? {
          width: source.width, height: source.height,
          rotation: source.pageRotation ?? 0,
          lowerSection: preset !== 'custom',
          anchors: source.hints.map(hint => hint.box),
        } : undefined
        const canvas = await detectionCanvas(source)
        let found: Candidate[] = []
        try {
          if (detector)
            found = await detector.detect(
              canvas,
              presets[preset][1],
              analysis,
            )
        } catch {
          signal.throwIfAborted()
          failed = true
          detector?.close()
          detector = undefined
        } finally {
          release(canvas)
        }
        if (page)
          found = found.filter((region) =>
            analysis?.lowerSection
              ? sourceWalletQuad(region.corners, analysis)
              : compactPDFQuad(region.corners, source.width, source.height),
          )
        const full = sideFromText(textIn(source, fullQuad), preset)
        const rotated = Math.abs(source.pageRotation ?? 0) % 180 === 90
        const ratio = rotated ? source.height / source.width : source.width / source.height
        if (
          source.pdf &&
          !page &&
          full.side &&
          ratio >= 1.50 &&
          ratio <= 1.65 &&
          Math.max(source.width, source.height) <= 390 &&
          Math.min(source.width, source.height) <= 255
        )
          found = [{ corners: fullQuad, score: 0.95 }]
        const entries = byFile.get(source.file) ?? []
        byFile.set(source.file, entries)
        for (const region of found) {
          const estimate = sideFromText(
            textIn(source, region.corners),
            aadhaar ? 'aadhaar' : preset,
          )
          const side = estimate.side ?? region.suggestedSide
          const high = estimate.high
          const { top, bottom } = bounds(region.corners)
          const rank =
            region.score + layoutPrior(preset, source, region.corners) +
            (high ? 0.22 : side ? 0.11 : 0) +
            (aadhaar && bottom > 0.67 && top > 0.42 ? 0.12 : 0)
          entries.push({ source, region, side, high, rank,
            rotation: source.pdf && source.imageOnly ? (360 - (source.pageRotation ?? 0)) % 360 : undefined,
          })
        }
      }
      detector?.close()
      detector = undefined
      for (const [file, regions] of byFile) {
        const pages = sources.filter((source) => source.file === file)
        const aadhaar = pages.some((source) => likelyAadhaar(source, preset))
        const scanCandidates = regions.filter(
          ({ source, high, region }) =>
            source.pdf &&
            source.imageOnly &&
            !high &&
            !region.inferred &&
            (aadhaar || bounds(region.corners).top > 0.45),
        )
        if (scanCandidates.length === 2) {
          setStatus('Checking the cropped sides with local OCR')
          let ocr: Awaited<ReturnType<typeof openLocalOCR>> | undefined
          try {
            ocr = await openLocalOCR(ocrLanguage, signal)
            for (const item of scanCandidates) {
              const box = bounds(item.region.corners)
              const tall =
                (box.bottom - box.top) * item.source.height >
                (box.right - box.left) * item.source.width
              for (const rotation of tall ? [90, 270] : [0]) {
                const crop = await previewCrop(
                  item.source,
                  item.region.corners,
                  rotation,
                  signal,
                )
                const data = await ocr.recognize(crop.blob)
                const estimate = sideFromText(
                  data.text,
                  aadhaar ? 'aadhaar' : preset,
                )
                if (estimate.side) {
                  Object.assign(item, estimate, { rotation })
                  break
                }
              }
            }
          } catch {
            signal.throwIfAborted()
          } finally {
            await ocr?.close()
          }
        }
        let selected = [...regions].sort((a, b) => b.rank - a.rank)
        if (aadhaar) {
          selected = selectCardPair(regions)
        }
        if (requestedSide && requestedSide !== 'extra') {
          const preferred = [...regions]
            .filter((entry) => entry.side === requestedSide)
            .sort((a, b) => b.rank - a.rank)[0]
          if (preferred) selected = [preferred]
        }
        if (!selected.length && pages.length) {
          const source =
            [...pages].reverse().find((p) => p.hints.length) ?? pages[0]
          const corners =
            source.pdf && paperLike(source.width, source.height)
              ? manualWalletSeed(source.width, source.height, requestedSide, source.pageRotation)
              : fullQuad
          selected = [
            { source, region: { corners, score: 0 }, high: false, rank: 0 },
          ]
        }
        for (const {
          source,
          region,
          side,
          high,
          rotation: suggestedRotation,
        } of selected.slice(0, maximum - output.length)) {
          const detected = region.score > 0
          const rotation = detected
            ? (suggestedRotation ?? rotationIn(source, region.corners))
            : 0
          output.push({
            id: crypto.randomUUID(),
            source,
            corners: region.corners,
            original: region.corners,
            rotation,
            preview: await previewCrop(
              source,
              region.corners,
              rotation,
              signal,
            ),
            detected,
            walletOnly: Boolean(source.pdf && paperLike(source.width, source.height) && preset !== 'custom'),
            side: side ?? 'extra',
            confidence: high ? 'high' : side ? 'uncertain' : 'unknown',
            accepted: detected && high && !region.inferred,
          })
        }
        if (output.length >= maximum) break
      }
      return { output, failed }
    } finally {
      detector?.close()
    }
  }
  async function add(files: File[], chosen: Pick) {
    await run('Reading files on this device', async (signal) => {
      await validateFiles(files, chosen.accepts)
      const current = refs.current
      const replaced = current.find((card) => card.id === chosen.replace)
      const maximum = replaced || chosen.side ? 1 : maxCards - current.length
      if (!replaced && current.length >= maxCards)
        throw Error(
          'This workspace has 24 crops. Remove one before adding more.',
        )
      if (
        files.length > 12 ||
        files.reduce((n, f) => n + f.size, 0) > 105 * 1024 * 1024
      )
        throw Error('Choose up to 12 files and 105 MB in one batch.')
      const sources: Source[] = [],
        errors: string[] = []
      let pdfPages = 0
      const batchPages = maxPDFPages() * 2
      try {
        for (const [i, file] of files.entries()) {
          signal.throwIfAborted()
          setStatus(`Opening source ${i + 1} of ${files.length}`)
          try {
            const result = await makeSources(
              file,
              signal,
              (incorrect) => ask(file, signal, incorrect),
              (doc) => resources.current.add(doc),
              Math.min(maxPDFPages(), batchPages - pdfPages),
            )
            sources.push(...result.sources)
            pdfPages += result.sources.filter((source) => source.pdf).length
            if (result.truncated)
              errors.push(
                `Scanned ${result.sources.length} pages of one PDF to stay within this device’s limit. Split the file to use later pages.`,
              )
          } catch (e) {
            signal.throwIfAborted()
            errors.push(errorText(e))
          }
        }
        if (!sources.length)
          throw Error(errors.join(' ') || 'No files were readable.')
        const { output, failed } = await detectSources(
          sources,
          signal,
          maximum,
          chosen.side ?? replaced?.side,
        )
        signal.throwIfAborted()
        for (const source of sources) {
          const pages = sources.filter((page) => page.file === source.file)
          sourcePages.current.set(source.file, pages)
        }
        if (replaced || chosen.side) {
          const side = chosen.side ?? replaced!.side
          const first = {
            ...output[0],
            id: replaced?.id ?? output[0].id,
            side,
            confidence: 'manual' as const,
            accepted: output[0].detected,
            physical: replaced?.physical,
          }
          const next = replaced
            ? current.map((c) => (c.id === first.id ? first : c))
            : [
                ...current.map((c) =>
                  c.side === side ? { ...c, side: 'extra' as const } : c,
                ),
                first,
              ]
          updateCards(next)
        } else updateCards([...current, ...cardAssignments(output, current)])
        if (failed)
          errors.push(
            'Automatic detection is unavailable on this device. Use manual crop to continue.',
          )
        if (output.length >= maximum && !chosen.side && !replaced)
          errors.push('The 24-crop workspace limit was reached.')
        setNotice(errors.join(' '))
        const unlocated = output.find((card) => !card.detected)
        if (unlocated) setEditing(replaced?.id ?? unlocated.id)
      } finally {
        const used = new Set(
          refs.current.flatMap((c) => (c.source.pdf ? [c.source.pdf] : [])),
        )
        for (const doc of resources.current)
          if (!used.has(doc)) {
            resources.current.delete(doc)
            void doc.dispose().catch(() => {})
          }
      }
    })
  }
  function openPicker(option: Pick) {
    if (!input.current) return
    pick.current = option
    input.current.accept = option.accepts.join(',')
    input.current.multiple = !option.side && !option.replace
    input.current.click()
  }
  function patchCard(id: string, patch: Partial<Card>) {
    updateCards(
      refs.current.map((card) =>
        card.id === id ? { ...card, ...patch } : card,
      ),
    )
  }
  function duplicateCrop(card: Card) {
    if (refs.current.length >= maxCards) {
      setError('This workspace has 24 crops. Remove one before adding more.')
      return
    }
    void run('Opening the source for a new crop', async (signal) => {
      const corners =
        card.source.pdf && paperLike(card.source.width, card.source.height)
          ? manualWalletSeed(card.source.width, card.source.height, 'back', card.source.pageRotation)
          : fullQuad
      const preview = await previewCrop(card.source, corners, 0, signal, card.clarity)
      signal.throwIfAborted()
      const add: Card = {
        ...card,
        id: crypto.randomUUID(),
        preview,
        corners,
        original: corners,
        rotation: 0,
        side: 'extra',
        confidence: 'unknown',
        accepted: false,
        detected: false,
        physical: undefined,
      }
      updateCards([...refs.current, ...cardAssignments([add], refs.current)])
      setEditing(add.id)
    })
  }
  function selectSide(card: Card, side: Side) {
    updateCards(
      refs.current.map((c) =>
        c.id === card.id
          ? {
              ...c,
              side,
              confidence: 'manual',
              accepted: c.detected || c.accepted,
            }
          : c.side === side && side !== 'extra'
            ? { ...c, side: card.side, confidence: 'manual' }
            : c,
      ),
    )
  }
  function place(id: string, position: Position) {
    const positions = { ...settings.positions, [id]: position }
    try {
      planSheets(dimensions, { ...settings, positions })
      setError('')
      changeSettings({ positions })
    } catch (e) {
      setError(errorText(e))
    }
  }
  function reset() {
    job.current?.abort()
    updateCards([])
    setEditing(undefined)
    setPassword(undefined)
    setSettings({ ...defaultPrint, marks: 'border' })
    setSelectedType(null)
    setOutputName('Govt_ID_Card.pdf')
    pick.current = { accepts }
    setCamera(false)
    setOCRLanguage('eng')
    setPreset('generic')
    setSizeMode('custom')
    setSize({ width: 85.6, height: 54 })
    setSizePresets([])
    setLocked(false)
    setFormat('pdf')
    setNotice('')
    setError('')
    setResetDialog(false)
    clearPrint()
  }
  function restorePositions() {
    setError('')
    changeSettings({ positions: {} })
  }
  function exportNow(kind: ExportFormat, mode: 'prepare' | 'download' | 'vault', a4 = false) {
    if (!exportReady) return
    void run('Generating output on this device', async (signal) => {
      const quickSettings: PrintSettings = a4 ? { ...settings, paper: 'A4', orientation: 'portrait', mode: 'wide', marks: 'border', dpi: 300, marginX: 10, marginY: 10, gapX: 8, horizontal: 'center', vertical: 'center' } : settings
      const quickSheets = a4 ? planSheets(cards.map(card => ({ id: card.id, side: card.side, width: 85.6, height: 54 })), quickSettings) : plan.sheets
      if (a4) { setSettings(quickSettings); setSizeMode('custom'); setSize({ width: 85.6, height: 54 }); setLocked(false); setCards(old => old.map(card => ({ ...card, physical: undefined }))) }
      const raw = await prepareExport(
        quickSheets,
        cards,
        quickSettings,
        kind,
        setStatus,
        signal,
      )
      const base = stem(safeName(outputName.trim() || cardFilename(selectedType ?? 'other')))
      const generated = raw.map((item, index) => ({ ...item, vaultFolder: 'Govt IDs', name: item.blob.type === PDF ? `${base}${raw.length > 1 ? '_' + (index + 1) : ''}.pdf` : item.name.startsWith('docready-') ? item.name.replace('docready-', base + '_') : item.name }))
      signal.throwIfAborted()
      setItems(generated)
      if (mode === 'download') for (const item of generated) saveFile(item)
      if (mode === 'vault') {
        const pdf = generated.find(item => item.blob.type === PDF)
        if (pdf) VaultBridge.saveFile(pdf.blob, pdf.name, 'Govt IDs')
      }
    })
  }
  function printNow() {
    if (!exportReady) return
    clearPrint()
    let popup: Window
    try {
      popup = openPrintWindow()
      printTab.current = popup
    } catch (e) {
      setError(errorText(e))
      return
    }
    void run('Preparing local print preview', async (signal) => {
      try {
        await fillPrintWindow(
          popup,
          plan.sheets,
          cards,
          settings,
          signal,
          setStatus,
          (url) => printURLs.current.add(url),
        )
      } catch (e) {
        clearPrint()
        throw e
      }
    })
  }
  return (
    <div className="ecard-studio">
      <div className="ecard-intro">
        <span className="ecard-intro-icon">
          <CreditCard size={29} />
          <ScanLine size={19} />
        </span>
        <div>
          <strong>Detect. Crop. Arrange. Print.</strong>
          <p>Prepare original card artwork at an exact print size.</p>
        </div>
        <span className="ecard-privacy">
          <ShieldCheck size={16} /> Processed on your device
        </span>
      </div>
      {!cards.length && <CardTypeSelector selected={selectedType} disabled={Boolean(status)} select={id => { setSelectedType(id); setPreset(id); setOutputName(cardFilename(id)); setItems([]) }} />}
      {selectedType && !cards.length && <p className="muted">Selected: <strong>{govtCards.find(card => card.id === selectedType)?.name}</strong> · Open your PDF below. Passwords stay in this session.</p>}
      {(selectedType || !!cards.length) && <>
      <div className="ecard-main-controls" inert={Boolean(status)}>
        <Panel title="Add card files">
          <div className="ecard-upload-grid">
            <Dropzone
              accept={accepts}
              multiple
              disabled={Boolean(status)}
              label="Drop card files here"
              description="PDF, JPEG, PNG or WebP · Up to 36 MB each"
              onFiles={(files) => void add(files, { accepts })}
            />
            <div className="ecard-source-tools">
              <Field label="Document preset">
                <select
                  value={preset}
                  onChange={(e) => { const next = e.target.value as Preset; setPreset(next); const id = govtCards.find(card => card.id === next)?.id ?? 'other'; setSelectedType(id); setOutputName(cardFilename(id)); setItems([]) }}
                >
                  {Object.entries(presets).map(([id, [label]]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="ecard-actions">
                <Button
                  variant="secondary"
                  onClick={() => openPicker({ accepts: [PDF] })}
                >
                  <FilePlus2 size={17} /> Select PDF
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => openPicker({ accepts: [...images] })}
                >
                  <Upload size={17} /> Select images
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => openPicker({ accepts, side: 'front' })}
                >
                  Add Front
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => openPicker({ accepts, side: 'back' })}
                >
                  Add Back
                </Button>
                <Button variant="quiet" onClick={() => setCamera(true)}>
                  <Camera size={17} /> Camera
                </Button>
              </div>
            </div>
          </div>
          <input
            ref={input}
            aria-label="Selected card files"
            type="file"
            hidden
            onChange={(e) => {
              const files = Array.from(e.currentTarget.files ?? [])
              const selected = pick.current
              pick.current = { accepts }
              e.currentTarget.value = ''
              if (files.length) void add(files, selected)
            }}
          />
        </Panel>
      </div>
      </>}
      <div className="ecard-job">
        <Progress pending={Boolean(status)} label={status} />
        {status && (
          <Button variant="secondary" onClick={() => job.current?.abort()}>
            Cancel
          </Button>
        )}
        {notice && (
          <p className="ecard-warning" role="status">
            {notice}
          </p>
        )}
        <ErrorState error={error} />
      </div>
      {!!cards.length && (
        <div inert={Boolean(status)} className="ecard-work">
          <Panel title="Review detected cards">
            <Checkbox label="Magic Clarity / Sharpen" checked={cards.length > 0 && cards.every(card => card.clarity)} onChange={enabled => { void run('Updating crop clarity in the image worker', async signal => {
              const next: Card[] = []
              for (const card of cards) next.push({ ...card, clarity: enabled, preview: await previewCrop(card.source, card.corners, card.rotation, signal, enabled) })
              signal.throwIfAborted(); updateCards(next)
            }) }} />
            <div className="ecard-review-top">
              <div>
                <p className="muted">
                  Review crop edges, text and QR codes before export.
                </p>
                {needsCrop && (
                  <p className="ecard-warn">
                    Automatic card detection needs adjustment.
                  </p>
                )}
                {review && !needsCrop && (
                  <p className="ecard-warn">
                    Please confirm which side is Front and which is Back.
                  </p>
                )}
              </div>
              <div className="ecard-actions">
                {cards.some((c) => c.side === 'front') &&
                  cards.some((c) => c.side === 'back') && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        updateCards(
                          cards.map((c) =>
                            c.side === 'extra'
                              ? c
                              : {
                                  ...c,
                                  side: c.side === 'front' ? 'back' : 'front',
                                  confidence: 'manual',
                                },
                          ),
                        )
                      }
                    >
                      <Repeat2 size={17} /> Swap Sides
                    </Button>
                  )}
                {review && !needsCrop && (
                  <Button
                    onClick={() =>
                      updateCards(
                        cards.map((c) => ({
                          ...c,
                          accepted: true,
                          confidence: 'manual',
                        })),
                      )
                    }
                  >
                    <Check size={17} /> Confirm crops and sides
                  </Button>
                )}
              </div>
            </div>
            <div className="ecard-card-grid">
              {cards.map((card, i) => (
                <CardItem
                  key={card.id}
                  card={card}
                  index={i}
                  size={size}
                  mode={sizeMode}
                  locked={locked}
                  edit={() => setEditing(card.id)}
                  duplicate={() => duplicateCrop(card)}
                  replace={() => openPicker({ accepts, replace: card.id })}
                  remove={() =>
                    updateCards(cards.filter((c) => c.id !== card.id))
                  }
                  rotate={() =>
                    void run('Rotating the crop', async (signal) => {
                      const rotation = (card.rotation + 90) % 360
                      const preview = await previewCrop(
                        card.source,
                        card.corners,
                        rotation,
                        signal,
                        card.clarity,
                      )
                      signal.throwIfAborted()
                      patchCard(card.id, { rotation, preview })
                    })
                  }
                  onSide={(side) => selectSide(card, side)}
                  patch={(physical) => patchCard(card.id, { physical })}
                />
              ))}
            </div>
            <details className="ecard-ocr">
              <summary>Check side suggestions with local OCR</summary>
              <p className="muted">
                Use printed words as additional clues. A QR code alone does
                not identify a side.
              </p>
              <div className="ecard-actions ecard-ocr-actions">
                <Field label="OCR language">
                  <select
                    value={ocrLanguage}
                    onChange={(e) =>
                      setOCRLanguage(e.target.value as OCRLanguage)
                    }
                  >
                    <option value="eng">English</option>
                    <option value="hin">Hindi</option>
                    <option value="hin+eng">Hindi + English</option>
                  </select>
                </Field>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void run('Loading local OCR', async (signal) => {
                      const worker = await openLocalOCR(ocrLanguage, signal)
                      try {
                        const revised: Card[] = []
                        for (const [i, card] of cards.entries()) {
                          signal.throwIfAborted()
                          setStatus(
                            `Reading side clues · card ${i + 1} of ${cards.length}`,
                          )
                          if (card.confidence === 'manual') {
                            revised.push(card)
                            continue
                          }
                          const result = sideFromText(
                            (await worker.recognize(card.preview.blob)).text,
                            preset,
                          )
                          revised.push(
                            result.side
                              ? {
                                  ...card,
                                  side: result.side,
                                  accepted: card.detected && result.high,
                                  confidence: result.high
                                    ? 'high'
                                    : 'uncertain',
                                }
                              : card,
                          )
                        }
                        signal.throwIfAborted()
                        updateCards(cardAssignments(revised, []))
                        setNotice(
                          'Local OCR completed. Review the suggested sides before printing.',
                        )
                      } finally {
                        await worker.close()
                      }
                    })
                  }
                >
                  Check side clues
                </Button>
              </div>
            </details>
          </Panel>
          {exportReady && (
            <p role="status" className="ecard-reviewed">
              Your Card Is Ready to Print
            </p>
          )}
          <div className="ecard-print" ref={section} tabIndex={-1}>
            <div className="ecard-layout-column">
              <Panel title="Build your print sheet">
                <div
                  className="ecard-actions"
                  role="group"
                  aria-label="Print mode"
                >
                  <Button
                    variant={
                      settings.mode === 'pvc' ? 'secondary' : 'primary'
                    }
                    aria-pressed={settings.mode !== 'pvc'}
                    onClick={() =>
                      changeSettings({
                        mode: 'wide',
                        paper: 'A4',
                        orientation: 'portrait',
                      })
                    }
                  >
                    A4 — Front &amp; Back on One Sheet
                  </Button>
                  <Button
                    variant={
                      settings.mode === 'pvc' ? 'primary' : 'secondary'
                    }
                    aria-pressed={settings.mode === 'pvc'}
                    onClick={() => changeSettings({ mode: 'pvc' })}
                  >
                    PVC Card — Actual Size
                  </Button>
                </div>
                {settings.mode === 'pvc' ? (
                  <p className="muted">
                    85.60 × 53.98 mm per side. Print at Actual Size / 100%.
                    Check printer alignment and front/back orientation before
                    using card stock. Artwork is fitted without stretching. An
                    unmatched side produces one page.
                  </p>
                ) : (
                  <LayoutChoice
                    mode={settings.mode}
                    onChange={(mode) => {
                      setError('')
                      changeSettings({ mode })
                    }}
                  />
                )}
                {settings.mode === 'duplex' && (
                  <p className="ecard-warning">
                    Select double-sided printing and “Flip on {settings.flip}{' '}
                    edge” in the printer dialog. Test the first sheet before
                    using card stock.
                  </p>
                )}
                {cards.length > 2 &&
                  ['wide', 'vertical'].includes(settings.mode) && (
                    <p className="muted">
                      This layout prints the first two assigned cards. Choose
                      Multiple cards to print every crop.
                    </p>
                  )}
                {settings.mode !== 'pvc' && (
                  <div className="ecard-sizing">
                    <Field label="Physical card size">
                      <select
                        value={sizeMode}
                        onChange={(e) => {
                          setItems([])
                          setSizeMode(e.target.value as SizeMode)
                        }}
                      >
                        <option value="id1">ID-1 · 85.60 × 53.98 mm</option>
                        <option value="ratio">Original crop ratio</option>
                        <option value="custom">Custom dimensions</option>
                      </select>
                    </Field>
                    {sizeMode !== 'id1' && (
                      <div className="ecard-fields">
                        <NumberField
                          label="Card width (mm)"
                          min={5}
                          max={560}
                          step={0.01}
                          value={size.width}
                          change={(width) => {
                            setItems([])
                            setSize((s) => ({ ...s, width }))
                          }}
                        />
                        {sizeMode === 'custom' && !locked && (
                          <NumberField
                            label="Card height (mm)"
                            min={5}
                            max={560}
                            step={0.01}
                            value={size.height}
                            change={(height) => {
                              setItems([])
                              setSize((s) => ({ ...s, height }))
                            }}
                          />
                        )}
                      </div>
                    )}
                    {sizeMode === 'custom' && !locked && (
                      <div className="ecard-actions">
                        <Button
                          variant="secondary"
                          disabled={
                            [size.width, size.height].some(
                              (value) =>
                                !Number.isFinite(value) ||
                                value < 5 ||
                                value > 560,
                            ) ||
                            sizePresets.length >= 12 ||
                            sizePresets.some(
                              (p) =>
                                p.width === size.width &&
                                p.height === size.height,
                            )
                          }
                          onClick={() =>
                            setSizePresets([...sizePresets, { ...size }])
                          }
                        >
                          Save size for this session
                        </Button>
                      </div>
                    )}
                    {sizePresets.length > 0 && (
                      <Field label="Saved size presets">
                        <select
                          value=""
                          onChange={(event) => {
                            const choice =
                              sizePresets[Number(event.currentTarget.value)]
                            if (!choice) return
                            setItems([])
                            setSize(choice)
                            setSizeMode('custom')
                            setLocked(false)
                          }}
                        >
                          <option value="" disabled>
                            Choose a saved size
                          </option>
                          {sizePresets.map((p, i) => (
                            <option key={i} value={i}>
                              {p.width.toFixed(2)} × {p.height.toFixed(2)} mm
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                    <Checkbox
                      label="Lock custom sizing to the crop’s aspect ratio"
                      checked={locked}
                      onChange={(value) => {
                        setItems([])
                        setLocked(value)
                      }}
                    />
                    <p className="muted">
                      The artwork is always fitted inside its print dimensions
                      without stretching.
                    </p>
                  </div>
                )}
                <PrintControls
                  s={settings}
                  cards={cards}
                  change={changeSettings}
                />
              </Panel>
              <Panel title="Export and print">
                <Field label="Output filename"><input value={outputName} maxLength={126} onChange={event => { setOutputName(event.target.value); setItems([]) }} /></Field>
                <p className="mini">Vault destination: Govt IDs · Default frame 85.6 × 54.0 mm (rounded ID-1). Artwork is fitted without stretching.</p>
                <div className="ecard-quick-export">
                  <Button disabled={!exportReady} onClick={() => exportNow('pdf', 'download', true)}>Download A4 Print PDF</Button>
                  <Button variant="secondary" disabled={!exportReady} onClick={() => exportNow('cards', 'download')}>Front &amp; Back PNG</Button>
                  <Button variant="secondary" disabled={!exportReady} onClick={() => exportNow('cards-jpeg', 'download')}>Front &amp; Back JPG</Button>
                  <Button variant="secondary" disabled={!exportReady} onClick={() => exportNow('pdf', 'vault', true)}><LockKeyhole size={16} /> Save to Encrypted Vault</Button>
                </div>
                <Field label="Export format">
                  <select
                    value={format}
                    onChange={(e) => {
                      setFormat(e.target.value as ExportFormat)
                      setItems([])
                    }}
                  >
                    <option value="pdf">Print-ready PDF</option>
                    <option value="png">PNG print sheets</option>
                    <option value="jpeg">JPEG print sheets</option>
                    <option value="cards">Individual cropped PNGs</option>
                    <option value="cards-jpeg">Individual cropped JPEGs</option>
                    <option value="zip">ZIP · PDF and cropped cards</option>
                  </select>
                </Field>
                <p className="muted">
                  In your print dialog choose{' '}
                  <strong>Actual Size / 100%</strong> for accurate
                  measurements. Print opens a local preview in its own tab.
                </p>
                <p className="muted">
                  The output is a print derivative. The original stays
                  unchanged, and its digital signature verification does not
                  carry over.
                </p>
                <Button
                  variant="secondary"
                  disabled={!exportReady}
                  onClick={() => exportNow(format, 'prepare')}
                >
                  <Download size={17} /> Prepare selected export
                </Button>
              </Panel>
            </div>
            <div className="ecard-layout-column">
              {plan.error ? (
                <Panel title="Adjust the print layout">
                  <ErrorState error={plan.error} />
                  {settings.mode === 'custom' && (
                    <Button variant="secondary" onClick={restorePositions}>
                      Restore aligned positions
                    </Button>
                  )}
                </Panel>
              ) : (
                <PaperPreview
                  s={settings}
                  sheets={plan.sheets}
                  cards={cards}
                  onPlace={place}
                  reset={restorePositions}
                />
              )}
            </div>
          </div>
          <Results
            items={items}
            message="Your files are ready to download."
          />
          <div className="ecard-actionbar">
            <Button variant="quiet" onClick={() => setResetDialog(true)}>
              <RotateCcw size={16} /> Reset
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                void run('Preparing automatic detection', async (signal) => {
                  const unique = [
                    ...new Map(
                      cards.flatMap((c) =>
                        (
                          sourcePages.current.get(c.source.file) ?? [c.source]
                        ).map((source) => [source.id, source] as const),
                      ),
                    ).values(),
                  ]
                  const { output, failed } = await detectSources(
                    unique,
                    signal,
                    maxCards,
                  )
                  signal.throwIfAborted()
                  updateCards(cardAssignments(output, []))
                  changeSettings({ positions: {} })
                  const unlocated = output.find((card) => !card.detected)
                  if (unlocated) setEditing(unlocated.id)
                  if (failed)
                    setNotice(
                      'Automatic detection is unavailable. Use manual crop to continue.',
                    )
                })
              }
            >
              <ScanLine size={17} /> Re-detect
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                section.current?.scrollIntoView({ block: 'start' })
                section.current?.focus({ preventScroll: true })
              }}
            >
              <Eye size={17} /> Preview
            </Button>
            <Button
              disabled={!exportReady}
              onClick={() => exportNow('pdf', 'download')}
            >
              <Download size={17} /> Download PDF
            </Button>
            <Button
              variant="secondary"
              disabled={!exportReady}
              onClick={printNow}
            >
              <Printer size={17} /> Print
            </Button>
          </div>
        </div>
      )}
      {candidate && (
        <CropEditor
          key={candidate.id}
          walletOnly={candidate.walletOnly ?? (preset !== 'custom')}
          card={candidate}
          sources={
            sourcePages.current.get(candidate.source.file) ?? [
              candidate.source,
            ]
          }
          close={() => setEditing(undefined)}
          apply={(source, corners, rotation, preview) => {
            patchCard(candidate.id, {
              source,
              original:
                source === candidate.source ? candidate.original : corners,
              corners,
              rotation,
              preview,
              detected: true,
              accepted:
                candidate.confidence === 'manual' || candidate.accepted,
            })
            setEditing(undefined)
          }}
        />
      )}
      {camera && (
        <CardCamera
          close={() => setCamera(false)}
          captured={(file) => {
            setCamera(false)
            void add([file], { accepts })
          }}
          browse={() => {
            setCamera(false)
            openPicker({ accepts: [...images] })
          }}
        />
      )}
      {password && (
        <PasswordDialog
          request={password}
          close={() => password.reject(Error('Password entry cancelled.'))}
        />
      )}
      {resetDialog && (
        <Modal
          title="Clear the card workspace?"
          onClose={() => setResetDialog(false)}
        >
          <p className="muted">
            This clears the originals, crops, and exports held in this
            workspace. Files you already downloaded stay on your device.
          </p>
          <Button variant="secondary" onClick={() => setResetDialog(false)}>
            Keep working
          </Button>{' '}
          <Button onClick={reset}>Clear workspace</Button>
        </Modal>
      )}
    </div>
  )
}
