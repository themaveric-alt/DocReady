import { useId, type CSSProperties } from 'react'
import { govtCards, type GovtCardId } from './cardProfiles'
import './card-selector.css'
function Emblem({ glyph, color, second }: { glyph: string; color: string; second: string }) {
  const id = useId()
  const paths: Record<string, string> = {
    identity: 'M16 33h24M22 17a6 6 0 1 0 12 0 6 6 0 1 0-12 0M17 33c0-11 22-11 22 0',
    document: 'M19 12h13l7 7v25H19zM32 12v9h7M24 28h10m-10 6h10',
    vote: 'M20 30v12h20V30M17 30h26M22 21l9-7 9 12-9 7zM28 22l3 3 4-4',
    wheel: 'M28 13a15 15 0 1 0 0 30 15 15 0 1 0 0-30M14 25h28M28 28v14M24 26a4 4 0 1 0 8 0 4 4 0 1 0-8 0',
    education: 'm10 23 18-9 18 9-18 9-18-9M17 28v10q11 9 22 0V28M45 23v14',
    health: 'M23 14h10v9h9v10h-9v9H23v-9h-9V23h9z',
    work: 'M13 23h30v20H13zM22 23v-8h12v8M13 31h30M25 29v6h6v-6',
  }
  return <svg viewBox="0 0 56 56" aria-hidden="true"><defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop stopColor={color} /><stop offset="1" stopColor={second} /></linearGradient></defs><rect x="2" y="2" width="52" height="52" rx="16" fill={`url(#${id})`} opacity=".12" /><path d={paths[glyph]} stroke={`url(#${id})`} fill="none" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" /><circle cx="45" cy="11" r="3" fill={second} opacity=".7" /></svg>
}
export default function CardTypeSelector({ selected, select, disabled }: { selected: GovtCardId | null; select: (id: GovtCardId) => void; disabled?: boolean }) {
  return <section className="govt-selector panel" aria-labelledby="govt-selector-title"><div className="govt-selector-heading"><span>01 · CHOOSE YOUR DOCUMENT</span><h2 id="govt-selector-title">Which e-card are we preparing?</h2><p>Select the document type, then open your PDF. Custom symbols below identify presets; they are not official government emblems.</p></div><div className="govt-selector-grid" role="group" aria-label="Government e-card type">{govtCards.map(card => <button type="button" key={card.id} disabled={disabled} aria-pressed={selected === card.id} className="govt-type" style={{ '--card-accent': card.color } as CSSProperties} onClick={() => select(card.id)}><Emblem {...card} /><span><strong>{card.name}</strong><small>{card.description}</small></span><span className="govt-type-check" aria-hidden="true">{selected === card.id ? '✓' : ''}</span></button>)}</div></section>
}
