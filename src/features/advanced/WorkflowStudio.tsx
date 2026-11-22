import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import {
  Button,
  Dropzone,
  ErrorState,
  Field,
  IconButton,
  Panel,
  Progress,
  Results,
  move,
} from '../../components/shared'
import {
  errorText,
  images,
  PDF,
  sizeLabel,
  type ImageMime,
  type Output,
} from '../../lib/files'
import { readLocal, writeLocal } from '../../lib/prefs'
import { Count } from './PhotoPrintPanels'
import {
  executeWorkflow,
  newStep,
  operations,
  recipe,
  validStep,
  type Step,
} from './workflow'
import './advanced.css'

type Saved = { name: string; steps: Step[] }
function Configure({
  step,
  change,
}: {
  step: Step
  change: (s: Step) => void
}) {
  switch (step.op) {
    case 'crop':
      return (
        <Count
          label="Crop width ÷ height"
          value={step.ratio}
          min={0.12}
          max={8}
          step={0.01}
          onChange={(ratio) => change({ ...step, ratio })}
        />
      )
    case 'resize':
    case 'validate':
      return (
        <>
          <Count
            label="Width (px)"
            min={step.op === 'validate' ? 0 : 1}
            value={step.width}
            onChange={(width) => change({ ...step, width })}
          />
          <Count
            label="Height (px)"
            min={step.op === 'validate' ? 0 : 1}
            value={step.height}
            onChange={(height) => change({ ...step, height })}
          />
          {step.op === 'validate' && (
            <Count
              label="Maximum KB (0 skips)"
              min={0}
              value={step.kb}
              onChange={(kb) => change({ ...step, kb })}
            />
          )}
        </>
      )
    case 'max':
      return (
        <Count
          label="Maximum KB"
          value={step.kb}
          max={25000}
          onChange={(kb) => change({ ...step, kb })}
        />
      )
    case 'signature':
      return (
        <Count
          label="Ink threshold"
          value={step.threshold}
          min={1}
          max={255}
          onChange={(threshold) => change({ ...step, threshold })}
        />
      )
    case 'number':
      return (
        <Count
          label="First page number"
          value={step.start}
          onChange={(start) => change({ ...step, start })}
        />
      )
    case 'encode':
      return (
        <>
          <Field label="Image format">
            <select
              value={step.format}
              onChange={(e) =>
                change({ ...step, format: e.target.value as ImageMime })
              }
            >
              {images.map((f) => (
                <option value={f} key={f}>
                  {f.split('/')[1].toUpperCase()}
                </option>
              ))}
            </select>
          </Field>
          <Count
            label="Encoding quality (%)"
            value={step.quality}
            min={20}
            max={100}
            onChange={(quality) => change({ ...step, quality })}
          />
        </>
      )
    case 'sheet':
      return (
        <>
          <Count
            label="Card width (mm)"
            value={step.width}
            min={5}
            max={450}
            step={0.1}
            onChange={(width) => change({ ...step, width })}
          />
          <Count
            label="Card height (mm)"
            value={step.height}
            min={5}
            max={450}
            step={0.1}
            onChange={(height) => change({ ...step, height })}
          />
          <Count
            label="Copies per image"
            value={step.copies}
            max={100}
            onChange={(copies) => change({ ...step, copies })}
          />
        </>
      )
    default:
      return null
  }
}
export default function WorkflowStudio() {
  const [steps, setSteps] = useState<Step[]>([]),
    [files, setFiles] = useState<File[]>([]),
    [toAdd, setAdd] = useState<Step['op']>('resize')
  const [saved, setSaved] = useState(() =>
      readLocal<Saved[]>('docready-advanced-workflows', []),
    ),
    [name, setName] = useState('')
  const [progress, setProgress] = useState<number>(),
    [stage, setStage] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const [items, setItems] = useState<Output[]>([])
  const job = useRef<AbortController | undefined>(undefined)
  useEffect(() => () => job.current?.abort(), [])
  function update(next: Step[]) {
    setItems([])
    setSteps(next)
    setError('')
  }
  async function run() {
    if (job.current) return
    const controller = new AbortController()
    job.current = controller
    setItems([])
    setError('')
    setStage('Checking workflow')
    setProgress(0)
    try {
      const output = await executeWorkflow(
        files,
        steps,
        controller.signal,
        (pct, label) => {
          if (!controller.signal.aborted) {
            setProgress(pct)
            setStage(label)
          }
        },
      )
      controller.signal.throwIfAborted()
      setItems(output)
      setNotice('Workflow finished. Review the files below.')
    } catch (e) {
      setError(
        controller.signal.aborted
          ? 'Workflow cancelled. Source files are still available.'
          : errorText(e),
      )
    } finally {
      job.current = undefined
      setStage('')
      setProgress(undefined)
    }
  }
  return (
    <div className="advanced-space">
      <div className="advanced-columns">
        <Panel title="Inputs and saved workflows">
          <fieldset disabled={!!stage}>
            <Dropzone
              label="Choose workflow inputs"
              compact
              multiple
              accept={[PDF, ...images]}
              onFiles={(values) => {
                setFiles(values)
                setItems([])
              }}
            />
            {files.length > 0 && (
              <ol className="advanced-list">
                {files.map((f, i) => (
                  <li key={i}>
                    {f.name} · {sizeLabel(f.size)}{' '}
                    <Button
                      variant="quiet"
                      onClick={() => {
                        setFiles(files.filter((_, j) => i !== j))
                        setItems([])
                      }}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ol>
            )}
            <Field label="Start from a workflow">
              <select
                value=""
                onChange={(e) => {
                  const keys = recipe[e.target.value]
                  if (keys) update(keys.map(newStep))
                }}
              >
                <option value="">Choose a preset</option>
                {Object.keys(recipe).map((key) => (
                  <option key={key}>{key}</option>
                ))}
              </select>
            </Field>
            <Field label="Workflow name">
              <input
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Button
              variant="secondary"
              disabled={
                !steps.length ||
                !name.trim() ||
                steps.some((s) => !validStep(s))
              }
              onClick={() => {
                const list = [
                  { name: name.trim(), steps },
                  ...saved.filter((item) => item.name !== name.trim()),
                ].slice(0, 16)
                try {
                  writeLocal('docready-advanced-workflows', list)
                  setSaved(list)
                  setNotice('Only step settings were saved to this browser.')
                } catch (e) {
                  setError(errorText(e))
                }
              }}
            >
              Save workflow settings
            </Button>
            {saved.length > 0 && (
              <div className="advanced-card-list">
                {saved.map((item, i) => (
                  <div key={i} className="action-row">
                    <Button
                      variant="quiet"
                      onClick={() => {
                        update(
                          item.steps.map((s) => ({
                            ...s,
                            id: crypto.randomUUID(),
                          })),
                        )
                        setName(item.name)
                      }}
                    >
                      Load {item.name}
                    </Button>
                    <Button
                      variant="quiet"
                      onClick={() => {
                        const remaining = saved.filter((_, j) => i !== j)
                        try {
                          writeLocal('docready-advanced-workflows', remaining)
                          setSaved(remaining)
                        } catch (e) {
                          setError(errorText(e))
                        }
                      }}
                    >
                      Remove saved workflow
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </fieldset>
        </Panel>
        <Panel title="Processing steps">
          <fieldset disabled={!!stage}>
            {steps.length > 0 && (
              <ol className="advanced-step-list">
                {steps.map((step, i) => (
                  <li key={step.id}>
                    <div className="advanced-step-heading">
                      <strong>{operations[step.op].label}</strong>
                      <div className="action-row">
                        <IconButton
                          label={'Move step ' + (i + 1) + ' up'}
                          disabled={!i}
                          onClick={() => update(move(steps, i, i - 1))}
                        >
                          <ArrowUp size={16} />
                        </IconButton>
                        <IconButton
                          label={'Move step ' + (i + 1) + ' down'}
                          disabled={i === steps.length - 1}
                          onClick={() => update(move(steps, i, i + 1))}
                        >
                          <ArrowDown size={16} />
                        </IconButton>
                        <IconButton
                          label={'Remove step ' + (i + 1)}
                          onClick={() =>
                            update(steps.filter((_, j) => i !== j))
                          }
                        >
                          <Trash2 size={16} />
                        </IconButton>
                      </div>
                    </div>
                    <div className="form-grid">
                      <Configure
                        step={step}
                        change={(v) =>
                          update(steps.map((s, j) => (j === i ? v : s)))
                        }
                      />
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {!steps.length && (
              <p className="muted">
                Choose a preset or add one or more operations.
              </p>
            )}
            <Field label="Step to add">
              <select
                value={toAdd}
                onChange={(e) => setAdd(e.target.value as Step['op'])}
              >
                {Object.entries(operations).map(([key, entry]) => (
                  <option value={key} key={key}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="action-row">
              <Button
                variant="secondary"
                disabled={steps.length >= 16}
                onClick={() => update([...steps, newStep(toAdd)])}
              >
                Add step
              </Button>
              <Button
                disabled={!files.length || !steps.length}
                onClick={() => void run()}
              >
                Run workflow
              </Button>
            </div>
          </fieldset>
          {stage && (
            <Button variant="secondary" onClick={() => job.current?.abort()}>
              Cancel workflow
            </Button>
          )}
          <Progress pending={!!stage} progress={progress} label={stage} />
          <ErrorState error={error} />
        </Panel>
      </div>
      <Results items={items} message={notice} />
    </div>
  )
}
