import type { OCRLanguage } from '../../lib/local-ocr'
export type { OCRLanguage }
export type Language = 'en' | 'hi' | 'es' | 'fr' | 'de'
export type Pair = 'en-hi' | 'hi-en'
export type Box = { x: number; y: number; width: number; height: number }
export type BlockRole =
  'heading' | 'paragraph' | 'list' | 'cell' | 'header' | 'footer' | 'code'
export type TextBlock = {
  id: string
  page: number
  role: BlockRole
  original: string
  translated: string
  box: Box
  sourceLines?: Box[]
  confidence?: number
  row?: number
  column?: number
  style?: BoxStyle
}
export type BoxStyle = {
  color: string
  background: string
  opacity: number
  size: number
  align: 'left' | 'center' | 'right'
  direction: 'auto' | 'ltr' | 'rtl'
  lineSpacing: number
  rotation: number
  font: 'sans' | 'serif'
}
export type SourcePage = {
  index: number
  width: number
  height: number
  scanned: boolean
}
export type Extraction = {
  pages: SourcePage[]
  blocks: TextBlock[]
  warnings: string[]
}
export type JobProgress = {
  stage: string
  done?: number
  total?: number
  unit?: 'bytes' | 'blocks' | 'pages' | 'files'
}
