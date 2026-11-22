import type { Preset } from './cardInput'
import type { Source } from './cardInput'
import { bounds, type Quad } from './geometry'

export const govtCards = [
  { id: 'aadhaar', name: 'e-Aadhaar Card', description: 'Downloaded or masked e-Aadhaar PDF', color: '#ed8128', second: '#2464b5', filename: 'Aadhaar_Card', glyph: 'identity' },
  { id: 'pan', name: 'e-PAN Card', description: 'NSDL / UTIITSL', color: '#3465d9', second: '#06b6d4', filename: 'PAN_Card', glyph: 'document' },
  { id: 'epic', name: 'e-Voter ID', description: 'Electronic voter card · e-EPIC', color: '#ec8135', second: '#4f46ad', filename: 'Voter_ID_Card', glyph: 'vote' },
  { id: 'licence', name: 'Driving License', description: 'mParivahan / Sarathi', color: '#10a878', second: '#0e7490', filename: 'Driving_License', glyph: 'wheel' },
  { id: 'apaar', name: 'APAAR ID Card', description: 'One Nation One Student ID', color: '#8b5cf6', second: '#bf8b20', filename: 'APAAR_ID_Card', glyph: 'education' },
  { id: 'abha', name: 'ABHA Health Card', description: 'Ayushman Bharat Health Account', color: '#0caa9a', second: '#e57b32', filename: 'ABHA_Health_Card', glyph: 'health' },
  { id: 'shram', name: 'e-Shram Card', description: 'Worker registration card', color: '#e5a51c', second: '#8b572f', filename: 'eShram_Card', glyph: 'work' },
  { id: 'other', name: 'Other / Custom E-Card', description: 'Other government or identity PDF', color: '#64748b', second: '#6366f1', filename: 'Govt_ID_Card', glyph: 'document' },
] as const satisfies readonly { id: Preset; name: string; description: string; color: string; second: string; filename: string; glyph: string }[]
export type GovtCardId = (typeof govtCards)[number]['id']
export function cardFilename(id: GovtCardId, date = new Date()) {
  const day = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
  return `${govtCards.find(card => card.id === id)!.filename}_${day}.pdf`
}
/** A prior ranks existing visual candidates only. It never creates a crop or
 * elevates a guessed zone to a verified boundary. Layout variants remain valid. */
export function layoutPrior(preset: Preset, source: Pick<Source, 'hints'>, corners: Quad) {
  const box = bounds(corners)
  const text = source.hints.filter(hint => hint.x >= box.left && hint.x <= box.right && hint.y >= box.top && hint.y <= box.bottom).map(hint => hint.text).join(' ').toLowerCase()
  const patterns: Partial<Record<Preset, RegExp>> = {
    aadhaar: /aadhaar|uidai|आधार/, masked: /aadhaar|uidai|आधार/, pan: /income tax|permanent account|आयकर|pan/, epic: /election|elector|epic|निर्वाचन/, licence: /driving|licen[cs]e|transport|वाहन/, apaar: /apaar|academic|student|education|विद्यार्थी/, abha: /abha|health|आयुष्मान/, shram: /shram|uan|labour|श्रम/,
  }
  const contextual = Boolean(patterns[preset]?.test(text))
  const lower = (preset === 'aadhaar' || preset === 'masked') && box.top > .45 ? .06 : 0
  return (contextual ? .08 : 0) + lower
}
