# Web and desktop runtime separation

`src/lib/environment.ts` exposes `IS_DESKTOP` based on either `window.__TAURI__` or `window.__TAURI_INTERNALS__`, with a safe server-side guard. This controls presentation and native integration. It is not an authentication or security boundary.

## Web

Reader links are absent from the landing header, mobile drawer, hero and workspace sidebar. The reader has no catalog entry, mega-menu entry or command-palette action. `/pdf-reader` redirects to `/desktop-download` in a normal browser. The build no longer emits a reader SEO page. PDF utility categories remain available under PDF Tools. All existing utility catalog entries and the encrypted vault are retained.

Navbar, mobile drawer, hero and download banner use a shared desktop CTA. When a verified Windows installer is configured, it links directly to the GitHub latest-release stable asset. If the asset cannot be verified during a website build, the CTA falls back to the repository's latest release page. With no configured repository it opens the availability page, which clearly identifies the unpublished installer. No generated or simulated executable is served.

Set `DOCREADY_DESKTOP_REPOSITORY=owner/repository` in the web build environment, or set the `repository` value in `src/config/desktop-release.json`. The build script validates that identifier, queries the public latest release and verifies its Windows asset before enabling the direct download. It never sends user documents. Browser tools retain their same-origin CSP. Asset fallback is evaluated during website builds. A remote asset removed after a successful build can still break a saved URL until the next build. No static website can guarantee that a third-party release URL will always exist.

## Desktop

The same app retains `/pdf-reader`, utilities and Vault when Tauri's runtime marker is present. Existing launch arguments, single-instance events and macOS Opened events are consumed by the native bridge, navigating to the reader and skipping the introduction for an incoming PDF. Normal launch retains the five-second intro.

Tauri product name is DocReady, version 1.0.0. Bundle targets are explicitly `nsis`, `dmg`, `deb`, `appimage`. Each build matrix job overrides its platform bundle set. PDF association configuration remains in place. Native launch, installer association and save behavior require OS testing.

## Release workflow

`.github/workflows/build-desktop.yml` triggers on `v*` tags, including `v1.0.0`, and can be dispatched for build-only checks. A release tag must match the Tauri config version. Three matrix builds generate Windows x64 NSIS, macOS universal DMG, and Linux DEB/AppImage. Installer collection preserves the versioned Windows name `DocReady_1.0.0_x64-setup.exe` and adds a stable `DocReady_x64-setup.exe` alias.

After all builds succeed, a separate job with repository contents-write permission downloads their artifacts, creates a draft GitHub Release, uploads the full installer set, and publishes it as latest. Build jobs use contents-read permission. Manual dispatch does not publish a release. Binaries are unsigned unless platform signing is configured separately.

## Current blockers and verification

Connected GitHub search returned no DocReady repository. No GitHub destination URL, repository access or published installer is available. The user was asked for the intended repository URL. Therefore no executable download is enabled yet, no tag has been pushed to GitHub, and the release workflow has not run. The Sites Git repository is separate from GitHub Actions.

The existing reader supports reading, zoom, search highlighting, bookmark navigation, rotation and page organization. Full inline text/image editing, a complete annotation ribbon, thumbnails and the properties inspector remain incomplete. This change controls which runtime exposes that reader; it does not establish PDFelement feature parity.

Automated checks cover both runtime markers and ordinary browser contexts. Server-rendered header/hero regression checks cover removal of web reader links and preservation of utilities/Vault access. Production build and static runtime/route/security audits are run before publication. Browser verification was attempted but the browser security policy blocked access to the preview tab. Desktop compilation and installer execution remain unverified in this environment.
