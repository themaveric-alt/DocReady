import type * as OpenCV from '@techstark/opencv-js'
import { type OpenCv } from '../../lib/opencv-worker'
import {
  documentRegions,
  type Candidate,
  type PageAnalysis,
} from './documentRegions'
import {
  bounds,
  boxQuad,
  compactPDFQuad,
  distance,
  groupOverlap,
  quadArea,
  validQuad,
  type Quad,
} from './geometry'
import { BOTTOM_CARD_START, bottomWalletPage, canonicalPage, turnQuad, walletQuad } from './walletRegions'

/** Analysis is upright in the PDF's native orientation. All returned corners
 * are mapped back to the displayed viewport used by preview and export. */
function uprightImage(image: ImageData, rotation: number): ImageData {
  const turns = ((rotation / 90) % 4 + 4) % 4
  if (!turns) return image
  const width = turns % 2 ? image.height : image.width
  const height = turns % 2 ? image.width : image.height
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const nx = turns === 1 ? image.height-1-y : turns === 2 ? image.width-1-x : y
    const ny = turns === 1 ? x : turns === 2 ? image.height-1-y : image.width-1-x
    const source = (y*image.width+x)*4, target = (ny*width+nx)*4
    data[target]=image.data[source]; data[target+1]=image.data[source+1]
    data[target+2]=image.data[source+2]; data[target+3]=image.data[source+3]
  }
  return { width, height, data, colorSpace: image.colorSpace }
}

function analysisImage(image: ImageData): ImageData {
  const scale=Math.min(1,1800/Math.max(image.width,image.height))
  if(scale===1) return image
  const width=Math.round(image.width*scale),height=Math.round(image.height*scale)
  const data=new Uint8ClampedArray(width*height*4)
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const sx=Math.min(image.width-2,Math.floor((x+.5)/scale)),sy=Math.min(image.height-2,Math.floor((y+.5)/scale))
    const p=(sy*image.width+sx)*4,q=((sy+1)*image.width+sx)*4,o=(y*width+x)*4
    for(let c=0;c<3;c++) data[o+c]=(image.data[p+c]+image.data[p+4+c]+image.data[q+c]+image.data[q+4+c])/4
    data[o+3]=255
  }
  return{width,height,data,colorSpace:image.colorSpace}
}

export function detectCardRegions(
  cv: OpenCv, rgba: ImageData, targetRatio: number, page?: PageAnalysis,
): Candidate[] {
  const rotation = page?.rotation ?? 0
  // High-resolution source remains untouched for final crops; bound the two
  // search passes to a small worker analysis image.
  const aligned = uprightImage(analysisImage(rgba), -rotation)
  const canonical = page ? canonicalPage(page) : undefined
  const found = detectAligned(cv, aligned, targetRatio, canonical, Boolean(page?.lowerSection))
  // A bottom strip cannot contain every layout (stacked and off-center faces
  // often cross it). Search the whole page for the missing compact side too.
  if (canonical?.lowerSection && found.length < 2) {
    const fallback = detectAligned(cv, aligned, targetRatio, {...canonical,lowerSection:false}, true)
    for(const candidate of fallback) if(!found.some(other => groupOverlap(other.corners,candidate.corners)>.27)) found.push(candidate)
  }
  return found
    .map(candidate => ({ ...candidate, corners: turnQuad(candidate.corners, rotation) }))
}

