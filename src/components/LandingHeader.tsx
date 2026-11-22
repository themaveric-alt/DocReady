import { DesktopCTA } from './DesktopCTA'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown, Globe2, Menu } from 'lucide-react'
import { Brand } from './Brand'
import { IconButton, Modal } from './shared'
import { SuiteIcon } from './PdfWorkstation'
import { tools, toolPath } from '../catalog'
import { pdfSuiteCategories } from '../tools-config'
import './landing-header.css'

const imageIds = ['remove-background', 'scan-document', 'compress-image', 'e-card-cutter']
function LanguageSwitch() {
  return <label className="dr-language"><Globe2 size={16} /><select aria-label="Interface language" defaultValue="en"><option value="en">English</option></select><ChevronDown size={13} aria-hidden="true" /></label>
}
function PdfGroups({ close, mobile = false }: { close: () => void; mobile?: boolean }) {
  return <>{pdfSuiteCategories.map(group => {
    const links = group.tools.map(id => {
      const tool = tools.find(item => item.id === id)!
      return <Link key={id} to={toolPath(id)} onClick={close}><SuiteIcon category={group.id} icon={tool.icon} /><span>{tool.title}</span></Link>
    })
    return mobile ? <details className="dr-category-accordion" key={group.id}><summary><SuiteIcon category={group.id} />{group.label}<ChevronDown size={14} /></summary><div>{links}</div></details>
      : <section key={group.id}><h3><SuiteIcon category={group.id} />{group.label}</h3>{links}</section>
  })}</>
}
function ImageLinks({ close }: { close: () => void }) {
  return <>{imageIds.map(id => {
    const tool = tools.find(item => item.id === id)!
    return <Link key={id} to={toolPath(id)} onClick={close}><SuiteIcon category="edit-pdf" icon={tool.icon} /><span>{id === 'e-card-cutter' ? 'Multiple ID Cards Print' : tool.title}</span></Link>
  })}</>
}
export default function LandingHeader() {
  const [drawer, setDrawer] = useState(false)
  const [active, setActive] = useState<'pdf' | 'image' | null>(null)
  const [hover, setHover] = useState<'pdf' | 'image' | null>(null)
  const root = useRef<HTMLElement>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(hoverTimer.current), [])
  const pdfButton = useRef<HTMLButtonElement>(null), imageButton = useRef<HTMLButtonElement>(null)
  const location = useLocation()
  const close = () => { setActive(null); setHover(null); setDrawer(false) }
  useEffect(close, [location.pathname])
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) { setActive(null); setHover(null) } }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (active || hover)) {
        const button = (active || hover) === 'pdf' ? pdfButton : imageButton
        setActive(null); setHover(null); button.current?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [active, hover])
  useEffect(() => {
    const media = matchMedia('(min-width: 1025px)')
    const changed = () => { setActive(null); setHover(null); if (media.matches) setDrawer(false) }
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [])
  function enter(value: 'pdf' | 'image') { clearTimeout(hoverTimer.current); if (matchMedia('(hover: hover) and (pointer: fine)').matches) { setActive(old => old && old !== value ? null : old); setHover(value) } }
  function toggle(value: 'pdf' | 'image') { clearTimeout(hoverTimer.current); setHover(null); setActive(old => old === value ? null : value) }
  function leave() { clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setHover(null), 200) }
  return <header ref={root} className="site-head dr-header">
    <div className="wrap dr-bar"><Brand />
      <nav className="dr-desktop" aria-label="Main navigation" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) { setActive(null); setHover(null) } }}>
        <Link to="/workspace/all">All Tools</Link>
        <div className="dr-dropdown" onMouseEnter={() => enter('pdf')} onMouseLeave={leave}>
          <button ref={pdfButton} className="dr-nav-trigger" aria-expanded={active === 'pdf' || hover === 'pdf'} aria-controls="header-pdf-tools" onClick={() => toggle('pdf')} onKeyDown={event => { if(event.key === 'ArrowDown') { event.preventDefault(); setHover(null); setActive('pdf'); requestAnimationFrame(() => root.current?.querySelector<HTMLAnchorElement>('#header-pdf-tools a')?.focus()) } }}>PDF Tools <ChevronDown size={14} /></button>
          {(active === 'pdf' || hover === 'pdf') && <div className="dr-mega dr-pdf-menu" id="header-pdf-tools"><PdfGroups close={close} /></div>}
        </div>
        <div className="dr-dropdown" onMouseEnter={() => enter('image')} onMouseLeave={leave}>
          <button ref={imageButton} className="dr-nav-trigger" aria-expanded={active === 'image' || hover === 'image'} aria-controls="header-image-tools" onClick={() => toggle('image')}>Image &amp; Scan <ChevronDown size={14} /></button>
          {(active === 'image' || hover === 'image') && <div className="dr-mega dr-image-menu" id="header-image-tools"><ImageLinks close={close} /></div>}
        </div>
        <Link to="/tools/encrypted-vault">Encrypted Vault</Link><Link to="/privacy">Privacy</Link>
      </nav>
      <div className="dr-actions"><div className="dr-desktop-language"><LanguageSwitch /></div><DesktopCTA className="btn btn-primary dr-workspace" /><div className="dr-mobile-toggle"><IconButton label="Open menu" aria-expanded={drawer} aria-controls="mobile-site-navigation" onClick={() => setDrawer(true)}><Menu size={22} /></IconButton></div></div>
    </div>
    {drawer && <Modal title="Menu" branded className="dr-drawer" onClose={close}><nav id="mobile-site-navigation" className="dr-mobile-nav" aria-label="Mobile site navigation"><Link to="/workspace/all" onClick={close}>All Tools</Link><details><summary>PDF Tools <ChevronDown size={16} /></summary><div className="dr-mobile-pdf"><PdfGroups close={close} mobile /></div></details><details><summary>Image &amp; Scan <ChevronDown size={16} /></summary><div className="dr-mobile-images"><ImageLinks close={close} /></div></details><Link to="/tools/encrypted-vault" onClick={close}>Encrypted Vault</Link><Link to="/privacy" onClick={close}>Privacy</Link><Link className="btn btn-primary" to="/workspace" onClick={close}>Open Workspace</Link><DesktopCTA /><LanguageSwitch /></nav></Modal>}
  </header>
}
