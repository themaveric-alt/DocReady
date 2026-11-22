import { joinParagraphLines, sameParagraph } from '../paragraphLines'
import { isTechnical } from '../models/segments'
import type { Box, TextBlock } from '../types'

export type PositionedText = { text: string; box: Box; font: number }
type Row = PositionedText[]
const edge = (b: Box) => b.x + b.width
export function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x)),
    y = Math.min(...boxes.map((b) => b.y))
  return {
    x,
    y,
    width: Math.max(...boxes.map(edge)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  }
}

function joinWords(text: PositionedText[]) {
  return text
    .map((span, i) => {
      if (!i) return span.text
      const prev = text[i - 1]
      return (
        (span.box.x - edge(prev.box) > 0.0018 &&
        !/^\s|^[,.;:!?।)]/u.test(span.text) &&
        !/\s$/u.test(prev.text)
          ? ' '
          : '') + span.text
      )
    })
    .join('')
    .replaceAll(/\s+/gu, ' ')
    .trim()
}

export function structurePage(
  items: PositionedText[],
  page: number,
): TextBlock[] {
  if (!items.length) return []
  const baseFont = [...items].map((t) => t.font).sort((a, b) => a - b)[
    Math.floor(items.length / 2)
  ]
  const rows: Row[] = []
  for (const item of [...items].sort(
    (a, b) => a.box.y - b.box.y || a.box.x - b.box.x,
  )) {
    const row = rows.at(-1)
    if (
      row &&
      Math.abs(item.box.y - row[0].box.y) <
        Math.max(0.003, item.box.height * 0.43)
    )
      row.push(item)
    else rows.push([item])
  }
  const lines = rows.map((row) => {
    const groups: Row[] = []
    for (const span of row.sort((a, b) => a.box.x - b.box.x)) {
      const group = groups.at(-1)
      if (group && span.box.x - edge(group.at(-1)!.box) < 0.032)
        group.push(span)
      else groups.push([span])
    }
    return groups
      .map((group) => ({
        text: joinWords(group),
        box: union(group.map((s) => s.box)),
        font: Math.max(...group.map((s) => s.font)),
      }))
      .filter((x) => x.text)
  })
  const result: TextBlock[] = []
  function add(
    line: PositionedText,
    role: TextBlock['role'],
    row?: number,
    column?: number,
  ) {
    result.push({
      id: `p${page}-b${result.length}`,
      page,
      original: line.text,
      translated: '',
      role,
      box: line.box,
      row,
      column,
    })
  }
  function roleOf(line: PositionedText): TextBlock['role'] {
    if (isTechnical(line.text)) return 'code'
    if (line.box.y < 0.045) return 'header'
    if (line.box.y > 0.92) return 'footer'
    if (line.font > baseFont * 1.23 && line.text.length < 115)
      return 'heading'
    if (/^(?:[•●▪◦–-]\s|\d+[.)]\s)/u.test(line.text)) return 'list'
    return 'paragraph'
  }
  let previousLine: PositionedText | undefined
  function paragraph(line: PositionedText) {
    const role = roleOf(line)
    const previous = result.at(-1)
    if (
      role === 'paragraph' &&
      previous?.role === 'paragraph' &&
      previousLine &&
      sameParagraph(previousLine, line)
    ) {
      previous.original = joinParagraphLines(previous.original, line.text)
      previous.box = union([previous.box, line.box])
    } else add(line, role)
    previousLine = line
  }
  const tableMatches = (a: PositionedText[], b: PositionedText[]) =>
    a.length >= 2 &&
    a.length === b.length &&
    a.every((cell, index) => Math.abs(cell.box.x - b[index].box.x) < 0.03)
  const multi = lines.filter(
    (row) =>
      row.length === 2 && row[0].box.width > 0.14 && row[1].box.x > 0.43,
  )
  // Dense two-column body text is read left column first. Repeated short rows are table candidates.
  const columns =
    multi.filter((row) => row[0].text.length > 25 && row[1].text.length > 25)
      .length >= 3
  if (columns) {
    const first = lines.findIndex((row) => multi.includes(row))
    const last = lines.findLastIndex((row) => multi.includes(row))
    lines.slice(0, first).flat().forEach(paragraph)
    for (const side of [0, 1]) {
      lines
        .slice(first, last + 1)
        .flat()
        .filter((line) => (line.box.x >= 0.43 ? 1 : 0) === side)
        .forEach(paragraph)
    }
    lines
      .slice(last + 1)
      .flat()
      .forEach(paragraph)
    return result
  }
  for (let i = 0; i < lines.length; i++) {
    let end = i + 1
    while (
      end < lines.length &&
      tableMatches(lines[i], lines[end]) &&
      lines[end][0].box.y - lines[end - 1][0].box.y < 0.075
    )
      end++
    if (end - i >= 3) {
      for (; i < end; i++)
        lines[i].forEach((cell, column) => add(cell, 'cell', i, column))
      i--
    } else lines[i].forEach(paragraph)
  }
  return result
}
