import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { createCanvas, loadImage, ImageData } from '@napi-rs/canvas'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { detectCardRegions } from '../src/features/e-card-studio/cardDetector'
import { bounds, type Quad } from '../src/features/e-card-studio/geometry'
import { defaultPrint, ID1, mmToPoints, planSheets } from '../src/features/e-card-studio/printLayout'
import { prepareExport } from '../src/features/e-card-studio/printExport'
import { previewCrop, rectangle, type Card } from '../src/features/e-card-studio/cardCrop'
import type { Source } from '../src/features/e-card-studio/cardInput'

const require = createRequire(import.meta.url)
let cv: any
beforeAll(async () => {
  const loader = require('@techstark/opencv-js')
  ;({cv} = await new Promise<{cv:any}>(resolve => loader.Mat ? resolve({cv:loader}) : loader.then((cv:any) => resolve({cv}))))
  GlobalWorkerOptions.workerSrc = pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href
  vi.stubGlobal('document', { createElement: (tag: string) => { if(tag !== 'canvas') throw Error('Unexpected DOM element '+tag); return createCanvas(1,1) } })
  vi.stubGlobal('ImageData', ImageData)
  vi.stubGlobal('createImageBitmap', async (blob: Blob) => { const image = await loadImage(Buffer.from(await blob.arrayBuffer())); Object.assign(image,{close:()=>{}}); return image })
})
afterAll(() => vi.unstubAllGlobals())

test('fine corner changes use the actual quadrilateral, not its bounding rectangle',()=>{
  const q: Quad=[{x:.1,y:.7},{x:.5,y:.7},{x:.5,y:.9},{x:.1,y:.9}]
  expect(rectangle(q)).toBe(true)
  expect(rectangle([{x:.101,y:.7},q[1],q[2],q[3]])).toBe(false)
})

async function syntheticPDF(separate = false, stacked = false) {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica)
  const width=mmToPoints(210), height=mmToPoints(297)
  const cw=mmToPoints(ID1.width), ch=mmToPoints(ID1.height)
  const sheet=()=>{const p=pdf.addPage([width,height]);p.drawRectangle({x:35,y:350,width:500,height:315,borderWidth:1,borderColor:rgb(.1,.1,.1)});p.drawRectangle({x:45,y:600,width:100,height:40,color:rgb(.1,.8,.2)});p.drawText('LETTER CONTENT: DO NOT CROP THIS', {x:40,y:730,size:20,font});return p}
  const first=sheet()
  for(const [index,x] of [38,315].entries()){
    const page=separate && index ? sheet() : first
    const left=separate||stacked?38:x, y=stacked&&!index?320:45
    page.drawRectangle({x:left,y,width:cw,height:ch,borderWidth:.8,borderColor:rgb(.1,.1,.1)})
    page.drawRectangle({x:left+8,y:y+ch-21,width:cw-16,height:12,color:index?rgb(.1,.2,.8):rgb(.8,.1,.15)})
    page.drawText(index?'BACK - FICTIONAL TEST':'FRONT - FICTIONAL TEST',{x:left+12,y:y+100,font,size:11})
    page.drawText('Preserve this bottom detail',{x:left+8,y:y+8,font,size:10})
    for(let row=0;row<10;row++)for(let col=0;col<10;col++)if((row+col)%2===0)page.drawRectangle({x:left+cw-50+col*3,y:y+25+row*3,width:3,height:3,color:rgb(0,0,0)})
  }
  return pdf.save()
}
async function open(bytes: Uint8Array) { const task=getDocument({data:new Uint8Array(bytes),standardFontDataUrl:process.cwd()+'/node_modules/pdfjs-dist/standard_fonts/'}); return Object.assign(await task.promise,{destroy:()=>task.destroy()}) }
async function rendered(pdf: Awaited<ReturnType<typeof open>>, index=1, scale=1.5) {
  const p=await pdf.getPage(index), viewport=p.getViewport({scale})
  const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height))
  await p.render({canvas,viewport}).promise
  return canvas
}

