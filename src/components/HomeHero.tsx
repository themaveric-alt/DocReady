import { DesktopCTA } from './DesktopCTA'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Database,
  FileText,
  Folder,
  GraduationCap,
  HardDrive,
  IdCard,
  Layers3,
  LockKeyhole,
  ScanLine,
  ShieldCheck,
} from 'lucide-react'
import './home-hero.css'

const example = [
  {
    name: 'Govt IDs',
    icon: IdCard,
    file: 'Identity document.pdf',
    detail: 'PDF · 2.4 MB',
    label: 'Identity',
  },
  {
    name: 'Education',
    icon: GraduationCap,
    file: 'Semester transcript.pdf',
    detail: 'PDF · 1.8 MB',
    label: 'College',
  },
  {
    name: 'Personal',
    icon: Folder,
    file: 'Travel checklist.txt',
    detail: 'TXT · 12 KB',
    label: 'Travel',
  },
]

export function HomeHero() {
  const [selection, setSelection] = useState(0)
  const sample = example[selection]
  return (
    <section className="home-hero" aria-labelledby="home-hero-title">
      <div className="wrap home-hero-inner">
        <div className="home-spotlight">
          <div className="home-intro">
            <div className="hero-kicker">
              <ShieldCheck size={15} /> Privacy-first document workstation
            </div>
            <h1 id="home-hero-title">
              Your documents,
              <br />
              <em>ready for anything.</em>
            </h1>
            <p>
              Keep sensitive files in an encrypted vault, scan paper into clean
              PDFs, and tackle everyday document work on your device.
            </p>
            <div className="hero-trust-line">100% Offline* · AES-256 Encrypted · Free Forever</div>
            <div className="home-hero-actions">
              <Link className="btn btn-primary" to="/tools/encrypted-vault">
                <LockKeyhole size={18} /> Open Encrypted Vault{' '}
                <ArrowRight size={17} />
              </Link>
              <DesktopCTA className="btn btn-secondary" />
            </div>
          </div>
          <div className="home-vault-frame">
            <div className="home-vault-preview">
              <div className="home-vault-heading">
                <span className="tool-icon" data-accent="violet">
                  <LockKeyhole size={23} />
                </span>
                <div>
                  <h2>Smart Vault</h2>
                  <p>Encrypted AI File Manager</p>
                </div>
                <span className="home-demo">Interactive preview</span>
              </div>
              <div className="home-vault-content">
                <div
                  className="home-preview-folders"
                  role="group"
                  aria-label="Example vault folders"
                >
                  {example.map(({ name, icon: Icon }, i) => (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={i === selection}
                      onClick={() => setSelection(i)}
                    >
                      <Icon size={16} aria-hidden="true" /> {name}
                    </button>
                  ))}
                </div>
                <div className="home-sample" aria-live="polite">
                  <span className="home-sample-label">Example file</span>
                  <div className="home-sample-file">
                    <span className="tool-icon" data-accent="violet">
                      <FileText size={21} />
                    </span>
                    <div>
                      <strong>{sample.file}</strong>
                      <span>{sample.detail}</span>
                    </div>
                  </div>
                  <span className="home-sample-tag">{sample.label}</span>
                </div>
              </div>
              <div className="home-vault-foot">
                <ShieldCheck size={16} /> Your files stay in this browser
              </div>
            </div>
          </div>
        </div>

        <div className="home-privacy-points">
          <span>
            <HardDrive size={17} /> 100% on-device processing
          </span>
          <span>
            <LockKeyhole size={16} /> AES-256-GCM encryption
          </span>
          <span>
            <ShieldCheck size={17} /> Zero cloud uploads
          </span>
          <span title="Unlimited vault files. Actual capacity depends on your browser quota and device space.">
            <Database size={17} /> Unlimited storage*
          </span>
        </div>

        <div className="home-flagships">
          <Link className="home-flagship home-flagship-vault" to="/tools/encrypted-vault">
            <span className="tool-icon" data-accent="violet"><LockKeyhole size={27} /></span>
            <div><h2>Encrypted AI Vault</h2><p>Keep files organized and encrypted in your browser. Your password. Your control.</p></div>
            <ArrowUpRight size={21} aria-hidden="true" />
          </Link>
          <Link
            className="home-flagship home-flagship-scanner"
            to="/tools/scan-document"
          >
            <span className="tool-icon" data-accent="teal">
              <ScanLine size={28} />
            </span>
            <div>
              <h2>Document Scanner</h2>
              <p>
                Detect page corners, straighten photos, and export crisp
                multi-page scans.
              </p>
            </div>
            <ArrowUpRight size={21} aria-hidden="true" />
          </Link>
          <Link
            className="home-flagship home-flagship-workspace"
            to="/workspace/advanced"
          >
            <span className="tool-icon" data-accent="indigo">
              <Layers3 size={27} />
            </span>
            <div>
              <h2>PDF & Image Workstation</h2>
              <p>
                Prepare, repair, and convert documents with PDF, OCR, and
                workflow tools.
              </p>
            </div>
            <ArrowUpRight size={21} aria-hidden="true" />
          </Link>
        </div>
        <p className="hero-offline-note">*Offline after required assets are cached. Optional models need an initial download. Vault capacity depends on device space and browser storage.</p>
      </div>
    </section>
  )
}
