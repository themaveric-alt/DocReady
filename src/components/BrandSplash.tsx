import { useEffect, useState } from 'react'
import './brand-splash.css'

export const SPLASH_DURATION = 5000
export const SPLASH_FAILSAFE = 5500

export default function BrandSplash() {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    if (!visible) return
    const dismiss = () => setVisible(false)
    const timer = window.setTimeout(dismiss, SPLASH_DURATION)
    const failsafe = window.setTimeout(dismiss, SPLASH_FAILSAFE)
    window.addEventListener('docready-open-file', dismiss)
    const previous = document.body.style.overflow
    const surface = document.getElementById('app-surface')
    surface?.setAttribute('inert', '')
    const previousFocus = document.activeElement
    document.querySelector<HTMLButtonElement>('.brand-splash')?.focus({ preventScroll: true })
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('docready-open-file', dismiss)
      clearTimeout(timer)
      clearTimeout(failsafe)
      document.body.style.overflow = previous
      surface?.removeAttribute('inert')
      if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true })
    }
  }, [visible])
  if (!visible) return null
  return <button className="brand-splash" onClick={() => setVisible(false)} aria-label="DocReady introduction. Click to skip" onKeyDown={e => { if (e.key === 'Escape') setVisible(false); if(e.key === 'Tab') e.preventDefault() }}>
    <span className="splash-content">
      <span className="splash-logo">
        <svg viewBox="0 0 80 80" aria-hidden="true"><rect x="12" y="6" width="56" height="68" rx="16" fill="currentColor" opacity=".08" /><path className="splash-stroke" d="M26 56V23h20l10 10v23H26m20-33v11h10M32 44l7 7 13-14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength="1" /></svg>
        <span className="splash-wordmark">DocReady<span>App</span><small>by Trenish</small></span>
      </span>
      <span className="splash-slogan">100% On-Device Privacy <b>•</b> Zero Cloud Uploads <b>•</b> Military-Grade Vault</span>
      <span className="splash-credit"><span className="splash-divider" /><span className="splash-credit-text">Engineered by <strong>Trenish Chaturvedi</strong></span></span>
    </span>
    <span className="splash-skip">Click anywhere to skip</span>
  </button>
}
