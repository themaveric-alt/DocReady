import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Button,
  Check,
  ErrorState,
  Field,
  Modal,
  Panel,
} from '../components/shared'
import {
  defaults,
  removeLocal,
  usePrefs,
  type Preferences,
} from '../lib/prefs'
import { ImageFormats } from './ImageTool'
export default function Settings() {
  const { prefs, set, reset } = usePrefs(),
    [draft, change] = useState(prefs),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [confirm, setConfirm] = useState('')
  function update(changeBy: Partial<Preferences>) {
    change((d) => ({ ...d, ...changeBy }))
    setMessage('')
    setError('')
  }
  async function clear() {
    try {
      if (confirm === 'preferences') {
        reset()
        change(defaults)
        removeLocal('printdesk-sheet-settings')
      }
      if (confirm === 'drafts') {
        removeLocal('resume')
        removeLocal('templates')
        removeLocal('docready-advanced-workflows')
      }
      if (confirm === 'ocr') {
        removeLocal('recent')
        if ('caches' in window) {
          for (const key of await caches.keys())
            if (key.startsWith('docready-')) {
              const cache = await caches.open(key)
              for (const request of await cache.keys())
                if (new URL(request.url).pathname.startsWith('/ocr/'))
                  await cache.delete(request)
            }
        }
        if ('indexedDB' in window)
          await new Promise<void>((resolve, reject) => {
            const req = indexedDB.deleteDatabase('keyval-store')
            req.onsuccess = () => resolve()
            req.onerror = () => reject(req.error)
            req.onblocked = () =>
              reject(Error('Close other DocReadyApp tabs and try again.'))
          })
      }
      setMessage(
        confirm === 'preferences'
          ? 'Preferences cleared.'
          : confirm === 'drafts'
            ? 'Saved drafts, requirement templates, and workflow settings cleared.'
            : 'Recent history and OCR cache cleared.',
      )
      setError('')
      setConfirm('')
    } catch (e) {
      setError('Could not clear local data. ' + String(e))
      setConfirm('')
    }
  }
  return (
    <div className="settings">
      <div className="tool-heading">
        <h1>Settings</h1>
        <p>Set defaults and manage what this browser saves.</p>
      </div>
      <Panel title="Appearance and defaults">
        <div className="form-grid">
          <Field label="Navigation theme">
            <select
              value={draft.theme}
              onChange={(e) =>
                update({ theme: e.target.value as Preferences['theme'] })
              }
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </Field>
          <Field label="Motion">
            <select
              value={draft.motion}
              onChange={(e) =>
                update({ motion: e.target.value as Preferences['motion'] })
              }
            >
              <option value="system">System setting</option>
              <option value="reduced">Reduce motion</option>
            </select>
          </Field>
          <Field label="Interface language">
            <select defaultValue="en">
              <option value="en">English</option>
            </select>
          </Field>
          <ImageFormats
            format={draft.format}
            onChange={(format) => update({ format })}
          />
          <Field
            label={
              'Default image quality ' + Math.round(draft.quality * 100) + '%'
            }
          >
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.01}
              value={draft.quality}
              onChange={(e) => update({ quality: +e.target.value })}
            />
          </Field>
          <Field label="Default PDF page size">
            <select
              value={draft.paper}
              onChange={(e) => update({ paper: e.target.value })}
            >
              {['A4', 'Letter', 'A5'].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Check
            label="Save recent tools on this browser"
            checked={draft.recent}
            onChange={(recent) => update({ recent })}
          />
        </div>
        <div className="action-row">
          <Button
            onClick={() => {
              try {
                set(draft)
                if (!draft.recent) removeLocal('recent')
                setMessage('Settings saved.')
                setError('')
              } catch (e) {
                setError('Browser storage unavailable. ' + String(e))
              }
            }}
          >
            Save preferences
          </Button>
        </div>
      </Panel>
      <Panel title="Local data">
        <p className="mini">
          Leaving a tool or reloading clears its open files. These controls
          affect preferences, templates, drafts and caches in this browser.
        </p>
        <div className="action-row">
          <Button variant="secondary" onClick={() => setConfirm('drafts')}>
            Clear saved drafts and templates
          </Button>
          <Button variant="secondary" onClick={() => setConfirm('ocr')}>
            Clear history and OCR cache
          </Button>
          <Button variant="quiet" onClick={() => setConfirm('preferences')}>
            Reset preferences
          </Button>
          <Link to="/privacy" className="text-link">
            Privacy information
          </Link>
        </div>
      </Panel>
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      <ErrorState error={error} />
      {confirm && (
        <Modal
          title="Clear this browser’s data?"
          onClose={() => setConfirm('')}
        >
          <p>
            {confirm === 'drafts'
              ? 'This deletes the saved resume draft, reusable application templates, and workflow settings.'
              : confirm === 'ocr'
                ? 'This clears tool history and locally cached OCR data. Language packs must load again before you can use them offline.'
                : 'This restores default settings and clears tool history.'}
          </p>
          <div className="action-row">
            <Button variant="secondary" onClick={() => setConfirm('')}>
              Cancel
            </Button>
            <Button onClick={() => void clear()}>Confirm clear</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
