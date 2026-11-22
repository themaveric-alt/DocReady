import type { CSSProperties } from 'react'
import type { SourcePage, TextBlock } from '../types'
import { families } from '../fonts'
import { wrapText } from '../layoutText'

export type PDFMode =
  | 'layout'
  | 'reflow'
  | 'bilingual-columns'
  | 'bilingual-blocks'
  | 'bilingual-pages'

function Content({
  block,
  source = false,
}: {
  block: TextBlock
  source?: boolean
}) {
  const text = source ? block.original : block.translated
  if (block.role === 'heading') return <h2 dir="auto">{text}</h2>
  if (block.role === 'code') return <pre dir="auto">{text}</pre>
  return (
    <p dir="auto" data-role={block.role}>
      {text}
    </p>
  )
}

function OrderedBlocks({
  blocks,
  source = false,
}: {
  blocks: TextBlock[]
  source?: boolean
}) {
  const groups: TextBlock[][] = []
  for (const block of blocks) {
    if (block.role === 'cell' && groups.at(-1)?.[0].role === 'cell')
      groups.at(-1)!.push(block)
    else groups.push([block])
  }
  return groups.map((group) => {
    if (group[0].role !== 'cell')
      return <Content key={group[0].id} block={group[0]} source={source} />
    const rows = new Map<number, TextBlock[]>()
    for (const b of group)
      rows.set(b.row ?? 0, [...(rows.get(b.row ?? 0) ?? []), b])
    return (
      <table key={group[0].id}>
        <tbody>
          {[...rows].map(([row, cells]) => (
            <tr key={row}>
              {cells.map((cell) => (
                <td key={cell.id} dir="auto">
                  {source ? cell.original : cell.translated}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  })
}

const layoutWidth = 640
export function attemptPositions(
  page: SourcePage,
  blocks: TextBlock[],
  font: number,
  serif = false,
  measureWidth = layoutWidth,
): CSSProperties[] | undefined {
  const context = document.createElement('canvas').getContext('2d')
  if (
    !context ||
    page.scanned ||
    page.width > page.height * 1.6 ||
    page.height > page.width * 1.47
  )
    return
  const height = (measureWidth * page.height) / page.width
  const found: CSSProperties[] = []
  for (const block of blocks) {
    const box = block.box
    const right = Math.min(
      0.97,
      ...blocks
        .filter(
          (other) =>
            other.box.x > box.x + box.width * 0.6 &&
            Math.abs(other.box.y - box.y) < box.height * 0.7,
        )
        .map((other) => other.box.x - 0.012),
    )
    const bottom = Math.min(
      0.98,
      ...blocks
        .filter(
          (other) =>
            other.box.y > box.y + box.height * 0.65 &&
            other.box.x < right &&
            other.box.x + other.box.width > box.x,
        )
        .map((other) => other.box.y - 0.008),
    )
    const w = right - box.x,
      h = bottom - box.y
    const size = block.role === 'heading' ? font * 1.16 : font
    if (box.x < 0 || box.y < 0 || w < 0.03 || h < 0.01) return
    context.font = `${size}px ${families[serif ? 'serif' : 'sans']}`
    const lines = wrapText(
      block.translated,
      w * measureWidth - 4,
      (s) => context.measureText(s).width,
    )
    if (!lines || lines.length * size * 1.52 > h * height) return
    found.push({
      left: box.x * 100 + '%',
      top: box.y * 100 + '%',
      width: w * 100 + '%',
      minHeight: h * 100 + '%',
      fontSize: size + 'px',
    })
  }
  return found
}

export function PdfDocument({
  pages,
  blocks,
  mode,
  font,
  fontStyle,
  onlyPage,
  onFallback,
}: {
  pages: SourcePage[]
  blocks: TextBlock[]
  mode: PDFMode
  font: number
  fontStyle: 'sans' | 'serif'
  onlyPage?: number
  onFallback?: boolean
}) {
  const selected =
    onlyPage === undefined ? pages : pages.filter((p) => p.index === onlyPage)
  const available = blocks.filter((b) => b.translated.trim())
  return (
    <div
      className="translated-paper"
      style={{ fontSize: font, fontFamily: families[fontStyle] }}
    >
      {selected.map((page) => {
        const group = available.filter((b) => b.page === page.index)
        const positions =
          mode === 'layout'
            ? attemptPositions(page, group, font, fontStyle === 'serif')
            : undefined
        return (
          <section
            className="translation-doc-page"
            aria-label={'Translated page ' + (page.index + 1)}
            key={page.index}
          >
            {positions && group.length ? (
              <div
                className="translation-positioned"
                style={{ aspectRatio: page.width + ' / ' + page.height }}
              >
                {group.map((b, i) => (
                  <div
                    className="translation-positioned-block"
                    key={b.id}
                    style={positions[i]}
                  >
                    <Content block={b} />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <header className="translation-page-number">
                  Page {page.index + 1}
                </header>
                {mode === 'layout' && onFallback && group.length > 0 && (
                  <p className="mini">
                    Reflow used for this page to keep the translation readable.
                  </p>
                )}
                {!group.length ? (
                  <p>
                    {available.length
                      ? 'No translated text on this page.'
                      : 'Translate text to preview the document.'}
                  </p>
                ) : mode === 'bilingual-columns' ? (
                  <div className="translation-bilingual">
                    <h3>Original</h3>
                    <h3>Translation</h3>
                    {group.map((b) => (
                      <div className="translation-bilingual-row" key={b.id}>
                        <Content block={b} source />
                        <Content block={b} />
                      </div>
                    ))}
                  </div>
                ) : mode === 'bilingual-blocks' ? (
                  group.map((b) => (
                    <div className="translation-pair" key={b.id}>
                      <span>Original</span>
                      <Content block={b} source />
                      <span>Translation</span>
                      <Content block={b} />
                    </div>
                  ))
                ) : mode === 'bilingual-pages' ? (
                  <>
                    <h3>Original</h3>
                    <OrderedBlocks blocks={group} source />
                    <h3>Translation</h3>
                    <OrderedBlocks blocks={group} />
                  </>
                ) : (
                  <OrderedBlocks blocks={group} />
                )}
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}
