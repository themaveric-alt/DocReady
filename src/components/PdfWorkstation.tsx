import { useId, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { tools, toolPath } from '../catalog'
import { pdfSuiteCategories, type PdfSuiteCategoryId } from '../tools-config'
import './pdf-workstation.css'

const themes: Record<PdfSuiteCategoryId, { color: string; end: string; mark: string }> = {
  'organize-pdf': { color: '#E11D48', end: '#dc4729', mark: 'M13 15h10M13 20h10M13 25h7M26 20l3 3-3 3' },
  'optimize-pdf': { color: '#059669', end: '#047857', mark: 'M13 13l6 6m-6-1v-5h5m9 14-6-6m1 6h5v-5' },
  'convert-to-pdf': { color: '#4F46E5', end: '#4f46e5', mark: 'M11 20h15m-5-5 5 5-5 5M29 13v14' },
  'convert-from-pdf': { color: '#D97706', end: '#b45309', mark: 'M29 20H14m5-5-5 5 5 5M11 13v14' },
  'edit-pdf': { color: '#7C3AED', end: '#6d28d9', mark: 'm14 24 10-10 4 4-10 10-6 1 2-5m8-8 4 4' },
  'pdf-security': { color: '#0284C7', end: '#0e7490', mark: 'M20 11l9 4v6c0 5-9 9-9 9s-9-4-9-9v-6l9-4m-4 9 3 3 6-6' },
  'pdf-intelligence': { color: '#BE185D', end: '#a21caf', mark: 'm20 10 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7M29 9v5m-2-2h5' },
}

export function SuiteIcon({ category, icon: Icon }: { category: PdfSuiteCategoryId; icon?: LucideIcon }) {
  const id = useId()
  const theme = themes[category]
  return <svg viewBox="0 0 40 40" className="suite-svg" aria-hidden="true" focusable="false">
    <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop stopColor={theme.color} /><stop offset="1" stopColor={theme.end} /></linearGradient></defs>
    <rect x="3" y="3" width="34" height="34" rx="10" fill={`url(#${id})`} opacity=".13" />
    <path d="M11 7h13l6 6v19H11z" fill={`url(#${id})`} opacity=".14" />
    {Icon ? <Icon x="10" y="10" width="20" height="20" stroke={`url(#${id})`} strokeWidth="2" /> : <path d={theme.mark} fill="none" stroke={`url(#${id})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
    <circle cx="32" cy="7" r="2" fill={theme.color} opacity=".8" />
  </svg>
}

export default function PdfWorkstation() {
  const filters = [
    { label: 'All', ids: pdfSuiteCategories.map(g => g.id) },
    { label: 'Organize & Optimize', ids: ['organize-pdf', 'optimize-pdf'] },
    { label: 'Convert', ids: ['convert-to-pdf', 'convert-from-pdf'] },
    { label: 'Edit & Security', ids: ['edit-pdf', 'pdf-security'] },
    { label: 'AI & Forms', ids: ['pdf-intelligence', 'edit-pdf'] },
  ]
  const [filter, setFilter] = useState(0)
  return <section className="wrap section-block pdf-workstation" aria-labelledby="pdf-workstation-title" id="pdf-workstation">
    <div className="suite-ambient" aria-hidden="true" />
    <div className="section-head suite-heading">
      <div><div className="suite-eyebrow"><SuiteIcon category="convert-to-pdf" /> LOCAL PDF WORKSTATION</div>
        <h2 id="pdf-workstation-title">Every PDF tool,<br className="suite-heading-break" /> clearly grouped.</h2>
        <p>Your files. Your device. A little less document chaos.<br />Every tool is free to use, including advanced capabilities.</p>
      </div>
      <Link className="suite-studio-link" to="/workspace/pdf">Open PDF Tools <span aria-hidden="true">→</span></Link>
    </div>
    <div className="suite-filters" role="group" aria-label="Filter PDF tool categories">{filters.map((item,i) => <button key={item.label} aria-pressed={filter === i} onClick={() => setFilter(i)} aria-controls="suite-results">{item.label}</button>)}</div>
    <p className="suite-filter-status" role="status">{filter === 0 ? 'All seven categories' : filters[filter].label} · All tools remain free to use</p>
    <div className="suite-category-grid" id="suite-results">
      {pdfSuiteCategories.filter(group => filters[filter].ids.includes(group.id)).map(group => <section key={group.id} className="suite-category" style={{ '--suite-accent': themes[group.id].color } as CSSProperties}>
        <header className="suite-category-header"><span className="suite-category-icon"><SuiteIcon category={group.id} /></span><div><h3>{group.label}</h3><p>{group.description}</p></div><span className="suite-count" aria-label={`${group.tools.length} tools`}>{group.tools.length}</span></header>
        <div className="suite-tool-grid">{group.tools.map(id => {
          const tool = tools.find(item => item.id === id)
          if (!tool) return null
          return <Link key={id} className="suite-tool-pill" to={toolPath(id)}>
            <span className="suite-tool-icon"><SuiteIcon category={group.id} icon={tool.icon} /></span>
            <span className="suite-tool-name">{tool.title}</span>
            <span className={`suite-tier ${tool.tier === 'premium' ? 'suite-tier-pro' : 'suite-tier-free'}`} aria-label={tool.tier === 'premium' ? 'Advanced capability, free to use' : 'Free to use'}>{tool.tier === 'premium' ? '✦ PRO' : 'FREE'}</span>
            <span className="suite-pill-arrow" aria-hidden="true">→</span>
          </Link>
        })}</div>
      </section>)}
    </div>
  </section>
}
