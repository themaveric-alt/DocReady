import { Link } from 'react-router-dom'
import { IS_DESKTOP } from '../lib/environment'
import release from '../config/desktop-release.json'
export function DesktopCTA({ className = 'btn btn-primary' }: { className?: string }) {
  if (IS_DESKTOP) return <Link className={className} to="/pdf-reader">PDF Reader / Editor</Link>
  const details = release as { downloadUrl: string | null; releasesUrl: string | null; verified: boolean }
  if (details.verified && details.downloadUrl) return <a className={className} href={details.downloadUrl} rel="noopener noreferrer">Download for Windows (.exe)</a>
  if (details.releasesUrl) return <a className={className} href={details.releasesUrl} rel="noopener noreferrer">Desktop Software Releases</a>
  return <Link className={className} to="/desktop-download">Download Desktop Software</Link>
}
