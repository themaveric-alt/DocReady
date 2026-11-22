import { Field, Button } from '../../../components/shared'
import type { Box, BoxStyle, TextBlock } from '../types'
import {
  clampBox,
  defaultBoxStyle,
} from '../image-translator/translatedImageRenderer'

export function BlockEditor({
  blocks,
  filter,
  selected,
  edit,
  pick,
}: {
  blocks: TextBlock[]
  filter: string
  selected?: string
  edit: (id: string, changes: Partial<TextBlock>) => void
  pick: (id: string) => void
}) {
  const filtered = blocks.filter(
    (b) =>
      !filter ||
      (b.original + '\n' + b.translated)
        .toLocaleLowerCase()
        .includes(filter.toLocaleLowerCase()),
  )
  if (!filtered.length)
    return <p className="mini">No matching text blocks on this page.</p>
  return (
    <div className="translation-blocks">
      {filtered.map((b, i) => (
        <article
          className={
            'translation-block' + (selected === b.id ? ' selected' : '')
          }
          key={b.id}
        >
          <div className="between">
            <strong>
              {b.role === 'cell'
                ? 'Table cell'
                : b.role[0].toUpperCase() + b.role.slice(1)}{' '}
              {i + 1}
            </strong>
            {b.confidence !== undefined && (
              <small>OCR confidence {Math.round(b.confidence)}%</small>
            )}
          </div>
          <div className="translation-compare">
            <Field label={'Original text ' + (i + 1)}>
              <textarea
                dir="auto"
                rows={3}
                value={b.original}
                onFocus={() => pick(b.id)}
                onChange={(e) =>
                  edit(b.id, { original: e.target.value, translated: '' })
                }
              />
            </Field>
            <Field label={'Translated text ' + (i + 1)}>
              <textarea
                dir="auto"
                rows={3}
                value={b.translated}
                onFocus={() => pick(b.id)}
                onChange={(e) => edit(b.id, { translated: e.target.value })}
              />
            </Field>
          </div>
        </article>
      ))}
    </div>
  )
}

export function ImageBoxFields({
  block,
  position,
  edit,
  move,
  reset,
}: {
  block: TextBlock
  position: Box
  edit: (style: BoxStyle) => void
  move: (position: Box) => void
  reset: () => void
}) {
  const style = block.style ?? defaultBoxStyle
  const apply = <T extends keyof BoxStyle>(key: T, value: BoxStyle[T]) =>
    edit({ ...style, [key]: value })
  return (
    <>
      <div className="form-grid">
        <Field label="Font">
          <select
            value={style.font}
            onChange={(e) => apply('font', e.target.value as BoxStyle['font'])}
          >
            <option value="sans">Unicode sans</option>
            <option value="serif">Serif with Unicode fallback</option>
          </select>
        </Field>
        <Field label="Font size (% of short edge)">
          <input
            type="number"
            min={1.3}
            max={12}
            step=".1"
            value={style.size}
            onChange={(e) =>
              apply('size', Math.max(1.3, Math.min(12, +e.target.value)))
            }
          />
        </Field>
        <Field label="Text color">
          <input
            type="color"
            value={style.color}
            onChange={(e) => apply('color', e.target.value)}
          />
        </Field>
        <Field label="Panel color">
          <input
            type="color"
            value={style.background}
            onChange={(e) => apply('background', e.target.value)}
          />
        </Field>
        <Field label="Panel opacity">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={style.opacity}
            onChange={(e) => apply('opacity', +e.target.value)}
          />
        </Field>
        <Field label="Text alignment">
          <select
            value={style.align}
            onChange={(e) =>
              apply('align', e.target.value as BoxStyle['align'])
            }
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </Field>
        <Field label="Text direction">
          <select
            value={style.direction}
            onChange={(e) =>
              apply('direction', e.target.value as BoxStyle['direction'])
            }
          >
            <option value="auto">Auto</option>
            <option value="ltr">Left to right</option>
            <option value="rtl">Right to left</option>
          </select>
        </Field>
        <Field label="Line spacing">
          <input
            type="number"
            min={1.15}
            max={2}
            step=".05"
            value={style.lineSpacing}
            onChange={(e) =>
              apply('lineSpacing', Math.max(1.15, Math.min(2, +e.target.value)))
            }
          />
        </Field>
        <Field label="Rotation (degrees)">
          <input
            type="number"
            min={-15}
            max={15}
            value={style.rotation}
            onChange={(e) =>
              apply('rotation', Math.max(-15, Math.min(15, +e.target.value)))
            }
          />
        </Field>
        {(['x', 'y', 'width', 'height'] as const).map((key) => (
          <Field key={key} label={key.toUpperCase() + ' (%)'}>
            <input
              type="number"
              min={0}
              max={100}
              step=".1"
              value={Math.round(position[key] * 1000) / 10}
              onChange={(e) =>
                move(clampBox({ ...position, [key]: +e.target.value / 100 }))
              }
            />
          </Field>
        ))}
      </div>
      <Button variant="secondary" onClick={reset}>
        Reset box adjustments
      </Button>
    </>
  )
}
