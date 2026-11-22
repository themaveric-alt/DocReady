import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Modal,
  Panel,
  Progress,
  Results,
  move,
  useOperation,
} from '../components/shared'
import { pageCountLabel, errorText, safeName } from '../lib/files'
import { readLocal, removeLocal, usePrefs, writeLocal } from '../lib/prefs'
import {
  makeResume,
  resumeStyles,
  type ResumeData,
  type ResumeStyle,
} from '../lib/resume-pdf'
const initial = (): ResumeData => ({
  name: '',
  contact: '',
  layout: 'Modern Professional',
  font: 'sans',
  margin: 43,
  spacing: 1,
  color: '#5348b6',
  sections: [
    'Professional summary',
    'Education',
    'Skills',
    'Work experience',
    'Projects',
    'Certifications',
    'Languages',
    'Portfolio links',
  ].map((title) => ({ id: crypto.randomUUID(), title, body: '' })),
})
const fontFamily = {
  sans: 'Arial, sans-serif',
  serif: 'Georgia, serif',
  mono: 'Courier New, monospace',
}
export default function Resume() {
  const [draft, setDraft] = useState(() => readLocal('resume', initial())),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [confirm, setConfirm] = useState(false),
    [paper, setPaper] = useState(() =>
      usePrefs.getState().prefs.paper === 'Letter' ? 'Letter' : 'A4',
    ),
    op = useOperation()
  const style = resumeStyles[draft.layout]
  function apply(diff: Partial<ResumeData>) {
    op.reset()
    setMessage('')
    setDraft((d) => ({ ...d, ...diff }))
  }
  function save() {
    try {
      writeLocal('resume', draft)
      setMessage('Draft saved in this browser.')
      setError('')
    } catch (e) {
      setError('Could not save local draft. ' + errorText(e))
    }
  }
  return (
    <>
      <div className="tool-layout">
        <div>
          <Panel title="Contact and layout">
            <fieldset disabled={op.pending} className="form-grid">
              <Field label="Full name">
                <input
                  value={draft.name}
                  autoComplete="name"
                  onChange={(e) => apply({ name: e.target.value })}
                  maxLength={100}
                />
              </Field>
              <Field label="Template">
                <select
                  value={draft.layout}
                  onChange={(e) =>
                    apply({ layout: e.target.value as ResumeStyle })
                  }
                >
                  {Object.keys(resumeStyles).map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <div className="full">
                <Field label="Contact details">
                  <input
                    value={draft.contact}
                    autoComplete="off"
                    onChange={(e) => apply({ contact: e.target.value })}
                    placeholder="Email, phone, city or portfolio"
                    maxLength={300}
                  />
                </Field>
              </div>
              <Field label="Font">
                <select
                  value={draft.font}
                  onChange={(e) =>
                    apply({ font: e.target.value as ResumeData['font'] })
                  }
                >
                  <option value="sans">Sans serif</option>
                  <option value="serif">Serif</option>
                  <option value="mono">Monospace</option>
                </select>
              </Field>
              <Field label="Accent color">
                <input
                  type="color"
                  value={draft.color}
                  onChange={(e) => apply({ color: e.target.value })}
                />
              </Field>
              <Field label={'Spacing ' + draft.spacing.toFixed(2) + '×'}>
                <input
                  type="range"
                  min={0.8}
                  max={1.6}
                  step={0.05}
                  value={draft.spacing}
                  onChange={(e) => apply({ spacing: +e.target.value })}
                />
              </Field>
              <Field label="Margins (pt)">
                <input
                  type="number"
                  min={20}
                  max={85}
                  value={draft.margin}
                  onChange={(e) => apply({ margin: +e.target.value })}
                />
              </Field>
              <Field label="Page size">
                <select
                  value={paper}
                  onChange={(e) => {
                    op.reset()
                    setPaper(e.target.value)
                  }}
                >
                  <option>A4</option>
                  <option>Letter</option>
                </select>
              </Field>
            </fieldset>
            <div className="action-row">
              <Button
                disabled={!draft.name.trim() || op.pending}
                onClick={() =>
                  void op.run(async () => {
                    const pdf = await makeResume(draft, paper)
                    return [
                      {
                        name: safeName(draft.name.trim()) + '-resume.pdf',
                        blob: pdf.blob,
                        detail:
                          pageCountLabel(pdf.pages) + ' · Selectable text',
                      },
                    ]
                  })
                }
              >
                Generate resume PDF
              </Button>
              <Button variant="secondary" disabled={op.pending} onClick={save}>
                Save local draft
              </Button>
              <Button
                variant="quiet"
                disabled={op.pending}
                onClick={() => setConfirm(true)}
              >
                Delete saved draft
              </Button>
            </div>
            <p className="mini">
              The PDF uses Western fonts. A draft is saved only when you choose
              Save local draft.
            </p>
            <Progress pending={op.pending} />
            <ErrorState error={op.error || error} />
            {message && (
              <p className="success" role="status">
                {message}
              </p>
            )}
          </Panel>
          <Panel title="Resume sections">
            <fieldset disabled={op.pending} className="row-stack">
              {draft.sections.map((s, i) => (
                <div className="requirement row-stack" key={s.id}>
                  <div className="between">
                    <Field label="Section heading">
                      <input
                        value={s.title}
                        maxLength={80}
                        onChange={(e) =>
                          apply({
                            sections: draft.sections.map((x) =>
                              x.id === s.id
                                ? { ...x, title: e.target.value }
                                : x,
                            ),
                          })
                        }
                      />
                    </Field>
                    <div className="action-row">
                      <IconButton
                        label={'Move ' + s.title + ' up'}
                        disabled={i === 0}
                        onClick={() =>
                          apply({ sections: move(draft.sections, i, i - 1) })
                        }
                      >
                        <ArrowUp size={15} />
                      </IconButton>
                      <IconButton
                        label={'Move ' + s.title + ' down'}
                        disabled={i === draft.sections.length - 1}
                        onClick={() =>
                          apply({ sections: move(draft.sections, i, i + 1) })
                        }
                      >
                        <ArrowDown size={15} />
                      </IconButton>
                      <IconButton
                        label={'Remove ' + s.title}
                        onClick={() =>
                          apply({
                            sections: draft.sections.filter(
                              (x) => x.id !== s.id,
                            ),
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  </div>
                  <Field label={(s.title || 'Section') + ' content'}>
                    <textarea
                      value={s.body}
                      maxLength={4000}
                      onChange={(e) =>
                        apply({
                          sections: draft.sections.map((x) =>
                            x.id === s.id ? { ...x, body: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                </div>
              ))}
              <Button
                variant="secondary"
                disabled={draft.sections.length >= 20}
                onClick={() =>
                  apply({
                    sections: [
                      ...draft.sections,
                      {
                        id: crypto.randomUUID(),
                        title: 'Custom section',
                        body: '',
                      },
                    ],
                  })
                }
              >
                <Plus size={17} /> Add section
              </Button>
            </fieldset>
          </Panel>
        </div>
        <Panel title="Live preview" className="resume-preview">
          {draft.name || draft.sections.some((s) => s.body) ? (
            <article
              className="resume-page"
              style={{
                fontFamily: fontFamily[draft.font],
                padding: Math.min(39, Math.max(12, draft.margin * 0.52)),
                lineHeight: 1.45 * draft.spacing,
              }}
            >
              <header
                style={{
                  textAlign: style.center ? 'center' : 'left',
                  borderTop: style.band
                    ? '4px solid ' + draft.color
                    : undefined,
                  paddingTop: style.band ? 13 : 0,
                }}
              >
                <h3
                  style={{ fontFamily: 'inherit', fontSize: style.size * 0.82 }}
                >
                  {draft.name}
                </h3>
                <p>{draft.contact}</p>
              </header>
              {draft.sections
                .filter((s) => s.body.trim() && s.title.trim())
                .map((s) => (
                  <section key={s.id}>
                    <h4
                      style={{
                        color: draft.color,
                        borderBottom: style.line ? undefined : 'none',
                      }}
                    >
                      {draft.layout === 'Clean Editorial'
                        ? s.title
                        : s.title.toUpperCase()}
                    </h4>
                    <p>{s.body}</p>
                  </section>
                ))}
            </article>
          ) : (
            <EmptyState>
              Enter your name or add a section to preview your resume.
            </EmptyState>
          )}
        </Panel>
      </div>
      <Results items={op.items} />
      {confirm && (
        <Modal
          title="Delete the saved resume draft?"
          onClose={() => setConfirm(false)}
        >
          <p>
            The resume you are editing will stay open until you leave this tool.
          </p>
          <div className="action-row">
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                try {
                  removeLocal('resume')
                  setMessage('Saved draft deleted.')
                  setError('')
                } catch (e) {
                  setError(errorText(e))
                }
                setConfirm(false)
              }}
            >
              Delete draft
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}
