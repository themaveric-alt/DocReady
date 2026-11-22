import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
const runtime = vi.hoisted(() => ({ desktop: false }))
vi.mock('../src/lib/environment', () => ({ get IS_DESKTOP() { return runtime.desktop } }))
import LandingHeader from '../src/components/LandingHeader'
import { HomeHero } from '../src/components/HomeHero'
import release from '../src/config/desktop-release.json'
it('keeps reader links out of the web header and hero while exposing desktop availability', () => {
  const html = renderToStaticMarkup(<MemoryRouter><LandingHeader /><HomeHero /></MemoryRouter>)
  expect(html).not.toContain('href="/pdf-reader"')
  expect(html).toContain('href="' + (release.downloadUrl || release.releasesUrl || '/desktop-download') + '"')
  expect(html).toContain('href="/workspace/all"')
  expect(html).toContain('href="/tools/encrypted-vault"')
})

it('keeps the reader and the utility workspace available in desktop navigation', () => {
  runtime.desktop = true
  try {
    const html = renderToStaticMarkup(<MemoryRouter><LandingHeader /><HomeHero /></MemoryRouter>)
    expect(html).toContain('href="/pdf-reader"')
    expect(html).toContain('href="/tools/encrypted-vault"')
    expect(html).toContain('href="/workspace/all"')
  } finally { runtime.desktop = false }
})
