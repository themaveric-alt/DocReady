export function wrapText(
  text: string,
  width: number,
  measure: (text: string) => number,
) {
  const lines: string[] = []
  const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.trim().split(/\s+/u)) {
      const trial = line ? line + ' ' + word : word
      if (measure(trial) <= width) {
        line = trial
        continue
      }
      if (line) lines.push(line)
      line = ''
      for (const { segment } of graphemes.segment(word)) {
        if (line && measure(line + segment) > width) {
          lines.push(line)
          line = ''
        }
        if (measure(segment) > width) return undefined
        line += segment
      }
    }
    lines.push(line)
  }
  return lines
}
