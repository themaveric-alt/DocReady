import { IS_DESKTOP } from './lib/environment'
import { DesktopCTA } from './components/DesktopCTA'
import { watchLaunchPdf } from './lib/desktop'
import { lazy, Suspense, useEffect, useState } from 'react'
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Globe2,
  House,
  LayoutGrid,
  LockKeyhole,
  Menu,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  WifiOff,
  X,
} from 'lucide-react'
import {
  advancedTools,
  categories,
  categoryIcons,
  faq,
  matchTools,
  toolPath,
  tools,
  type Category,
} from './catalog'
import LandingHeader from './components/LandingHeader'
import {
  Button,
  Dropzone,
  EmptyState,
  IconButton,
  LoadingSkeleton,
  Modal,
} from './components/shared'
import { Brand, SiteFooter } from './components/Brand'
import { HomeHero } from './components/HomeHero'
import ToolJourney from './components/ToolJourney'
import PdfWorkstation from './components/PdfWorkstation'
import { queueVaultFile, useVault } from './features/vault/session'
import './features/vault/vault.css'
import './styles/layout-3stage.css'
import './lib/vault-bridge'
import { fileKind, images, PDF } from './lib/files'
import { readLocal, usePrefs, writeLocal } from './lib/prefs'
const PDFTool = lazy(() => import('./features/PDFTool'))
const OfficePdfTool = lazy(() => import('./features/pdf-suite/OfficePdfTool'))
const PdfExtraTool = lazy(() => import('./features/pdf-suite/PdfExtraTool'))
const PDFProtect = lazy(() => import('./features/pdf-suite/PDFProtect'))
const PDFSign = lazy(() => import('./features/pdf-suite/PDFSign'))
const BackgroundRemoval = lazy(() => import('./features/BackgroundRemoval'))
const PDFUnlock = lazy(() => import('./features/PDFUnlock'))
const ImageTool = lazy(() => import('./features/ImageTool'))
const SignatureDraw = lazy(() => import('./features/SignatureDraw'))
const Application = lazy(() => import('./features/Application'))
const ECardStudio = lazy(() => import('./features/e-card-studio/ECardStudio'))
const Scanner = lazy(() => import('./features/Scanner'))
const VaultPage = lazy(() => import('./features/vault/VaultPage'))
const VaultSaveDialog = lazy(() => import('./features/vault/SaveDialog'))
const OCR = lazy(() => import('./features/OCR'))
const TranslationWorkspace = lazy(
  () => import('./features/translation/components/TranslationWorkspace'),
)
const Resume = lazy(() => import('./features/Resume'))
const FileTools = lazy(() => import('./features/FileTools'))
const Settings = lazy(() => import('./features/Settings'))
const PrintDesk = lazy(() => import('./features/advanced/PrintDesk'))
const DocumentDoctor = lazy(
  () => import('./features/advanced/DocumentDoctor'),
)
const SmartPack = lazy(() => import('./features/advanced/SmartPack'))
const WorkflowStudio = lazy(
  () => import('./features/advanced/WorkflowStudio'),
)
const BilingualComposer = lazy(
  () => import('./features/advanced/BilingualComposer'),
)
const FormAssistant = lazy(() => import('./features/advanced/FormAssistant'))

const entries = Object.entries(categories) as [
  Category,
  (typeof categories)[Category],
][]

const DesktopDownload = lazy(() => import('./features/DesktopDownload'))
const PDFReader = lazy(() => import('./features/PDFReader'))