function detectAligned(
  cv: OpenCv,
  rgba: ImageData,
  targetRatio: number,
  page?: PageAnalysis,
  walletStrict = false,
): Candidate[] {
  const rgbaMat = cv.matFromImageData(rgba)
  const bottomOnly = page && bottomWalletPage(page)
  const roiX = bottomOnly ? Math.ceil(rgba.width * .02) : 0
  const roiY = bottomOnly ? Math.ceil(rgba.height * BOTTOM_CARD_START) : 0
  const work = rgbaMat.roi(new cv.Rect(roiX, roiY, rgba.width - roiX * 2, rgba.height - roiY))
  const gray = new cv.Mat(),
    smooth = new cv.Mat(),
    edges = new cv.Mat(),
    mask = new cv.Mat()
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5))
  const candidates: Candidate[] = []
  const width = rgba.width,
    height = rgba.height,
    area = width * height
  function lineRectangles(binary: OpenCV.Mat) {
    const lines=new cv.Mat()
    type Line = {a:number;b:number;position:number}
    const horizontal:Line[]=[],vertical:Line[]=[]
    const minLength=Math.max(45,Math.round(width*.075))
    try {
      cv.HoughLinesP(binary,lines,1,Math.PI/180,Math.max(22,Math.round(minLength/3)),minLength,Math.round(width*.008))
      for(let i=0;i<lines.rows;i++){
        const [x1,y1,x2,y2]=Array.from(lines.data32S.slice(i*4,i*4+4))
        if(Math.abs(y1-y2)<=3&&Math.abs(x1-x2)>=width*.13) horizontal.push({a:Math.min(x1,x2)+roiX,b:Math.max(x1,x2)+roiX,position:(y1+y2)/2+roiY})
        if(Math.abs(x1-x2)<=3) vertical.push({a:Math.min(y1,y2)+roiY,b:Math.max(y1,y2)+roiY,position:(x1+x2)/2+roiX})
      }
      const hs=horizontal.sort((a,b)=>(b.b-b.a)-(a.b-a.a)).slice(0,100)
      for(let i=0;i<hs.length;i++)for(let j=i+1;j<hs.length;j++){
        const a=hs[i],b=hs[j],top=Math.min(a.position,b.position),bottom=Math.max(a.position,b.position)
        const left=(a.a+b.a)/2,right=(a.b+b.b)/2
        if(bottom-top<height*.045||Math.abs(a.a-b.a)>width*.012||Math.abs(a.b-b.b)>width*.012)continue
        const side=(x:number)=>vertical.some(v=>Math.abs(v.position-x)<width*.012&&Math.min(v.b,bottom)-Math.max(v.a,top)>(bottom-top)*.68)
        const corners=boxQuad(left/(width-1),top/(height-1),right/(width-1),bottom/(height-1))
        // Reconstructed lines support an interrupted border, but must not
        // outrank an intact outer contour with a convenient interior frame.
        if(page&&walletQuad(corners,page)&&side(left)&&side(right))candidates.push({corners,score:.90,inferred:true})
      }
    } finally { lines.delete() }
  }
  function collect(binary: OpenCV.Mat, bonus: number) {
    const contours = new cv.MatVector(),
      hierarchy = new cv.Mat(),
      poly = new cv.Mat()
    try {
      cv.findContours(
        binary,
        contours,
        hierarchy,
        cv.RETR_LIST,
        cv.CHAIN_APPROX_SIMPLE,
      )
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i)
        try {
          const contourArea = cv.contourArea(contour)
          if (contourArea < area * 0.028 || contourArea > area * 0.975)
            continue
          const arc = cv.arcLength(contour, true)
          for (const tolerance of [0.012, 0.023, 0.04]) {
            cv.approxPolyDP(contour, poly, arc * tolerance, true)
            if (poly.rows !== 4 || !cv.isContourConvex(poly)) continue
            const data = poly.data32S
            const points = Array.from({ length: 4 }, (_, k) => ({
              x: data[k * 2] + roiX,
              y: data[k * 2 + 1] + roiY,
            }))
            const center = {
              x: points.reduce((n, p) => n + p.x, 0) / 4,
              y: points.reduce((n, p) => n + p.y, 0) / 4,
            }
            points.sort(
              (a, b) =>
                Math.atan2(a.y - center.y, a.x - center.x) -
                Math.atan2(b.y - center.y, b.x - center.x),
            )
            const start = points.reduce(
              (best, p, k) =>
                p.x / width + p.y / height <
                points[best].x / width + points[best].y / height
                  ? k
                  : best,
              0,
            )
            const ordered = Array.from(
              { length: 4 },
              (_, k) => points[(start + k) % 4],
            ) as Quad
            const [a, b, c, d] = ordered,
              sizeA = (distance(a, b) + distance(d, c)) / 2,
              sizeB = (distance(a, d) + distance(b, c)) / 2
            const long = Math.max(sizeA, sizeB),
              short = Math.min(sizeA, sizeB)
            const ratio = long / short,
              fill = contourArea / quadArea(ordered)
            if (
              short < 44 ||
              ratio < 1.05 ||
              ratio > 3.4 ||
              fill < 0.72 ||
              fill > 1.25
            )
              break
            const corners = ordered.map((p) => ({
              x: p.x / (width - 1),
              y: p.y / (height - 1),
            })) as Quad
            const box = bounds(corners)
            if (
              !validQuad(corners) ||
              (page && !compactPDFQuad(corners, page.width, page.height)) ||
              (page && walletStrict && !walletQuad(corners, page)) ||
              (box.left < 0.018 &&
                box.top < 0.018 &&
                box.right > 0.982 &&
                box.bottom > 0.982)
            )
              break
            // Favor a conservative outer border when nested rectangles are also visible.
            const shape =
              1 - Math.min(1, Math.abs(Math.log(ratio / targetRatio)) / 0.8)
            const perspective =
              (Math.min(distance(a, b), distance(d, c)) /
                Math.max(distance(a, b), distance(d, c)) +
                Math.min(distance(a, d), distance(b, c)) /
                  Math.max(distance(a, d), distance(b, c))) /
              2
            const score =
              0.33 +
              0.25 * shape +
              0.18 * Math.min(fill, 1) +
              0.12 * perspective +
              bonus
            candidates.push({ corners, score: Math.min(0.98, score) })
            break
          }
        } finally {
          contour.delete()
        }
      }
    } finally {
      contours.delete()
      hierarchy.delete()
      poly.delete()
    }
  }
  try {
    cv.cvtColor(work, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, smooth, new cv.Size(5, 5), 0)
    cv.Canny(smooth, edges, 24, 75)
    if(walletStrict) lineRectangles(edges)
    cv.morphologyEx(edges, mask, cv.MORPH_CLOSE, kernel)
    collect(mask, 0.06)
    if (bottomOnly) {
      const horizontal = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(Math.max(7,Math.round(width*.012)),1))
      const vertical = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1,Math.max(5,Math.round(height*.006))))
      try {
        cv.morphologyEx(edges, mask, cv.MORPH_CLOSE, horizontal)
        cv.morphologyEx(mask, edges, cv.MORPH_CLOSE, vertical)
        collect(edges, .04)
      } finally { horizontal.delete(); vertical.delete() }
    }
    cv.threshold(smooth, mask, 244, 255, cv.THRESH_BINARY_INV)
    cv.morphologyEx(mask, edges, cv.MORPH_CLOSE, kernel)
    collect(edges, 0.03)
    cv.adaptiveThreshold(
      smooth,
      mask,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      31,
      8,
    )
    cv.morphologyEx(mask, edges, cv.MORPH_CLOSE, kernel)
    collect(edges, 0)
    // Complement grayscale edges with saturated printed headers/borders.
    // Contour geometry and compact-page rejection still validate every result.
    for (let p = 0; p < work.cols * work.rows; p++) {
      // ROI rows need not be contiguous in the source Mat.
      const y = Math.floor(p / work.cols), x = p % work.cols
      const source = ((y + roiY) * width + x + roiX) * 4
      const r = rgba.data[source], g = rgba.data[source + 1], b = rgba.data[source + 2]
      mask.data[p] = Math.max(r, g, b) - Math.min(r, g, b) > 55 && Math.min(r, g, b) < 210 ? 255 : 0
    }
    cv.morphologyEx(mask, edges, cv.MORPH_CLOSE, kernel)
    collect(edges, 0)
  } finally {
    work.delete()
    rgbaMat.delete()
    gray.delete()
    smooth.delete()
    edges.delete()
    mask.delete()
    kernel.delete()
  }

  if (page) candidates.push(...documentRegions(rgba, page, targetRatio))
  const chosen: Candidate[] = []
  for (const c of candidates.sort(
    (a, b) =>
      b.score +
      quadArea(b.corners) * 0.28 -
      (a.score + quadArea(a.corners) * 0.28),
  )) {
    if (
      c.score < 0.64 ||
      (page && walletStrict && !walletQuad(c.corners, page)) ||
      chosen.some((p) => groupOverlap(p.corners, c.corners) > 0.27)
    )
      continue
    chosen.push(c)
    if (chosen.length === 6) break
  }
  chosen.sort((a, b) => {
    const A = bounds(a.corners),
      B = bounds(b.corners)
    const sameRow =
      Math.abs(A.top - B.top) <
      Math.min(A.bottom - A.top, B.bottom - B.top) * 0.35
    return sameRow ? A.left - B.left : A.top - B.top
  })
  if (bottomOnly && chosen.length === 2) {
    const a = bounds(chosen[0].corners), b = bounds(chosen[1].corners)
    if (a.right <= b.left && Math.abs(a.top-b.top) < .035 && Math.abs(a.bottom-b.bottom) < .035) {
      chosen[0].suggestedSide = 'front'
      chosen[1].suggestedSide = 'back'
    }
  }
  return chosen
}
