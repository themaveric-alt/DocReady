import { useEffect, useRef, useState } from 'react'
import { useJourneySources } from '../../components/ToolJourney'
import {
  Button,
  Check,
  Dropzone,
  ErrorState,
  Field,
  Panel,
  Progress,
} from '../../components/shared'
import Application from '../Application'
import { errorText, images, PDF } from '../../lib/files'
import { blankRequirement, type Requirement } from '../../lib/requirements'
import type { OCRLanguage } from '../../lib/local-ocr'
import {
  identifyRules,
  localDocumentText,
  type Suggested,
} from './documentInput'
import './advanced.css'

export default function SmartPack() {
  const [source, setSource] = useState<File>(),
    [text, setText] = useState(''),
    [language, setLanguage] = useState<OCRLanguage>('eng')
  const [suggest, setSuggest] = useState<Suggested[]>([]),
    [rules, setRules] = useState<Requirement[]>(),
    [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(''),
    [error, setError] = useState('')
  const job = useRef<AbortController | undefined>(undefined)
  useJourneySources(source ? 1 : 0)
  useEffect(() => () => job.current?.abort(), [])
  async function read() {
    if (!source || job.current) return
    const controller = new AbortController()
    job.current = controller
    setBusy('Reading notification')
    setError('')
    setNotice('')
    try {
      const r = await localDocumentText(
        source,
        controller.signal,
        setBusy,
        language,
      )
      controller.signal.throwIfAborted()
      setText(r.text)
      setSuggest(identifyRules(r.text))
      setNotice(
        r.truncated
          ? 'Only the first six pages were read. Add other requirements manually.'
          : 'Review each extracted requirement before using it.',
      )
    } catch (e) {
      if (!controller.signal.aborted) setError(errorText(e))
    } finally {
      job.current = undefined
      setBusy('')
    }
  }
  return (
    <div className="advanced-space">
      {!rules ? (
        <Panel title="Read an application notice">
          <p>
            Extract likely requirements locally, then confirm formats,
            dimensions and file-size limits against the notice.
          </p>
          <Dropzone
            label="Choose the application notice"
            accept={[PDF, ...images]}
            compact
            onFiles={(f) => {
              setSource(f[0])
              setSuggest([])
              setText('')
              setNotice('')
              setError('')
            }}
          />
          <Field label="Notification OCR language">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as OCRLanguage)}
            >
              <option value="eng">English</option>
              <option value="hin">Hindi</option>
              <option value="eng+hin">English + Hindi</option>
            </select>
          </Field>
          <div className="action-row">
            <Button disabled={!source || !!busy} onClick={() => void read()}>
              Read notification
            </Button>
            <Button
              variant="secondary"
              disabled={!!busy}
              onClick={() =>
                setRules([blankRequirement('Document', [PDF, ...images])])
              }
            >
              Enter requirements manually
            </Button>
            {busy && (
              <Button variant="quiet" onClick={() => job.current?.abort()}>
                Cancel
              </Button>
            )}
          </div>
          <Progress pending={!!busy} label={busy} />
          <ErrorState error={error} />
          {notice && (
            <p className="muted" role="status">
              {notice}
            </p>
          )}
          <details open={!!text}>
            <summary>Review or paste notice text</summary>
            <Field label="Notification text">
              <textarea
                rows={5}
                maxLength={40000}
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  setSuggest([])
                }}
              />
            </Field>
            <Button
              variant="secondary"
              disabled={!text.trim() || !!busy}
              onClick={() => {
                const found = identifyRules(text)
                setSuggest(found)
                setNotice(
                  found.length
                    ? 'Review each extracted requirement before using it.'
                    : 'No supported requirement was found. You can enter it manually.',
                )
              }}
            >
              Find requirements
            </Button>
          </details>
          {suggest.length > 0 && (
            <div className="advanced-card-list">
              {suggest.map((entry, i) => (
                <article key={entry.rule.id}>
                  <Check
                    label={entry.rule.label}
                    checked={entry.selected}
                    onChange={(selected) =>
                      setSuggest((list) =>
                        list.map((item, j) =>
                          j === i ? { ...item, selected } : item,
                        ),
                      )
                    }
                  />
                  <small>{entry.evidence}</small>
                  <p>
                    {entry.rule.types
                      .map((t) => t.split('/')[1].toUpperCase())
                      .join(', ')}{' '}
                    ·{' '}
                    {entry.rule.width && entry.rule.height
                      ? entry.rule.width + ' × ' + entry.rule.height + ' px'
                      : 'Confirm dimensions'}
                    {entry.rule.min ? ' · min ' + entry.rule.min + ' KB' : ''}
                    {entry.rule.max ? ' · max ' + entry.rule.max + ' KB' : ''}
                  </p>
                </article>
              ))}
              <Button
                disabled={!suggest.some((item) => item.selected)}
                onClick={() =>
                  setRules(
                    suggest.filter((e) => e.selected).map((e) => e.rule),
                  )
                }
              >
                Review selected requirements
              </Button>
            </div>
          )}
        </Panel>
      ) : (
        <>
          <Button variant="quiet" onClick={() => setRules(undefined)}>
            Back to notification
          </Button>
          <Application initialRules={rules} />
        </>
      )}
    </div>
  )
}
