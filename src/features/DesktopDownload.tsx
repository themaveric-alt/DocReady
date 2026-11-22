import { Link } from 'react-router-dom'
import release from '../config/desktop-release.json'
import { IS_DESKTOP } from '../lib/environment'
export default function DesktopDownload() {
  const available = release as { repository: string | null; downloadUrl: string | null; releasesUrl: string | null; verified: boolean }
  return <section className="panel privacy-copy"><div className="eyebrow">DOCREADY BY TRENISH</div><h1>DocReady Desktop Software</h1><p>Bring your PDF reader, document utilities and encrypted vault into one desktop workspace.</p>
    {available.downloadUrl && available.verified ? <a className="btn btn-primary" href={available.downloadUrl} rel="noopener noreferrer">Download for Windows (.exe)</a> : <><button className="btn btn-primary" disabled>Windows installer awaiting release</button><p role="status">{available.repository ? "The installer could not be verified during the latest website build. Release links appear here when a published release is available." : "The desktop installer has not been published to a configured GitHub Release yet. The web utilities are available now."}</p></>}
    {available.releasesUrl && <p><a href={available.releasesUrl} target="_blank" rel="noopener noreferrer">View latest release and all platforms</a></p>}
    {IS_DESKTOP && <Link className="btn btn-secondary" to="/pdf-reader">Open PDF Reader / Editor</Link>}
    <p><Link to="/workspace/all">Open all document utilities</Link></p>
  </section>
}
