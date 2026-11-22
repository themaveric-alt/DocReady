import { beforeAll, describe, expect, test } from 'vitest'
import { createRequire } from 'node:module'
import type * as OpenCV from '@techstark/opencv-js'
import { createCanvas } from '@napi-rs/canvas'
import { detectCardRegions } from '../src/features/e-card-studio/cardDetector'
import { bounds, boxQuad, fullQuad } from '../src/features/e-card-studio/geometry'
import { canonicalPage, manualWalletSeed, sourceWalletQuad, turnQuad, walletQuad } from '../src/features/e-card-studio/walletRegions'
import type { PageAnalysis } from '../src/features/e-card-studio/documentRegions'

let cv: typeof OpenCV
beforeAll(async () => {
  // Native require avoids assimilating Emscripten's self-resolving thenable
  // through Vite's asynchronous module loader.
  const loader = createRequire(import.meta.url)('@techstark/opencv-js')
  ;({ cv } = await new Promise<{ cv: typeof OpenCV }>(resolve => loader.Mat ? resolve({cv:loader}) : loader.then((api: typeof OpenCV) => resolve({cv:api}))))
})
const page: PageAnalysis = { width: 595.28, height: 841.89, lowerSection: true, anchors: [] }

function fixture(mode: 'solid' | 'dashed' | 'single' | 'blank' | 'faint' = 'solid') {
  const canvas = createCanvas(1000,1414), ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white'; ctx.fillRect(0,0,1000,1414)
  // Full-page border plus a plausible landscape receipt in the letter region.
  ctx.strokeStyle = '#111'; ctx.lineWidth = 3
  ctx.strokeRect(4,4,992,1406); ctx.strokeRect(100,170,790,500)
  ctx.fillStyle = '#11882a'; ctx.fillRect(140,210,200,65)
  ctx.font = '22px sans-serif'; ctx.fillStyle = '#111'; ctx.fillText('LETTER REGION - MUST NOT EXPORT',130,330)
  if(mode === 'blank') return canvas
  for(const [i,x] of (mode === 'single' ? [65] : [65,530]).entries()) {
    if(mode !== 'faint') { ctx.setLineDash(mode === 'dashed' ? [9,7] : []); ctx.strokeRect(x,1060,405,255); ctx.setLineDash([]) }
    ctx.fillStyle = i ? '#2455ba' : '#bf213a'; ctx.fillRect(x+15,1078,375,20)
    ctx.fillRect(x+20,1130,70,95)
    ctx.fillStyle = '#111'; ctx.font='18px sans-serif'
    ctx.fillText(i ? 'Back side - address' : 'Front side - DOB',x+110,1140)
    ctx.fillText('Fictional test document',x+110,1175)
    ctx.fillText('Keep every detail',x+110,1210)
    ctx.fillText('TEST ONLY',x+15,1295)
  }
  if(mode==='faint') {ctx.strokeStyle='#444';ctx.setLineDash([10,8]);ctx.beginPath();ctx.moveTo(65,1043);ctx.lineTo(935,1043);ctx.stroke();ctx.setLineDash([])}
  return canvas
}
function detect(canvas: ReturnType<typeof fixture>, analysis = page) {
  return detectCardRegions(cv,canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height) as unknown as ImageData,1.586,analysis)
}
describe('bottom detachable wallet detector', () => {
  for(const side of ['left','right'] as const) test(`both bordered sides on the ${side}, including a face above the bottom strip`,()=>{
    const canvas=fixture('blank'),ctx=canvas.getContext('2d'),x=side==='left'?65:530
    for(const y of [710,1100]) {ctx.clearRect(x-5,y-5,415,265);ctx.fillStyle='white';ctx.fillRect(x-5,y-5,415,265);ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.strokeRect(x,y,405,255);ctx.fillStyle='#315bad';ctx.fillRect(x+12,y+12,380,16);ctx.fillStyle='#111';ctx.font='18px sans-serif';ctx.fillText('Fictional card',x+20,y+80);ctx.fillText('Do not clip footer',x+20,y+235)}
    const found=detect(canvas).sort((a,b)=>bounds(a.corners).top-bounds(b.corners).top)
    expect(found).toHaveLength(2)
    expect(bounds(found[0].corners).top).toBeLessThan(.58)
    expect(bounds(found[1].corners).top).toBeGreaterThan(.7)
    for(const c of found)expect(sourceWalletQuad(c.corners,page)).toBe(true)
  })
  test('borderless stacked faces in one column split vertically, without manual back crop',()=>{
    const canvas=fixture('blank'),ctx=canvas.getContext('2d')
    for(const y of [850,1070]){ctx.fillStyle='#315bad';ctx.fillRect(70,y,280,10);ctx.fillRect(82,y+38,40,70);ctx.fillStyle='#111';ctx.font='15px sans-serif';ctx.fillText('Fictional card',175,y+60);ctx.fillRect(70,y+174,280,2)}
    const found=detect(canvas).sort((a,b)=>bounds(a.corners).top-bounds(b.corners).top)
    expect(found).toHaveLength(2)
    expect(bounds(found[0].corners).bottom).toBeLessThan(bounds(found[1].corners).top)
    for(const c of found){expect(c.inferred).toBe(true);expect(bounds(c.corners).right).toBeLessThan(.4)}
  })
  test('two borderless faces both in the left half split at their real gutter',()=>{
    const canvas=fixture('blank'),ctx=canvas.getContext('2d')
    for(const x of [70,280]){ctx.fillStyle='#315bad';ctx.fillRect(x,1120,180,8);ctx.fillRect(x+8,1155,35,40);ctx.fillStyle='#111';ctx.font='11px sans-serif';ctx.fillText('Test card',x+55,1160);ctx.fillRect(x,1232,180,2)}
    const found=detect(canvas).sort((a,b)=>bounds(a.corners).left-bounds(b.corners).left)
    expect(found).toHaveLength(2)
    expect(bounds(found[1].corners).right).toBeLessThan(.5)
    expect(bounds(found[0].corners).right).toBeLessThan(bounds(found[1].corners).left)
  })
  test('staggered borderless sides use independent content bounds without ratio padding', () => {
    const canvas=fixture('blank'),ctx=canvas.getContext('2d')
    const expected=[{x:80,y:1070},{x:535,y:1040}]
    for(const {x,y} of expected){
      ctx.fillStyle='#254c9c';ctx.fillRect(x,y,385,12);ctx.fillRect(x+12,y+45,60,90)
      ctx.fillStyle='#111';ctx.font='18px sans-serif';ctx.fillText('Fictional document',x+100,y+65);ctx.fillText('Keep all details',x+100,y+100)
      ctx.fillRect(x,y+238,385,2)
    }
    const found=detect(canvas).sort((a,b)=>bounds(a.corners).left-bounds(b.corners).left)
    expect(found).toHaveLength(2)
    for(const [i,c] of found.entries()){
      const b=bounds(c.corners), e=expected[i]
      expect(c.inferred).toBe(true)
      expect(b.left*1000).toBeGreaterThanOrEqual(e.x-4)
      expect(b.left*1000).toBeLessThanOrEqual(e.x)
      expect(b.right*1000).toBeGreaterThanOrEqual(e.x+385)
      expect(b.right*1000).toBeLessThanOrEqual(e.x+389)
      expect(b.top*1414).toBeGreaterThanOrEqual(e.y-4)
      expect(b.top*1414).toBeLessThanOrEqual(e.y)
      expect(b.bottom*1414).toBeGreaterThanOrEqual(e.y+240)
      expect(b.bottom*1414).toBeLessThanOrEqual(e.y+244)
    }
  })
  test('outer card edges win over a tempting ID-shaped interior frame', () => {
    const canvas=fixture('solid'),ctx=canvas.getContext('2d')
    ctx.lineWidth=3;ctx.strokeStyle='#111'
    ctx.strokeRect(90,1075,355,224);ctx.strokeRect(555,1075,355,224)
    const found=detect(canvas)
    expect(found).toHaveLength(2)
    for(const [i,c] of found.entries()){
      const b=bounds(c.corners), x=i?530:65
      expect(Math.abs(b.left*1000-x)).toBeLessThanOrEqual(5)
      expect(Math.abs(b.right*1000-(x+405))).toBeLessThanOrEqual(5)
      expect(Math.abs(b.top*1414-1060)).toBeLessThanOrEqual(5)
      expect(Math.abs(b.bottom*1414-1315)).toBeLessThanOrEqual(5)
    }
  })
  for(const mode of ['solid','dashed','faint'] as const) test(`${mode} borders isolate both lower cards, never the letter`, () => {
    const candidates=detect(fixture(mode))
    expect(candidates).toHaveLength(2)
    for(const candidate of candidates){
      expect(walletQuad(candidate.corners,page)).toBe(true)
      expect(bounds(candidate.corners).top).toBeGreaterThan(.70)
      expect(bounds(candidate.corners).top).toBeLessThan(1078/1414)
      expect(bounds(candidate.corners).bottom).toBeGreaterThan(.91)
    }
    expect(bounds(candidates[0].corners).right).toBeLessThan(.5)
    expect(bounds(candidates[1].corners).left).toBeGreaterThan(.5)
  })
  test('missing back and letter-only pages never acquire invented cards', () => {
    expect(detect(fixture('single'))).toHaveLength(1)
    expect(detect(fixture('blank'))).toHaveLength(0)
  })
  test('portrait and top-half ID-shaped rectangles fail the final guard', () => {
    expect(walletQuad(fullQuad,page)).toBe(false)
    expect(walletQuad(boxQuad(.1,.59,.48,.95),page)).toBe(false)
    expect(walletQuad(boxQuad(.1,.15,.505,.33),page)).toBe(false)
    expect(walletQuad(boxQuad(.065,.75,.47,.9305),page)).toBe(true)
  })
  test('quarter-turn display rotations preserve the same lower native regions', () => {
    const original=fixture('solid')
    for(const rotation of [90,180,270]){
      const swapped=rotation%180===90
      const canvas=createCanvas(swapped?original.height:original.width,swapped?original.width:original.height)
      const ctx=canvas.getContext('2d');ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(rotation*Math.PI/180);ctx.drawImage(original,-original.width/2,-original.height/2)
      const analysis={...page,rotation,width:swapped?page.height:page.width,height:swapped?page.width:page.height}
      const result=detect(canvas,analysis)
      expect(result).toHaveLength(2)
      for(const c of result){expect(sourceWalletQuad(c.corners,analysis)).toBe(true);expect(bounds(turnQuad(c.corners,-rotation)).top).toBeGreaterThan(.70)}
      expect(canonicalPage(analysis).width).toBe(page.width)
    }
  }, 20_000)
  test('manual handles start on a bottom ID-ratio suggestion instead of A4', () => {
    for(const side of ['front','back']){
      const seed=manualWalletSeed(page.width,page.height,side)
      expect(walletQuad(seed,page)).toBe(true)
      expect(bounds(seed).top).toBeGreaterThan(.58)
      expect(bounds(seed).right-bounds(seed).left).toBeLessThan(.5)
    }
  })
})
