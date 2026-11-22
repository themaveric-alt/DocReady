export const mmToPoints = (mm: number) => (mm * 72) / 25.4
export const mmToPixels = (mm: number, dpi: number) =>
  Math.round((mm * dpi) / 25.4)
export const ID1 = { width: 85.6, height: 53.98 }
export const paperSizes = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
}
export type Size = { width: number; height: number }
export type Position = { x: number; y: number }
export type Side = 'front' | 'back' | 'extra'
export type PrintCard = Size & { id: string; side: Side }
export type Placement = Size & Position & { id: string }
export type Sheet = Size & { cards: Placement[] }
export type LayoutMode =
  'wide' | 'vertical' | 'single' | 'grid' | 'custom' | 'duplex' | 'pvc'
export type PrintSettings = {
  paper: keyof typeof paperSizes | 'custom'
  paperSize: Size
  orientation: 'portrait' | 'landscape' | 'auto'
  mode: LayoutMode
  marginX: number
  marginY: number
  gapX: number
  gapY: number
  horizontal: 'left' | 'center'
  vertical: 'top' | 'center'
  positions: Record<string, Position>
  single: string
  flip: 'long' | 'short'
  marks: 'none' | 'corners' | 'border' | 'guides'
  ruler: boolean
  dpi: 0 | 300 | 600
  vector: boolean
}
export const defaultPrint: PrintSettings = {
  paper: 'A4',
  paperSize: paperSizes.A4,
  orientation: 'portrait',
  mode: 'wide',
  marginX: 10,
  marginY: 10,
  gapX: 8,
  gapY: 8,
  horizontal: 'center',
  vertical: 'center',
  positions: {},
  single: '',
  flip: 'long',
  marks: 'none',
  ruler: false,
  dpi: 300,
  vector: true,
}
export function withinPaper(
  placement: Placement,
  paper: Size,
  marginX: number,
  marginY: number,
): Placement {
  return {
    ...placement,
    x: Math.max(
      marginX,
      Math.min(placement.x, paper.width - marginX - placement.width),
    ),
    y: Math.max(
      marginY,
      Math.min(placement.y, paper.height - marginY - placement.height),
    ),
  }
}
function overlaps(a: Placement, b: Placement) {
  return (
    a.x < b.x + b.width - 0.0001 &&
    b.x < a.x + a.width - 0.0001 &&
    a.y < b.y + b.height - 0.0001 &&
    b.y < a.y + a.height - 0.0001
  )
}
function arrange(cards: PrintCard[], paper: Size, s: PrintSettings): Sheet[] {
  const { marginX, marginY, gapX, gapY } = s
  if (
    [marginX, marginY, gapX, gapY].some((n) => !Number.isFinite(n) || n < 0)
  )
    throw Error('Enter nonnegative margins and spacing.')
  const width = paper.width - marginX * 2
  const rulerTop = s.ruler && s.mode === 'duplex' ? 12 : 0
  const height = paper.height - marginY * 2 - (s.ruler ? 12 : 0) - rulerTop
  if (s.ruler && paper.width - marginX * 2 < 54)
    throw Error('The calibration ruler needs 54 mm of usable paper width.')
  if (
    cards.some(
      (c) =>
        c.width > width ||
        c.height > height ||
        !Number.isFinite(c.width + c.height) ||
        c.width < 5 ||
        c.height < 5,
    )
  )
    throw Error(
      'A card does not fit inside the printable area. Adjust its size, the margins, or the paper.',
    )
  let rows: PrintCard[][] = []
  const heightOf = (row: PrintCard[]) => Math.max(...row.map((c) => c.height))
  const widthOf = (row: PrintCard[]) =>
    row.reduce((sum, c) => sum + c.width, 0) + (row.length - 1) * gapX
  const sheets: Sheet[] = []
  const drawRows = () => {
    const rowsHeight =
      rows.reduce((sum, row) => sum + heightOf(row), 0) +
      (rows.length - 1) * gapY
    if (rowsHeight > height || rows.some((row) => widthOf(row) > width))
      throw Error(
        'These cards do not fit in that arrangement. Try landscape, smaller margins, or a different layout.',
      )
    let y =
      marginY +
      rulerTop +
      (s.vertical === 'center' ? (height - rowsHeight) / 2 : 0)
    const placed = rows.flatMap((row) => {
      let x =
        marginX + (s.horizontal === 'center' ? (width - widthOf(row)) / 2 : 0)
      const h = heightOf(row)
      const placements = row.map((card) => {
        const placement = {
          id: card.id,
          x,
          y: y + (s.vertical === 'center' ? (h - card.height) / 2 : 0),
          width: card.width,
          height: card.height,
        }
        x += card.width + gapX
        return placement
      })
      y += h + gapY
      return placements
    })
    sheets.push({ ...paper, cards: placed })
    rows = []
  }
  if (s.mode === 'grid' || s.mode === 'custom') {
    for (const card of cards) {
      const last = rows.at(-1)
      if (last && widthOf([...last, card]) <= width) {
        const previous = rows.slice(0, -1)
        const occupied = previous.reduce(
          (total, row) => total + heightOf(row) + gapY,
          0,
        )
        if (occupied + heightOf([...last, card]) <= height) {
          last.push(card)
          continue
        }
      }
      const occupied = rows.reduce(
        (total, row) => total + heightOf(row) + gapY,
        0,
      )
      if (rows.length && occupied + card.height > height) drawRows()
      rows.push([card])
    }
    drawRows()
    if (s.mode === 'custom') {
      for (const sheet of sheets) {
        sheet.cards = sheet.cards.map((p) =>
          s.positions[p.id]
            ? withinPaper(
                { ...p, ...s.positions[p.id] },
                { ...paper, height: paper.height - (s.ruler ? 12 : 0) },
                marginX,
                marginY,
              )
            : p,
        )
        if (
          sheet.cards.some((a, i) =>
            sheet.cards.slice(i + 1).some((b) => overlaps(a, b)),
          )
        )
          throw Error(
            'Two cards overlap. Adjust the positions or reset placement before export.',
          )
      }
    }
    return sheets
  }
  if (s.mode === 'duplex') {
    const front = cards.find((c) => c.side === 'front')
    const back = cards.find((c) => c.side === 'back')
    if (!front || !back)
      throw Error('Choose one Front and one Back for duplex printing.')
    if (
      Math.abs(front.width - back.width) > 0.05 ||
      Math.abs(front.height - back.height) > 0.05
    )
      throw Error(
        'For duplex printing, use matching physical dimensions for both sides.',
      )
    rows = [[front]]
    drawRows()
    const f = sheets[0].cards[0]
    const mirrorX = (s.flip === 'long') === paper.height >= paper.width
    sheets.push({
      ...paper,
      cards: [
        {
          ...f,
          id: back.id,
          x: mirrorX ? paper.width - f.x - f.width : f.x,
          y: mirrorX ? f.y : paper.height - f.y - f.height,
        },
      ],
    })
    return sheets
  }
  rows = s.mode === 'vertical' ? cards.map((card) => [card]) : [cards]
  drawRows()
  return sheets
}
export function planSheets(all: PrintCard[], s: PrintSettings): Sheet[] {
  const ordered = [...all].sort(
    (a, b) =>
      ['front', 'back', 'extra'].indexOf(a.side) -
      ['front', 'back', 'extra'].indexOf(b.side),
  )
  if (s.mode === 'pvc') {
    return ordered
      .filter((card) => card.side === 'front' || card.side === 'back')
      .slice(0, 2)
      .map(({ id }) => ({ ...ID1, cards: [{ id, ...ID1, x: 0, y: 0 }] }))
  }
  const cards =
    s.mode === 'single'
      ? [ordered.find((c) => c.id === s.single) ?? ordered[0]].filter(Boolean)
      : s.mode === 'wide' || s.mode === 'vertical'
        ? ordered.slice(0, 2)
        : ordered
  if (!cards.length) return []
  const source = s.paper === 'custom' ? s.paperSize : paperSizes[s.paper]
  if (
    [source.width, source.height].some(
      (n) => !Number.isFinite(n) || n < 35 || n > 600,
    )
  )
    throw Error('Paper dimensions must be between 35 and 600 mm.')
  const portrait = {
    width: Math.min(source.width, source.height),
    height: Math.max(source.width, source.height),
  }
  const landscape = { width: portrait.height, height: portrait.width }
  if (s.orientation !== 'auto')
    return arrange(
      cards,
      s.orientation === 'portrait' ? portrait : landscape,
      s,
    )
  let first: Sheet[] | undefined
  try {
    first = arrange(cards, portrait, s)
  } catch {
    /* Try landscape. */
  }
  try {
    const second = arrange(cards, landscape, s)
    return !first || second.length < first.length ? second : first
  } catch (e) {
    if (first) return first
    throw e
  }
}
export function contain(source: Size, box: Size) {
  const scale = Math.min(box.width / source.width, box.height / source.height)
  const width = source.width * scale,
    height = source.height * scale
  return {
    width,
    height,
    x: (box.width - width) / 2,
    y: (box.height - height) / 2,
  }
}
export function effectiveDpi(source: Size, slot: Size) {
  const image = contain(source, slot)
  return Math.floor(
    Math.min(source.width / image.width, source.height / image.height) *
      25.4 +
      0.00001,
  )
}
export type GuideLine = { x1: number; y1: number; x2: number; y2: number }
export function marksFor(
  sheet: Sheet,
  marks: PrintSettings['marks'],
): GuideLine[] {
  if (marks === 'none') return []
  const lines: GuideLine[] = []
  const add = (x1: number, y1: number, x2: number, y2: number) => {
    if (
      [x1, x2].some((x) => x < 0 || x > sheet.width) ||
      [y1, y2].some((y) => y < 0 || y > sheet.height)
    )
      return
    if (
      sheet.cards.some((c) => {
        const right = c.x + c.width,
          bottom = c.y + c.height
        return y1 === y2
          ? y1 > c.y &&
              y1 < bottom &&
              Math.min(x1, x2) < right &&
              Math.max(x1, x2) > c.x
          : x1 > c.x &&
              x1 < right &&
              Math.min(y1, y2) < bottom &&
              Math.max(y1, y2) > c.y
      })
    )
      return
    lines.push({ x1, y1, x2, y2 })
  }
  for (const { x, y, width, height } of sheet.cards) {
    const r = x + width,
      b = y + height
    if (marks === 'border') {
      add(x - 0.65, y - 0.65, r + 0.65, y - 0.65)
      add(r + 0.65, y - 0.65, r + 0.65, b + 0.65)
      add(r + 0.65, b + 0.65, x - 0.65, b + 0.65)
      add(x - 0.65, b + 0.65, x - 0.65, y - 0.65)
    } else {
      for (const [cx, dx] of [
        [x, -1],
        [r, 1],
      ])
        for (const [cy, dy] of [
          [y, -1],
          [b, 1],
        ]) {
          add(cx + dx * 0.6, cy, cx + dx * 3, cy)
          add(cx, cy + dy * 0.6, cx, cy + dy * 3)
          if (marks === 'guides') {
            add(cx + dx * 3.6, cy, cx + dx * 6.6, cy)
            add(cx, cy + dy * 3.6, cx, cy + dy * 6.6)
          }
        }
    }
  }
  return lines
}
export function rulerFor(sheet: Sheet): GuideLine[] {
  const x = (sheet.width - 50) / 2,
    y = sheet.height - 7
  return [
    { x1: x, y1: y, x2: x + 50, y2: y },
    ...Array.from({ length: 11 }, (_, i) => ({
      x1: x + 5 * i,
      y1: y,
      x2: x + 5 * i,
      y2: y - (i % 2 ? 1.5 : 2.5),
    })),
  ]
}
