import { fullCrop, type Crop } from '../../../lib/raster'

export type Point = { x: number; y: number }
export type Stroke = {
  points: Point[]
  radius: number
  softness: number
  action: 'add' | 'erase' | 'restore' | 'protect'
}
export type ColorEdits = {
  brightness: number
  exposure: number
  contrast: number
  highlights: number
  shadows: number
  saturation: number
  vibrance: number
  temperature: number
  tint: number
  gamma: number
  sharpness: number
  noise: number
  grayscale: boolean
}
export const neutral: ColorEdits = {
  brightness: 0,
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  saturation: 0,
  vibrance: 0,
  temperature: 0,
  tint: 0,
  gamma: 0,
  sharpness: 0,
  noise: 0,
  grayscale: false,
}
export type OutfitFit = {
  id: string
  x: number
  neck: number
  width: number
  height: number
  angle: number
  approved: boolean
}
export type PhotoEdits = {
  color: ColorEdits
  crop: Crop
  rotation: number
  flipH: boolean
  flipV: boolean
  zoom: number
  offsetX: number
  offsetY: number
  background: 'original' | 'solid' | 'transparent' | 'blur'
  fill: string
  blur: number
  backgroundLight: number
  feather: number
  mask?: Blob
  strokes: Stroke[]
  outfit?: OutfitFit
  border: number
  borderColor: string
  margin: number
  corners: number
  shadow: boolean
}
export const initialEdits: PhotoEdits = {
  color: neutral,
  crop: fullCrop,
  rotation: 0,
  flipH: false,
  flipV: false,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  background: 'original',
  fill: '#ffffff',
  blur: 12,
  backgroundLight: 100,
  feather: 1,
  strokes: [],
  border: 0,
  borderColor: '#21314a',
  margin: 0,
  corners: 0,
  shadow: false,
}
export type PhotoHistory = {
  past: PhotoEdits[]
  current: PhotoEdits
  future: PhotoEdits[]
}
export function photoHistory(
  previous: PhotoHistory,
  action: PhotoEdits | 'undo' | 'redo' | 'clear',
): PhotoHistory {
  const { past, current, future } = previous
  if (action === 'clear')
    return { past: [], current: initialEdits, future: [] }
  if (action === 'undo')
    return past.length
      ? {
          past: past.slice(0, -1),
          current: past.at(-1)!,
          future: [current, ...future],
        }
      : previous
  if (action === 'redo')
    return future.length
      ? {
          past: [...past, current],
          current: future[0],
          future: future.slice(1),
        }
      : previous
  return { past: [...past.slice(-23), current], current: action, future: [] }
}
export type PortraitAnchor = {
  x: number
  neck: number
  width: number
  angle: number
  method: 'face' | 'silhouette' | 'manual'
}
export type PhotoAnalysis = {
  width: number
  height: number
  format: string
  orientation?: number
  transparent: boolean
  brightness: number
  contrast: number
  shadows: number
  highlights: number
  sharpness: number
  noise: number
  background: number
  temperature: number
  tint: number
  anchor?: PortraitAnchor
}
export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))
export function autoCredit(photo: PhotoAnalysis): ColorEdits {
  return {
    ...neutral,
    exposure: clamp(
      Math.log2(132 / Math.max(30, photo.brightness)) * 0.65,
      -0.47,
      0.65,
    ),
    contrast: photo.contrast < 48 ? 12 : photo.contrast > 115 ? -7 : 4,
    highlights: photo.highlights > 0.07 ? -15 : -5,
    shadows: photo.shadows > 0.16 ? 16 : 5,
    temperature: clamp(-photo.temperature * 0.27, -9, 9),
    tint: clamp(-photo.tint * 0.22, -8, 8),
    sharpness: photo.sharpness < 9 ? 12 : 5,
    noise: photo.noise > 8 ? 17 : 0,
  }
}
export function cropRatio(
  width: number,
  height: number,
  ratio: number,
): Crop {
  const w = Math.min(1, (ratio * height) / width),
    h = Math.min(1, width / (ratio * height))
  return { x: (1 - w) / 2, y: (1 - h) / 2, width: w, height: h }
}
