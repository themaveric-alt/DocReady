import hindiFont from '@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff2?url'
import latinFont from '@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-latin-400-normal.woff2?url'

const notoLatin = '/assets/fonts/NotoSans-Regular.ttf'
const notoDevanagari = '/assets/fonts/NotoSansDevanagari-Regular.ttf'

let fontBytes: Promise<[ArrayBuffer, ArrayBuffer]> | undefined
export function translationFontBytes() {
  fontBytes ??= Promise.all(
    [notoLatin, notoDevanagari].map(async (path) => {
      const response = await fetch(path)
      if (!response.ok)
        throw Error(
          'Could not load the local Unicode export font. Reconnect and try again.',
        )
      return response.arrayBuffer()
    }) as [Promise<ArrayBuffer>, Promise<ArrayBuffer>],
  ).catch((error) => {
    fontBytes = undefined
    throw error
  })
  return fontBytes
}

export const families = {
  sans: '"Translation Hindi", "DocReady Noto", "DocReady Devanagari", "Noto Sans Devanagari", Arial, sans-serif',
  serif:
    'Georgia, "Translation Hindi", "DocReady Devanagari", "Noto Sans Devanagari", serif',
}
let fontsReady: Promise<void> | undefined
export function ensureFonts() {
  fontsReady ??= translationFontBytes()
    .then(async ([latin, devanagari]) => {
      const fonts = await Promise.all([
        new FontFace('DocReady Noto', latin).load(),
        new FontFace('DocReady Devanagari', devanagari).load(),
      ])
      for (const font of fonts) document.fonts.add(font)
    })
    .catch((error) => {
      fontsReady = undefined
      throw error
    })
  return fontsReady
}
export async function embeddedFontCSS() {
  const fonts = await Promise.all(
    [
      [hindiFont, 'U+0900-097F,U+A8E0-A8FF,U+1CD0-1CFF,U+200C-200D'],
      [latinFont, 'U+0000-024F,U+2000-206F'],
    ].map(async ([url, range]) => {
      const response = await fetch(url)
      if (!response.ok) throw Error('Could not load the Unicode export font.')
      const blob = await response.blob()
      const encoded = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      return `@font-face{font-family:"Translation Hindi";src:url(data:font/woff2;base64,${encoded}) format("woff2");font-weight:400;unicode-range:${range}}`
    }),
  )
  return fonts.join('\n')
}