function PrivacyPill() {
  return (
    <Link className="privacy-pill" to="/privacy">
      <ShieldCheck size={16} /> <span>Processed on your device</span>
    </Link>
  )
}
function ToolCard({ tool }: { tool: (typeof tools)[number] }) {
  const Icon = tool.icon
  return (
    <Link
      className="tool-card"
      data-accent={categories[tool.category][2]}
      to={toolPath(tool.id)}
    >
      <div className="tool-top">
        <span className="tool-icon">
          <Icon size={22} />
        </span>
        <ArrowUpRight className="tool-arrow" size={17} />
      </div>
      {tool.tier && (
        <span className={'tool-tier ' + tool.tier}>
          {tool.tier === 'premium' ? 'Premium' : 'Free'}
        </span>
      )}
      <strong>{tool.title}</strong>
      <p>{tool.desc}</p>
    </Link>
  )
}
function CategoryCard({ id }: { id: Category }) {
  const Icon = categoryIcons[id]
  return (
    <Link
      to={'/workspace/' + id}
      className="category-card"
      data-accent={categories[id][2]}
    >
      <span className="tool-icon">
        <Icon size={22} />
      </span>
      <span>
        <strong>{categories[id][0]}</strong>
        <small>{categories[id][1]}</small>
      </span>
      <ChevronRight size={17} />
    </Link>
  )
}
function Language() {
  return (
    <label className="language">
      <Globe2 size={16} />
      <select aria-label="Interface language" defaultValue="en">
        <option value="en">English</option>
      </select>
    </label>
  )
}
function Landing({ choose }: { choose: (file: File) => void }) {
  const quick = [
    ['merge-pdf', 'Merge PDF'], ['compress-pdf', 'Compress PDF'],
    ['remove-background', 'AI Background Remover'], ['e-card-cutter', 'AI E-Card Cutter'],
    ['e-card-cutter', 'Multiple ID Print'], ['ocr', 'Offline OCR'],
  ]
  return <>
    <LandingHeader />
    <main id="main-content" className="matte-home">
      <HomeHero />
      <section className="wrap section-block daily-section" id="popular" aria-labelledby="daily-title">
        <div className="section-head"><div><div className="eyebrow">YOUR EVERYDAY SHORTCUTS</div><h2 id="daily-title">Less searching. More doing.</h2></div><Link className="text-link" to="/workspace/all">All tools</Link></div>
        <div className="daily-strip">{quick.map(([id, label]) => {
          const tool = tools.find(t => t.id === id)
          if (!tool) return null
          const Icon = tool.icon
          return <Link className="daily-tool" key={label} to={toolPath(id)} data-accent={categories[tool.category][2]}><span className="tool-icon"><Icon size={21} /></span><strong>{label}</strong></Link>
        })}</div>
      </section>
      <PdfWorkstation />
      <section className="wrap section-block more-workspaces">
        <details><summary>Explore more document workspaces <ChevronDown size={18} /></summary>
          <div className="category-grid">{entries.map(([id]) => <CategoryCard key={id} id={id} />)}</div>
          <div className="hero-tool-deck">{advancedTools.map(item => { const Icon = item.icon; return <Link key={item.id} to={toolPath(item.id)} className="hero-feature-tile" data-accent={item.accent}><span className="tool-icon"><Icon size={22} /></span><strong>{item.title}</strong><span>{item.short}</span></Link> })}</div>
          <Dropzone compact accept={[PDF, ...images]} label="Drop a file to get started" description="PDF, JPG, PNG or WebP · Up to 80 MB" onFiles={files => choose(files[0])} />
        </details>
      </section>
      <section className="wrap section-block desktop-trust" id="desktop-download" aria-labelledby="desktop-title">
        <div className="desktop-banner">
          <span className="tool-icon" data-accent="indigo"><LayoutGrid size={24} /></span>
          <div><div className="eyebrow">YOUR WORKSPACE, CLOSE AT HAND</div><h2 id="desktop-title">At home on your desktop.</h2><p>Prepare documents on Windows, macOS and Linux with the desktop workspace.</p><small>Check installer availability and release details. Web utilities work offline after their assets are cached.</small></div>
          <DesktopCTA />
        </div>
        <div className="trust-bottom"><div><ShieldCheck size={24} /><h3>Your documents stay yours.</h3><p>Local processing. Encrypted storage when you choose it. No document uploads.</p><Link to="/privacy" className="text-link">Read our privacy approach</Link></div>
          <div className="home-faq">{faq.map(([q,a]) => <details key={q}><summary>{q}<ChevronDown size={16} /></summary><p>{a}</p></details>)}</div>
        </div>
      </section>
    </main><SiteFooter landing />
  </>
}
function NavItems({ onClick }: { onClick?: () => void }) {
  return (
    <>
      <NavLink to="/workspace" end onClick={onClick}>
        <House size={19} /> Overview
      </NavLink>
      <NavLink to="/workspace/all" onClick={onClick}>
        <LayoutGrid size={19} /> All Tools
      </NavLink>
      {entries.map(([id, value]) => {
        const Icon = categoryIcons[id]
        if (id === 'translation')
          return (
            <div key={id}>
              <NavLink to="/workspace/translation" onClick={onClick}>
                <Icon size={19} />
                {value[0]}
              </NavLink>
              <div className="translation-subnav">
                {tools
                  .filter((tool) => tool.category === id)
                  .map((tool) => (
                    <NavLink
                      key={tool.id}
                      to={toolPath(tool.id)}
                      onClick={onClick}
                    >
                      {tool.title}
                    </NavLink>
                  ))}
              </div>
            </div>
          )
        return (
          <NavLink
            key={id}
            to={
              id === 'application'
                ? '/application-ready'
                : id === 'resume'
                  ? '/tools/resume'
                  : id === 'card'
                    ? '/tools/e-card-cutter'
                    : id === 'files'
                      ? '/tools/organize'
                      : '/workspace/' + id
            }
            onClick={onClick}
          >
            <Icon size={19} />
            {value[0]}
          </NavLink>
        )
      })}
      <NavLink to="/tools/encrypted-vault" onClick={onClick}>
        <LockKeyhole size={19} /> Encrypted Vault
      </NavLink>
      {IS_DESKTOP && <NavLink to="/pdf-reader" onClick={onClick}>PDF Reader / Editor</NavLink>}
      <NavLink to="/settings" onClick={onClick}>
        <Settings2 size={19} /> Settings
      </NavLink>
    </>
  )
}
function Shell({
  children,
  title,
  search,
}: {
  children: React.ReactNode
  title: string
  search: () => void
}) {
  const [nav, setNav] = useState(false)
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Workspace navigation">
          <NavItems />
        </nav>
        <div className="sidebar-foot">
          <PrivacyPill />
        </div>
      </aside>
      <div className="shell-body">
        <header className="topbar">
          <div className="top-start">
            <div className="mobile-toggle">
              <IconButton
                label="Open workspace navigation"
                onClick={() => setNav(true)}
              >
                <Menu size={22} />
              </IconButton>
            </div>
            <div className="mobile-brand">
              <Brand />
            </div>
            <div className="top-context">
              <Link to="/workspace">Workspace</Link>
              <ChevronRight size={15} />
              <strong>{title}</strong>
            </div>
          </div>
          <div className="top-actions">
            <button
              className="top-search"
              aria-label="Search tools Ctrl K"
              aria-keyshortcuts="Control+K Meta+K"
              onClick={search}
            >
              <Search size={17} />
              <span>
                Search tools <kbd>Ctrl K</kbd>
              </span>
            </button>
            <Language />
            <Link
              className="icon-button"
              to="/settings"
              aria-label="Settings"
              title="Settings"
            >
              <Settings2 size={19} />
            </Link>
          </div>
        </header>
        <main id="main-content" className="workspace-content">
          {children}
        </main>
        <SiteFooter />
      </div>
      {nav && (
        <Modal
          title="Workspace navigation"
          branded
          className="workspace-menu"
          onClose={() => setNav(false)}
        >
          <nav
            className="mobile-nav"
            aria-label="Mobile workspace navigation"
          >
            <NavItems onClick={() => setNav(false)} />
          </nav>
        </Modal>
      )}
    </div>
  )
}
function Dashboard() {
  const { category } = useParams(),
    [query, setQuery] = useState('')
  const id = category as Category
  const cat = Object.hasOwn(categories, id) ? categories[id] : undefined
  const list =
    category === 'all'
      ? matchTools(query)
      : tools.filter((t) => t.category === id)
  if (category && category !== 'all' && !cat)
    return <Navigate to="/workspace/all" replace />
  return (
    <>
      <div className="workspace-banner">
        <div className="eyebrow">
          <Sparkles size={15} /> DOCREADY WORKSPACE
        </div>
        <h1>
          {id === 'translation'
            ? 'Translate Documents & Images Beautifully'
            : cat?.[0] ||
              (category
                ? 'All Tools'
                : 'What would you like to prepare today?')}
        </h1>
        <p>
          {cat?.[1] ||
            (category
              ? 'Find a tool and prepare your files in your browser.'
              : 'Everything you need to get your files ready.')}
        </p>
        <PrivacyPill />
      </div>
      {category ? (
        <>
          <div className="section-head workspace-section">
            <h2>{cat ? 'Available tools' : 'Browse tools'}</h2>
            {category === 'all' && (
              <label className="search-input">
                <Search size={18} />
                <input
                  aria-label="Filter tools"
                  placeholder="Filter tools…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            )}
          </div>
          {!list.length && (
            <EmptyState>No tools match your search.</EmptyState>
          )}
          <div
            className={
              'tool-grid workspace-grid' +
              (id === 'translation' ? ' translation-cards' : '')
            }
          >
            {list.map((t) => (
              <ToolCard tool={t} key={t.id} />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="section-head workspace-section">
            <h2>Quick actions</h2>
            <Link to="/workspace/all" className="text-link">
              View all tools <ArrowRight size={16} />
            </Link>
          </div>
          <div className="tool-grid workspace-grid">
            {tools.slice(0, 6).map((t) => (
              <ToolCard tool={t} key={t.id} />
            ))}
          </div>
          <div className="section-head workspace-section">
            <h2>Tool categories</h2>
          </div>
          <div className="category-grid">
            {entries.map(([id]) => (
              <CategoryCard key={id} id={id} />
            ))}
          </div>
        </>
      )}
    </>
  )
}
function Privacy() {
  return (
    <>
      <div className="tool-heading">
        <PrivacyPill />
        <h1>How your files are handled</h1>
        <p>
          Document processing happens in your browser. The website serves the
          app, fonts, workers and language models. It does not receive your
          uploaded files.
        </p>
      </div>
      <div className="panel privacy-copy">
        <h2>Browser storage</h2>
        <p>
          Open files and results stay in memory while you work. Settings,
          recent tools when enabled, requirement templates and resume drafts
          are stored on this browser only. The offline cache stores
          application assets and may store language models. Downloads remain
          wherever you save them.
        </p>
        <p>
          Files explicitly saved to the Encrypted Vault, including their
          filenames, tags and extracted text, are stored as encrypted records
          in this browser. Clearing browser site data removes those records.
        </p>
        <h2>Device access</h2>
        <p>
          Anyone with access to this browser profile may be able to access
          saved data. Local processing reduces file exposure. Browser
          extensions, other software and downloaded files still depend on your
          device’s security.
        </p>
        <Link className="btn btn-secondary" to="/settings">
          Manage local data <ArrowRight size={17} />
        </Link>
      </div>
    </>
  )
}
function ToolPage({ fixed, initial }: { fixed?: string; initial?: File }) {
  const [revision, setRevision] = useState(0)
  const { id } = useParams()
  const tool = tools.find((t) => t.id === (fixed ?? id))
  const recent = usePrefs((s) => s.prefs.recent)
  useEffect(() => {
    if (!tool || !recent) return
    try {
      writeLocal(
        'recent',
        [
          tool.id,
          ...readLocal<string[]>('recent', []).filter((x) => x !== tool.id),
        ].slice(0, 5),
      )
    } catch {
      /* history is optional */
    }
  }, [tool, recent])
  if (!tool) return <Navigate to="/workspace/all" replace />
  const Icon = tool.icon
  const common = { id: tool.id, initial: revision ? undefined : initial }
  let body: React.ReactNode
  if (tool.id === 'printdesk') body = <PrintDesk />
  else if (tool.id === 'document-doctor') body = <DocumentDoctor />
  else if (tool.id === 'smart-application-pack') body = <SmartPack />
  else if (tool.id === 'workflow-automation') body = <WorkflowStudio />
  else if (tool.id === 'bilingual-composer') body = <BilingualComposer />
  else if (tool.id === 'smart-form-assistant') body = <FormAssistant />
  else if (tool.id === 'encrypted-vault') body = <VaultPage />
  else if (tool.id === 'unlock-pdf') body = <PDFUnlock />
  else if (tool.id === 'protect-pdf') body = <PDFProtect />
  else if (tool.id === 'sign-pdf') body = <PDFSign />
  else if (
    ['word-to-pdf', 'powerpoint-to-pdf', 'excel-to-pdf', 'html-to-pdf'].includes(
      tool.id,
    )
  )
    body = <OfficePdfTool id={tool.id} />
  else if (
    [
      'repair-pdf',
      'crop-pdf',
      'redact-pdf',
      'compare-pdf',
      'pdf-to-word',
      'pdf-to-powerpoint',
      'pdf-to-excel',
      'ai-summarizer',
      'pdf-to-markdown',
    ].includes(tool.id)
  )
    body = <PdfExtraTool id={tool.id} />
  else if (tool.id === 'pdf-forms') body = <FormAssistant />
  else if (tool.id === 'scan-to-pdf') body = <Scanner />
  else if (tool.id === 'ocr-pdf') body = <OCR initial={common.initial} />
  else if (tool.category === 'pdf') body = <PDFTool {...common} />
  else if (tool.id === 'remove-background') body = <BackgroundRemoval />
  else if (tool.id === 'draw-signature') body = <SignatureDraw />
  else if (
    tool.category === 'image' ||
    tool.category === 'signature' ||
    tool.id === 'strip-metadata'
  )
    body = <ImageTool {...common} />
  else if (tool.id === 'application-ready') body = <Application />
  else if (tool.id === 'e-card-cutter') body = <ECardStudio />
  else if (tool.id === 'scan-document') body = <Scanner />
  else if (tool.id === 'ocr') body = <OCR initial={common.initial} />
  else if (tool.category === 'translation')
    body = (
      <TranslationWorkspace
        kind={tool.id === 'pdf-translator' ? 'pdf' : 'image'}
      />
    )
  else if (tool.id === 'resume') body = <Resume />
  else body = <FileTools id={tool.id} />
  return (
    <>
      <div
        className="tool-heading"
        data-accent={categories[tool.category][2]}
      >
        <Link to={'/workspace/' + tool.category} className="text-link">
          {categories[tool.category][0]} <ChevronRight size={14} />
        </Link>
        <div className="tool-title">
          <span className="tool-icon">
            <Icon size={25} />
          </span>
          <h1>{tool.title}</h1>
        </div>
        <p>{tool.desc}</p>
      </div>
      <ToolJourney key={tool.id + revision} startOver={() => setRevision(value => value + 1)} entry={!['resume', 'draw-signature', 'encrypted-vault', 'application-ready', 'printdesk', 'bilingual-composer', 'workflow-automation', 'html-to-pdf'].includes(tool.id)}>
        <Suspense fallback={<LoadingSkeleton />}>{body}</Suspense>
      </ToolJourney>
    </>
  )
}
function Palette({ close }: { close: () => void }) {
  const [query, set] = useState(''),
    [active, select] = useState(0),
    navigate = useNavigate(),
    recent = usePrefs((s) => s.prefs.recent)
  const matches = matchTools(query),
    history = recent && !query ? readLocal<string[]>('recent', []) : []
  const list = history.length
    ? [
        ...history.flatMap((id) => matches.filter((t) => t.id === id)),
        ...matches.filter((t) => !history.includes(t.id)),
      ]
    : matches
  function go(id: string) {
    navigate(toolPath(id))
    close()
  }
  return (
    <Modal title="Search tools" onClose={close}>
      <div
        onKeyDown={(e) => {
          if (
            e.target instanceof HTMLInputElement &&
            e.key === 'Enter' &&
            list[active]
          ) {
            e.preventDefault()
            go(list[active].id)
          }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            const next = Math.max(
              0,
              Math.min(
                list.length - 1,
                active + (e.key === 'ArrowDown' ? 1 : -1),
              ),
            )
            select(next)
            document
              .getElementById('command-' + next)
              ?.scrollIntoView({ block: 'nearest' })
          }
        }}
      >
        <label className="search-input">
          <Search size={18} />
          <input
            autoFocus
            value={query}
            aria-label="Search commands"
            placeholder="Try resize photo, merge PDF, OCR…"
            onChange={(e) => {
              set(e.target.value)
              select(0)
            }}
          />
        </label>
        <ul className="commands">
          {list.map((tool, i) => (
            <li key={tool.id}>
              <button
                id={'command-' + i}
                type="button"
                className={active === i ? 'active' : ''}
                onClick={() => go(tool.id)}
              >
                <tool.icon size={18} />
                <span>{tool.title}</span>
                {history.includes(tool.id) && <small>Recent</small>}
                <ArrowRight size={15} />
              </button>
            </li>
          ))}
        </ul>
        {!list.length && <EmptyState>No matching tools.</EmptyState>}
      </div>
    </Modal>
  )
}
function VaultOverlay() {
  const pending = useVault((state) => state.pending)
  const notice = useVault((state) => state.notice)
  return (
    <>
      {pending && <Suspense fallback={null}><VaultSaveDialog output={pending} /></Suspense>}
      {notice && (
        <div className="vault-toast">
          <span role="status">{notice}</span>
          <Link to="/tools/encrypted-vault" onClick={() => queueVaultFile(null)}>Open vault</Link>
          <IconButton label="Dismiss vault notification" onClick={() => queueVaultFile(null)}><X size={18} /></IconButton>
        </div>
      )}
    </>
  )
}

export default function App() {
  const location = useLocation(),
    navigate = useNavigate(),
    [palette, setPalette] = useState(false),
    [starter, setStarter] = useState<File>(),
    [offline, setOffline] = useState(
      () =>
        !navigator.onLine ||
        document.documentElement.hasAttribute('data-offline-navigation'),
    ),
    [update, setUpdate] = useState<ServiceWorker>()
  const [launchFile, setLaunchFile] = useState<File>()
  const [launchError, setLaunchError] = useState('')
  useEffect(() => {
    let disposed = false
    let stop: (() => void) | undefined
    void watchLaunchPdf(file => { if (!disposed) { setLaunchFile(file); navigate('/pdf-reader') } }, setLaunchError).then(value => { if (disposed) value(); else stop = value })
    return () => { disposed = true; stop?.() }
  }, [navigate])
  const prefs = usePrefs((s) => s.prefs),
    path = location.pathname.replace(/\/+$/, '') || '/'
  const segments = path.split('/'),
    current = tools.find((t) => toolPath(t.id) === path),
    isLanding = path === '/'
  const title =
    current?.title ||
    (path === '/desktop-download' ? 'Desktop Software' : path === '/pdf-reader' ? 'PDF Reader & Editor' : path === '/settings'
      ? 'Settings'
      : path === '/privacy'
        ? 'Privacy'
        : categories[segments[2] as Category]?.[0] ||
          (segments[2] === 'all' ? 'All Tools' : 'Overview'))
  useEffect(() => {
    document.title = isLanding
      ? 'DocReadyApp — Your Complete Document Workspace'
      : title + ' | DocReadyApp'
    document.documentElement.dataset.motion = prefs.motion
    document.documentElement.dataset.theme = prefs.theme
  }, [title, isLanding, prefs])
  useEffect(() => {
    window.scrollTo(0, 0)
    setPalette(false)
    const meta = document.querySelector('meta[name="description"]')
    meta?.setAttribute(
      'content',
      current
        ? current.desc + ' Process files on your device with DocReadyApp.'
        : 'Resize, convert, organize, scan, and prepare your documents in a private browser workspace.',
    )
    let canonical = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    )
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.rel = 'canonical'
      document.head.append(canonical)
    }
    canonical.href =
      (import.meta.env.VITE_PUBLIC_ORIGIN?.replace(/\/$/, '') ||
        locationOrigin()) + path
  }, [path, current])
  useEffect(() => {
    if (path !== '/tools/resize-image' && path !== '/tools/preview-pdf')
      setStarter(undefined)
  }, [path])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((open) => !open)
      }
    }
    const status = () => setOffline(!navigator.onLine)
    window.addEventListener('keydown', key)
    window.addEventListener('online', status)
    window.addEventListener('offline', status)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('online', status)
      window.removeEventListener('offline', status)
    }
  }, [])
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
    let subscribed = true
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        if (subscribed && reg.waiting) setUpdate(reg.waiting)
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing
          worker?.addEventListener('statechange', () => {
            if (
              subscribed &&
              worker.state === 'installed' &&
              navigator.serviceWorker.controller
            )
              setUpdate(worker)
          })
        })
      })
      .catch(() => {})
    return () => {
      subscribed = false
    }
  }, [])
  async function choose(file: File) {
    const mime = await fileKind(file)
    setStarter(file)
    navigate(toolPath(mime === PDF ? 'preview-pdf' : 'resize-image'))
  }
  return (
    <MotionConfig
      reducedMotion={prefs.motion === 'reduced' ? 'always' : 'user'}
    >
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      {launchError && <div role="alert">{launchError}</div>}
      {offline && (
        <div className="site-status" role="status">
          <WifiOff size={15} /> Offline · Cached tools are available
        </div>
      )}
      {update && (
        <div className="site-status" role="status">
          An app update is ready.{' '}
          <Button
            variant="quiet"
            onClick={() => {
              navigator.serviceWorker.addEventListener(
                'controllerchange',
                () => window.location.reload(),
                { once: true },
              )
              update.postMessage({ type: 'SKIP_WAITING' })
            }}
          >
            Reload to update
          </Button>
        </div>
      )}
      {isLanding ? (
        <Landing choose={(f) => void choose(f)} />
      ) : (
        <Shell title={title} search={() => setPalette(true)}>
          <Routes>
            <Route path="/pdf-reader" element={IS_DESKTOP ? <Suspense fallback={<LoadingSkeleton />}><PDFReader key={launchFile?.lastModified} initial={launchFile} /></Suspense> : <Navigate to="/desktop-download" replace />} />
            <Route path="/desktop-download" element={<Suspense fallback={<LoadingSkeleton />}><DesktopDownload /></Suspense>} />
            <Route path="/workspace" element={<Dashboard key="home" />} />
            <Route
              path="/workspace/:category"
              element={<Dashboard key={path} />}
            />
            <Route
              path="/tools/:id"
              element={
                <ToolPage
                  key={path}
                  initial={
                    path === '/tools/resize-image' ||
                    path === '/tools/preview-pdf'
                      ? starter
                      : undefined
                  }
                />
              }
            />
            <Route
              path="/application-ready"
              element={<ToolPage fixed="application-ready" key={path} />}
            />
            <Route
              path="/printdesk"
              element={<ToolPage fixed="printdesk" key={path} />}
            />
            <Route path="/privacy" element={<Privacy />} />
            <Route
              path="/settings"
              element={
                <Suspense fallback={<LoadingSkeleton />}>
                  <Settings />
                </Suspense>
              }
            />
            <Route path="*" element={<Navigate to="/workspace" replace />} />
          </Routes>
        </Shell>
      )}
      {palette && <Palette close={() => setPalette(false)} />}
      <VaultOverlay />
    </MotionConfig>
  )
}
const locationOrigin = () => window.location.origin
