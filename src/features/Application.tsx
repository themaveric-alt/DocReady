import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FolderPlus,
  Trash2,
} from 'lucide-react'
import {
  Button,
  Check,
  Dropzone,
  ErrorState,
  Field,
  IconButton,
  Panel,
  Progress,
  Results,
} from '../components/shared'
import {
  errorText,
  images,
  PDF,
  sizeLabel,
  zipFiles,
  type Output,
} from '../lib/files'
import { readLocal, writeLocal } from '../lib/prefs'
import {
  blankRequirement,
  readyFile,
  requirementErrors,
  type Requirement,
} from '../lib/requirements'
const templates: Record<string, string[]> = {
  'Government examination': [
    'Photograph',
    'Signature',
    'Supporting certificate',
  ],
  'College admission': ['Photograph', 'Mark sheet', 'Admission documents'],
  Scholarship: ['Photograph', 'Enrollment certificate', 'Supporting documents'],
  'Job application': ['Resume', 'Portfolio or certificate'],
  'Personal document preparation': ['Document'],
  'Custom application': ['Document'],
}
const steps = [
  'Application type',
  'Requirements',
  'Upload',
  'Validate',
  'Export',
]
type Result = { status: string; item?: Output; detail?: string }
type Template = { name: string; rules: Requirement[] }
export default function Application({ initialRules }: { initialRules?: Requirement[] } = {}) {
  const [step, setStep] = useState(initialRules ? 1 : 0),
    [furthest, setFurthest] = useState(initialRules ? 1 : 0),
    [type, setType] = useState(initialRules ? 'Custom application' : 'Government examination'),
    [rules, setRules] = useState<Requirement[]>(initialRules ?? []),
    [files, setFiles] = useState<Record<string, File>>({}),
    [results, setResults] = useState<Record<string, Result>>({}),
    [error, setError] = useState(''),
    [progress, setProgress] = useState<number>(),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(''),
    [saved, setSaved] = useState(() => readLocal<Template[]>('templates', [])),
    [message, setMessage] = useState(''),
    [archive, setArchive] = useState<Output>()
  const outputs = Object.values(results).flatMap((r) =>
    r.item ? [r.item] : [],
  )
  const complete =
    rules.length > 0 &&
    rules.every(
      (r) =>
        results[r.id]?.status === 'Valid' ||
        (!r.required &&
          !files[r.id] &&
          results[r.id]?.status === 'Optional · skipped'),
    )
  function go(n: number) {
    setError('')
    setStep(n)
    setFurthest((f) => Math.max(f, n))
  }
  function inactive() {
    setResults({})
    setArchive(undefined)
    setFurthest((f) => Math.min(f, 2))
  }
  function changeRule(id: string, diff: Partial<Requirement>) {
    inactive()
    setRules((all) => all.map((r) => (r.id === id ? { ...r, ...diff } : r)))
  }
  function chooseType() {
    if (type.startsWith('saved:')) {
      const template = saved[Number(type.slice(6))]
      if (!template) {
        setError('This saved template is no longer available.')
        return
      }
      setRules(template.rules.map((r) => ({ ...r, id: crypto.randomUUID() })))
    } else
      setRules(
        templates[type].map((l) =>
          blankRequirement(
            l,
            ['Photograph', 'Signature'].includes(l)
              ? [...images]
              : [PDF, ...images],
          ),
        ),
      )
    setFiles({})
    setResults({})
    setArchive(undefined)
    setFurthest(1)
    setStep(1)
  }
  function checkRules() {
    if (!rules.length) {
      setError('Add a document requirement.')
      return false
    }
    const invalid = rules.find((r) => requirementErrors(r))
    if (invalid) {
      setError(
        (invalid.label || 'Document') + ' — ' + requirementErrors(invalid),
      )
      return false
    }
    return true
  }
  function saveTemplate() {
    if (!checkRules()) return
    if (!name.trim()) {
      setError('Enter a name for the template.')
      return
    }
    try {
      const next = [
        ...saved.filter((x) => x.name !== name.trim()),
        { name: name.trim(), rules },
      ]
      writeLocal('templates', next)
      setSaved(next)
      setMessage('Template saved in this browser.')
      setError('')
    } catch (e) {
      setError('Could not save the template. ' + errorText(e))
    }
  }
  async function prepare() {
    const size = Object.values(files).reduce((sum, file) => sum + file.size, 0)
    if (size > 180 * 1024 * 1024) {
      setError('Keep the application batch below 180 MB.')
      return
    }
    const next: Record<string, Result> = {}
    setBusy(true)
    setError('')
    setResults({})
    setArchive(undefined)
    setProgress(0)
    try {
      for (const [i, r] of rules.entries()) {
        const f = files[r.id]
        if (!f)
          next[r.id] = { status: r.required ? 'Missing' : 'Optional · skipped' }
        else
          try {
            next[r.id] = await readyFile(f, r)
          } catch (e) {
            next[r.id] = { status: 'Processing failed', detail: errorText(e) }
          }
        setResults({ ...next })
        setProgress(((i + 1) / rules.length) * 100)
      }
    } finally {
      setBusy(false)
    }
  }
  async function zip() {
    setBusy(true)
    setError('')
    try {
      const summary = rules
        .map(
          (r) =>
            r.label +
            ' — ' +
            results[r.id].status +
            (results[r.id].detail ? ' · ' + results[r.id].detail : ''),
        )
        .join('\n')
      setArchive(
        await zipFiles(
          [
            ...outputs,
            {
              name: 'validation-summary.txt',
              blob: new Blob([summary], { type: 'text/plain' }),
            },
          ],
          'application-ready.zip',
        ),
      )
    } catch (e) {
      setError('Could not create the ZIP. ' + errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <ol className="steps" aria-label="Application progress">
        {steps.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              disabled={busy || i > furthest || (i === 4 && !complete)}
              aria-current={i === step ? 'step' : undefined}
              onClick={() => go(i)}
            >
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>
      <Panel title={steps[step]}>
        <fieldset disabled={busy}>
          {step === 0 && (
            <>
              <p>
                Generic templates provide a checklist. Enter the exact
                dimensions, file sizes and formats from your application
                instructions.
              </p>
              <Field label="Application template">
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  {Object.keys(templates).map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                  {saved.map((s, i) => (
                    <option key={s.name} value={'saved:' + i}>
                      Saved · {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
          {step === 1 && (
            <>
              <div className="requirements">
                {rules.map((r) => (
                  <div className="requirement" key={r.id}>
                    <div className="between">
                      <strong>{r.label || 'Document'}</strong>
                      <IconButton
                        label={'Remove requirement ' + r.label}
                        onClick={() => {
                          inactive()
                          setRules((all) => all.filter((x) => x.id !== r.id))
                          setFiles((all) =>
                            Object.fromEntries(
                              Object.entries(all).filter(([id]) => id !== r.id),
                            ),
                          )
                        }}
                      >
                        <Trash2 size={17} />
                      </IconButton>
                    </div>
                    <div className="form-grid">
                      <Field label="Document label">
                        <input
                          value={r.label}
                          maxLength={80}
                          onChange={(e) =>
                            changeRule(r.id, { label: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Output filename">
                        <input
                          value={r.filename}
                          placeholder="Keep original name"
                          maxLength={100}
                          onChange={(e) =>
                            changeRule(r.id, { filename: e.target.value })
                          }
                        />
                      </Field>
                      {(['width', 'height', 'min', 'max'] as const).map(
                        (key, i) => (
                          <Field
                            key={key}
                            label={
                              [
                                'Width (px)',
                                'Height (px)',
                                'Minimum (KB)',
                                'Maximum (KB)',
                              ][i]
                            }
                          >
                            <input
                              type="number"
                              placeholder="Optional"
                              step={i < 2 ? 1 : 0.1}
                              min={i < 2 ? 1 : 0.1}
                              value={r[key]}
                              onChange={(e) =>
                                changeRule(r.id, { [key]: e.target.value })
                              }
                            />
                          </Field>
                        ),
                      )}
                      <fieldset className="full">
                        <legend>Accepted formats</legend>
                        <div className="action-row">
                          {[...images, PDF].map((t) => (
                            <Check
                              key={t}
                              label={t.split('/')[1].toUpperCase()}
                              checked={r.types.includes(t)}
                              onChange={(on) =>
                                changeRule(r.id, {
                                  types: on
                                    ? [...r.types, t]
                                    : r.types.filter((x) => x !== t),
                                })
                              }
                            />
                          ))}
                        </div>
                      </fieldset>
                      <Check
                        label="Required document"
                        checked={r.required}
                        onChange={(required) => changeRule(r.id, { required })}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="action-row">
                <Button
                  variant="secondary"
                  disabled={rules.length >= 20}
                  onClick={() => {
                    inactive()
                    setRules((r) => [...r, blankRequirement()])
                  }}
                >
                  <FolderPlus size={17} /> Add document
                </Button>
              </div>
              <div className="separator action-row">
                <Field label="Reusable template name">
                  <input
                    value={name}
                    maxLength={70}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
                <Button variant="secondary" onClick={saveTemplate}>
                  Save local template
                </Button>
              </div>
              {message && (
                <p className="success" role="status">
                  {message}
                </p>
              )}
            </>
          )}
          {step === 2 && (
            <div className="requirements">
              {rules.map((r) => (
                <div key={r.id} className="requirement row-stack">
                  <div className="between">
                    <strong>{r.label}</strong>
                    <span className="pill">
                      {r.required ? 'Required' : 'Optional'}
                    </span>
                  </div>
                  <p className="mini">
                    Accepts{' '}
                    {r.types
                      .map((t) => t.split('/')[1].toUpperCase())
                      .join(', ')}
                    {r.width || r.height
                      ? ' · ' +
                        (r.width || 'auto') +
                        ' × ' +
                        (r.height || 'auto') +
                        ' px'
                      : ''}
                    {r.max ? ' · Up to ' + r.max + ' KB' : ''}
                  </p>
                  <Dropzone
                    accept={[...images, PDF]}
                    label={'Upload ' + r.label}
                    compact
                    onFiles={(all) => {
                      inactive()
                      setFiles((f) => ({ ...f, [r.id]: all[0] }))
                    }}
                  />
                  {files[r.id] && (
                    <div className="between">
                      <span>
                        {files[r.id].name} · {sizeLabel(files[r.id].size)}
                      </span>
                      <Button
                        variant="quiet"
                        onClick={() => {
                          inactive()
                          setFiles((all) =>
                            Object.fromEntries(
                              Object.entries(all).filter(([id]) => id !== r.id),
                            ),
                          )
                        }}
                      >
                        Remove file
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {step === 3 && (
            <>
              <p>
                Run validation to resize or convert images where possible and
                check every selected file against its requirements.
              </p>
              <ul className="file-list">
                {rules.map((r) => (
                  <li key={r.id}>
                    <ClipboardCheck size={18} />
                    <span>
                      <strong>{r.label}</strong>
                      <small>
                        {results[r.id]?.detail ||
                          files[r.id]?.name ||
                          'No file selected'}
                      </small>
                    </span>
                    <b className="pill">
                      {results[r.id]?.status ||
                        (files[r.id] ? 'Ready to check' : 'Missing')}
                    </b>
                  </li>
                ))}
              </ul>
              <div className="action-row">
                <Button onClick={() => void prepare()}>
                  Prepare and validate
                </Button>
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <p className="success" role="status">
                <CheckCircle2 size={19} /> {outputs.length}{' '}
                {outputs.length === 1 ? 'file passed' : 'files passed'}{' '}
                validation.
              </p>
              <ul className="file-list">
                {rules.map((r) => (
                  <li key={r.id}>
                    <span>
                      <strong>{r.label}</strong>
                      <small>
                        {results[r.id].status}
                        {results[r.id].detail
                          ? ' · ' + results[r.id].detail
                          : ''}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="action-row">
                <Button onClick={() => void zip()}>
                  Prepare ZIP with validation summary
                </Button>
              </div>
            </>
          )}
        </fieldset>
        <ErrorState error={error} />
        <Progress pending={busy} progress={step === 3 ? progress : undefined} />
        <div className="action-row">
          {step > 0 && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => go(step - 1)}
            >
              <ArrowLeft size={16} /> Back
            </Button>
          )}
          {step < 4 && (
            <Button
              disabled={busy || (step === 3 && !complete)}
              onClick={() =>
                step === 0
                  ? chooseType()
                  : (step !== 1 && step !== 2) || checkRules()
                    ? go(step + 1)
                    : undefined
              }
            >
              Continue <ArrowRight size={16} />
            </Button>
          )}
        </div>
      </Panel>
      {step === 4 && (
        <Results items={archive ? [...outputs, archive] : outputs} />
      )}
    </>
  )
}