test('real PDF.js → OpenCV → crop → print export excludes the letter and preserves exact PVC/A4 dimensions', async () => {
  const bytes=await syntheticPDF(), pdf=await open(bytes)
  try {
    const canvas=await rendered(pdf,1,300/72), page=await pdf.getPage(1), view=page.getViewport({scale:1})
    const analysis={width:view.width,height:view.height,lowerSection:true,anchors:[]}
    const found=detectCardRegions(cv,canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height) as unknown as ImageData,1.586,analysis)
    expect(found).toHaveLength(2)
    const source={id:'synthetic',file:new File([bytes],'synthetic-test.pdf',{type:'application/pdf'}),pdf,width:view.width,height:view.height,page:0,pageRotation:0,hints:[],thumb:new Blob()} as unknown as Source
    const cards: Card[]=[]
    for(const [i,c] of found.entries()) {
      expect(bounds(c.corners).top).toBeGreaterThan(.7)
      const preview=await previewCrop(source,c.corners,0)
      expect(preview.width/preview.height).toBeCloseTo(ID1.width/ID1.height,1)
      cards.push({id:String(i),source,corners:c.corners,original:c.corners,rotation:0,preview,side:i?'back':'front',detected:true,accepted:true,confidence:'manual',walletOnly:true})
    }
    for(const mode of ['pvc','horizontal','vertical'] as const){
      const settings={...defaultPrint,mode,dpi:300 as const}
      const output=await prepareExport(planSheets(cards.map(c=>({id:c.id,side:c.side,...ID1})),settings),cards,settings,'pdf',()=>{},new AbortController().signal)
      const exported=await PDFDocument.load(await output[0].blob.arrayBuffer())
      expect(exported.getPageCount()).toBe(mode==='pvc'?2:1)
      for(const p of exported.getPages()){
        expect(p.getWidth()).toBeCloseTo(mmToPoints(mode==='pvc'?85.6:210),6)
        expect(p.getHeight()).toBeCloseTo(mmToPoints(mode==='pvc'?53.98:297),6)
      }
      const decoded=await open(new Uint8Array(await output[0].blob.arrayBuffer()))
      try {
        for(let i=1;i<=decoded.numPages;i++){
          const result=await rendered(decoded,i), data=result.getContext('2d').getImageData(0,0,result.width,result.height).data
          let green=0,red=0,blue=0,dark=0
          for(let n=0;n<data.length;n+=4){const[r,g,b]=[data[n],data[n+1],data[n+2]];if(g>140&&r<80&&b<100)green++;if(r>140&&g<90&&b<100)red++;if(b>140&&r<90&&g<100)blue++;if(Math.max(r,g,b)<80)dark++}
          expect(green).toBe(0);expect(dark).toBeGreaterThan(100)
          if(mode==='pvc'){expect(i===1?red:blue).toBeGreaterThan(100);expect(i===1?blue:red).toBe(0)}else{expect(red).toBeGreaterThan(100);expect(blue).toBeGreaterThan(100)}
        }
      }finally{await decoded.destroy()}
    }
    const original=cards[0].corners
    cards[0].corners=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}] as Quad
    await expect(prepareExport(planSheets(cards.map(c=>({id:c.id,side:c.side,...ID1})),defaultPrint),cards,defaultPrint,'pdf',()=>{},new AbortController().signal)).rejects.toThrow(/full letter page/)
    cards[0].corners=original
    cards[0].accepted=false
    await expect(prepareExport(planSheets(cards.map(c=>({id:c.id,side:c.side,...ID1})),defaultPrint),cards,defaultPrint,'pdf',()=>{},new AbortController().signal)).rejects.toThrow(/confirm/)
  }finally{await pdf.destroy()}
},30_000)

test('separate source pages produce one bottom wallet candidate each',async()=>{
  const pdf=await open(await syntheticPDF(true))
  try{expect(pdf.numPages).toBe(2);for(let i=1;i<=2;i++){const canvas=await rendered(pdf,i,2),p=await pdf.getPage(i),v=p.getViewport({scale:1});const found=detectCardRegions(cv,canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height) as unknown as ImageData,1.586,{width:v.width,height:v.height,lowerSection:true,anchors:[]});expect(found).toHaveLength(1);expect(bounds(found[0].corners).top).toBeGreaterThan(.7)}}finally{await pdf.destroy()}
},20_000)

test('both compact faces on the same side survive full-page fallback as valid crop candidates',async()=>{
  const pdf=await open(await syntheticPDF(false,true))
  try{
    const canvas=await rendered(pdf,1,2),p=await pdf.getPage(1),v=p.getViewport({scale:1})
    const found=detectCardRegions(cv,canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height) as unknown as ImageData,1.586,{width:v.width,height:v.height,lowerSection:true,anchors:[]})
    expect(found).toHaveLength(2)
    expect(found.every(c=>bounds(c.corners).right<.5)).toBe(true)
    expect(found.some(c=>bounds(c.corners).top<.58)).toBe(true)
  }finally{await pdf.destroy()}
},20_000)
