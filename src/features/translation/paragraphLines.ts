import type { Box } from './types'

type TextLine = { box: Box; text: string }

export function sameParagraph(previous: TextLine, next: TextLine) {
  const { box: a } = previous
  const { box: b } = next
  const height = Math.max(a.height, b.height)
  const gap = b.y - (a.y + a.height)
  const aligned = Math.abs(a.x - b.x) < 0.024
  const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const endsSentence = /[.!?।॥][”’"')\]]*$/u.test(previous.text)
  const startsList = /^(?:[•●▪◦–-]\s|\d+[.)]\s)/u.test(next.text)
  return (
    !startsList &&
    Math.min(a.height, b.height) >= height * 0.58 &&
    gap >= -height * 0.28 &&
    gap <= height * (endsSentence ? 0.48 : 0.85) &&
    (aligned ||
      (!endsSentence && overlap >= Math.min(a.width, b.width) * 0.72))
  )
}

export function joinParagraphLines(first: string, next: string) {
  const softHyphen = first.endsWith('\u00ad')
  const wrappedWord =
    /\p{Ll}{3}[-‐]$/u.test(first) && /^\p{Ll}{2}/u.test(next)
  return softHyphen || wrappedWord
    ? first.slice(0, -1) + next
    : first + ' ' + next
}
