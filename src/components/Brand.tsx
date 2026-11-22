import { Link } from 'react-router-dom'
import { creator, creatorByline, creditPrefix } from '../lib/branding'

function Wordmark() {
  return (
    <>
      <img src="/logo.svg" width="35" height="35" alt="" />
      <span className="brand-lockup">
        <span className="brand-name">
          DocReady<span>App</span>
        </span>
        <span className="brand-subtitle">{creatorByline}</span>
      </span>
    </>
  )
}

export function Brand() {
  return (
    <Link to="/" className="brand">
      <Wordmark />
    </Link>
  )
}

export function BrandMark() {
  return (
    <span className="brand">
      <Wordmark />
    </span>
  )
}

export function SiteFooter({ landing = false }: { landing?: boolean }) {
  return (
    <footer className={'site-footer' + (landing ? ' landing-footer' : '')}>
      <div className={landing ? 'wrap footer-inner' : 'footer-inner'}>
        {landing && (
          <div className="footer-brand">
            <Brand />
            <p>Every Document. Perfectly Ready.</p>
          </div>
        )}
        <p className="creator-credit">
          {creditPrefix}
          <strong>{creator}</strong>
        </p>
        <nav aria-label="Footer navigation" className="footer-links">
          <Link to="/privacy">Privacy</Link>
          <Link to="/workspace">Workspace</Link>
        </nav>
      </div>
    </footer>
  )
}
