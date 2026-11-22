import { bounds, boxQuad, compactPDFQuad, type Quad } from './geometry'
import type { Size } from './printLayout'
import { BOTTOM_CARD_START, bottomWalletPage, walletQuad } from './walletRegions'

export type Candidate = { corners: Quad; score: number; inferred?: boolean; suggestedSide?: 'front' | 'back' }
export type PageAnalysis = Size & {
  lowerSection: boolean
  rotation?: number
  anchors: { left: number; top: number; right: number; bottom: number }[]
}

type Span = { start: number; end: number }

function bands(
  rows: number[],
  qualifies: (n: number, y: number) => boolean,
  gap: number,
) {
  const spans: Span[] = []
  for (let y = 0; y < rows.length; y++) {
    if (!qualifies(rows[y], y)) continue
    const last = spans.at(-1)
    if (last && y - last.end <= gap) last.end = y
    else spans.push({ start: y, end: y })
  }
  return spans
}

/** Infer compact regions from aligned ink and text, including detachable sections without borders. */
export function documentRegions(
  rgba: ImageData,
  page: PageAnalysis,
  target: number,
): Candidate[] {
  const { width, height, data } = rgba
  const plane = new Uint8Array(width * height)
  const guidePlane = new Uint8Array(width * height)
  const rows = Array<number>(height).fill(0)
  const guideRows = Array<number>(height).fill(0)
  const margin = Math.round(width * 0.04)
  const bottomOnly = bottomWalletPage(page)
  for (let y = Math.floor(height * (bottomOnly ? BOTTOM_CARD_START : 0.06)); y < height * 0.99; y++) {
    for (let x = margin; x < width - margin; x++) {
      const offset = (y * width + x) * 4
      const r = data[offset],
        g = data[offset + 1],
        b = data[offset + 2]
      const luminance = (r * 54 + g * 183 + b * 19) / 256
      const saturation = Math.max(r, g, b) - Math.min(r, g, b)
      if (luminance < 193 || (luminance < 231 && saturation > 52)) {
        plane[y * width + x] = 1
        rows[y]++
        if (saturation < 45 && luminance < 193) { guidePlane[y * width + x] = 1; guideRows[y]++ }
      }
    }
  }
  const guides = guideRows
    .map((count, y) => {
      if (count > width * .62) return y
      // Broken cutting guides have long horizontal coverage with repeated
      // ink/gap transitions. They are supporting evidence only.
      if (count < width * .15) return -1
      let first = -1, last = -1, transitions = 0, previous = 0
      for (let x = margin; x < width - margin; x++) {
        const ink = guidePlane[y * width + x]
        if (ink) { if (first < 0) first = x; last = x }
        if (ink !== previous) transitions++
        previous = ink
      }
      return last - first > width * .7 && transitions >= 8 && transitions <= 100 ? y : -1
    })
    .filter((y) => y >= 0)
  const guideSet = new Set(guides)
  const spans = bands(
    rows,
    (count, y) => count >= width * 0.018 && !guideSet.has(y),
    // Wallet panels often have a large gap before the number/footer line.
    // Keep it in the same group instead of trimming the bottom of the card.
    Math.round(height * (bottomOnly ? 0.065 : 0.026)),
  )
  const proposals: Candidate[] = []

  // A cutting guide is evidence, not a ruler: never invent two card widths
  // from panel height and the target print ratio.

  function envelope(
    columns: number[],
    band: Span,
    from: number,
    to: number,
    pair: boolean,
  ) {
    const hits = columns.slice(from, to)
    const cutoff = 2
    const first = hits.findIndex((count) => count >= cutoff)
    const last = hits.findLastIndex((count) => count >= cutoff)
    if (last - first < width * 0.14 || first < 0) return
    let left = (from + first) / width,
      right = (from + last + 1) / width
    // The two faces need not share their top/bottom position. Using a common
    // band for both adds the other side's whitespace or clips one footer.
    let firstRow = height, lastRow = -1
    for (let y = band.start; y <= band.end; y++) {
      if (guideSet.has(y)) continue
      let count = 0
      for (let x = from; x < to; x++) count += plane[y * width + x]
      if (count >= 2) { firstRow = Math.min(firstRow,y); lastRow = y }
    }
    if (lastRow < firstRow) return
    let top = firstRow / height,
      bottom = (lastRow + 1) / height
    const anchors = page.anchors.filter(
      (box) =>
        box.top < bottom &&
        box.bottom > top &&
        (box.left + box.right) / 2 > from / width &&
        (box.left + box.right) / 2 < to / width &&
        box.right - box.left < ((to - from) / width) * 0.83,
    )
    for (const box of anchors) {
      left = Math.min(left, box.left)
      right = Math.max(right, box.right)
      top = Math.min(top, box.top)
      bottom = Math.max(bottom, box.bottom)
    }
    const shape =
      ((right - left) * page.width) / ((bottom - top) * page.height)
    if (shape < 0.71 || shape > 3.15) return
    // Preserve the observed geometry. ID-1 fitting happens in the print engine,
    // never by enlarging/centering a source crop to manufacture a ratio.
    const x = Math.max(from / width, left - 2 / width)
    const y = Math.max(0, top - 2 / height)
    const r = Math.min(to / width, right + 2 / width)
    const b = Math.min(1, bottom + 2 / height)
    if (b-y > .32) return
    const nearGuide = guides.some(
      (y) => y < band.start && band.start - y < height * 0.065,
    )
    const corners = boxQuad(x, y, r, b)
    if (
      !compactPDFQuad(corners, page.width, page.height) ||
      right > r || left < x || top < y || bottom > b
    )
      return
    if (!pair && anchors.length < 2 && !nearGuide) return
    return {
      corners,
      inferred: true,
      score:
        (pair ? 0.77 : 0.66) +
        (nearGuide ? 0.035 : 0) +
        Math.min(0.04, anchors.length * 0.006) + Math.max(0,1-Math.abs(Math.log(shape/target))) * .02,
    }
  }

  function columnsFor(band: Span, from=margin, to=width-margin) {
    const columns=Array<number>(width).fill(0)
    for(let y=band.start;y<=band.end;y++) if(!guideSet.has(y))
      for(let x=from;x<to;x++) columns[x]+=plane[y*width+x]
    return columns
  }

  /** Find two independent groups along either axis, at their actual positions.
   * Both halves must independently contain plausible card-sized ink. Empty
   * space is a separator, never evidence of a second credential. */
  const visited = new Set<string>()
  function spatialPair(band: Span) {
    const key=band.start+':'+band.end
    if(visited.has(key)) return
    visited.add(key)
    const columns=columnsFor(band)
    const first=columns.findIndex(n=>n>=2),last=columns.findLastIndex(n=>n>=2)
    if(first<0 || last-first<width*.14) return
    const rowProjection=rows.map((count,y)=>y>=band.start&&y<=band.end&&!guideSet.has(y)?count:0)
    const splits = (values:number[],from:number,to:number) => {
      const result:{position:number;gap:number}[]=[]
      for(let i=from;i<=to;i++) {
        if(values[i]>1) continue
        const start=i
        while(i<=to&&values[i]<=1) i++
        if(start>from&&i<=to&&i-start>=3) result.push({position:Math.floor((start+i)/2),gap:i-start})
      }
      return result.sort((a,b)=>b.gap-a.gap).slice(0,16).map(item=>item.position)
    }
    const pairs: { a: Candidate; b: Candidate; rank:number }[]=[]
    function consider(a: ReturnType<typeof envelope>,b: ReturnType<typeof envelope>) {
      if(!a||!b||!walletQuad(a.corners,page)||!walletQuad(b.corners,page)) return
      const A=bounds(a.corners),B=bounds(b.corners)
      const wr=(A.right-A.left)/(B.right-B.left),hr=(A.bottom-A.top)/(B.bottom-B.top)
      if(wr<.6||wr>1.67||hr<.6||hr>1.67) return
      pairs.push({a,b,rank:a.score+b.score-Math.abs(Math.log(wr))*.1-Math.abs(Math.log(hr))*.1})
    }
    for(const split of splits(columns,first,last)) consider(
      envelope(columns,band,first,split,true),envelope(columns,band,split,last+1,true),
    )
    for(const split of splits(rowProjection,band.start,band.end)) {
      const above={start:band.start,end:split-1},below={start:split,end:band.end}
      consider(envelope(columnsFor(above),above,first,last+1,true),envelope(columnsFor(below),below,first,last+1,true))
    }
    const best=pairs.sort((a,b)=>b.rank-a.rank)[0]
    if(best) proposals.push(best.a,best.b)
  }

  // The old row-band limit rejected a complete vertical pair as one tall group.
  // Try the actual two-dimensional split before imposing single-card limits.
  const occupiedRows=rows.map((count,y)=>count>=width*.018&&!guideSet.has(y)?y:-1).filter(y=>y>=0)
  if(occupiedRows.length) spatialPair({start:occupiedRows[0],end:occupiedRows.at(-1)!})

  for (const band of spans) {
    spatialPair(band)
    const extent = (band.end - band.start) / height
    if (
      extent < 0.055 ||
      extent > 0.29 ||
      (bottomOnly && band.start < height * BOTTOM_CARD_START)
    )
      continue
    const columns = Array<number>(width).fill(0)
    for (let y = band.start; y <= band.end; y++) {
      if (guideSet.has(y)) continue
      for (let x = margin; x < width - margin; x++)
        columns[x] += plane[y * width + x]
    }
    const half = Math.round(width / 2)
    let divider = half,
      low = Infinity
    for (let x = Math.round(width * 0.415); x <= width * 0.585; x++) {
      let value = Math.abs(x - half) * 0.19
      for (let j = x - 4; j <= x + 4; j++) value += columns[j]
      if (value < low) {
        low = value
        divider = x
      }
    }
    const splitClear = columns
      .slice(divider - 3, divider + 4)
      .every((count) => count < (band.end - band.start) * 0.15)
    if (splitClear) {
      const left = envelope(columns, band, 0, divider, true)
      const right = envelope(columns, band, divider, width, true)
      if (left && right) {
        const a = bounds(left.corners),
          b = bounds(right.corners)
        const match = (a.right - a.left) / (b.right - b.left)
        if (match > 0.7 && match < 1.43) {
          proposals.push(left, right)
          continue
        }
      }
    }
    const single = envelope(columns, band, 0, width, false)
    if (single) proposals.push(single)
  }
  return bottomOnly ? proposals.filter(c => walletQuad(c.corners, page)) : proposals
}
