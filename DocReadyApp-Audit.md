# DocReadyApp functional and visual audit

**Build 1.0.0 · 20 November 2026**

DocReadyApp is a static, local-first workspace with 26 tool routes. This audit used the production build with its Content Security Policy enabled, Linux Chromium 153, the shared Chrome browser, and synthetic documents with known content. It covers the sampled workflows below.

## 1. Working features and verified outputs

| Workspace | Tested with real file bytes | Output checks |
| --- | --- | --- |
| PDF merge, split and reorder | Three known text pages in two input PDFs | Reopened downloads and extracted text to verify page count, page order, selection and individual PDFs in the ZIP |
| PDF rotate and preview | Two-page PDF with different page widths | Confirmed the selected page’s 270° rotation in the downloaded PDF. Checked next page, zoom, fit control and source preview |
| Images to PDF and PDF to images | Transparent PNG, document JPEG and two-page PDF | Reopened a two-page Letter landscape PDF at 792 × 612 pt. Decoded a 500 × 530 px PNG from the page export ZIP |
| Watermarks, numbering and annotations | Text PDF with editable overlay settings | Verified watermark, number and annotation text in the exported PDF. Generated an outlined rectangle PDF and checked its output size against the source |
| Scanned PDF compression | JPEG-backed PDF and an already compact text PDF | Verified smaller output and page count for the scan. Checked byte-for-byte preservation when recompression increased file size |
| Image resize, conversion and compression | 240 × 160 px transparent PNG and a document JPEG | Confirmed resize aspect ratio, output dimensions, PNG and WebP transparency, JPEG opacity, a met size target and reporting of an unachievable target |
| Crop, adjustments and batch | PNG and JPEG fixtures | Verified rotated square crop dimensions and grayscale pixels. Reopened batch ZIP and decoded its outputs |
| Image information and metadata removal | PNG containing a known text metadata marker | Verified marker detection and removal, with original image dimensions and transparency preserved |
| Signature preparation and drawing | Cropped image and real pointer strokes | Verified aspect ratio and size requirements, transparent PNG exports, drawing undo and clear behavior |
| Application Ready | Missing required file followed by a JPEG upload | Verified validation blocked export when the file was missing. Reopened the resized 96 × 64 px PNG, matched it to the ZIP entry, checked the summary, and reloaded a locally saved template |
| Document scanner | Two uploaded photos and a simulated browser camera | Adjusted corners with the keyboard, previewed correction, generated a rotated JPEG and reordered a two-page PDF. Captured and exported a camera frame |
| OCR | English, Hindi and mixed-image text and a PDF page | Matched recognized text, edited it and verified the downloaded TXT. Observed same-origin language asset requests and reran Hindi OCR offline after caching |
| Resume builder | Synthetic resume with contact details, skills and a custom section | Verified editable section order, saved draft recovery and deletion, and extracted selectable text from the exported PDF |
| Organizer and file hash | Two identical files with different names | Verified duplicate flags, batch rename, sorting, grouping and ZIP collision handling. Checked SHA-256 against a known digest |
| Workspace, settings and offline | Desktop and touch browser sessions | Checked all 26 catalog routes, command palette search and keyboard controls, route history, settings persistence, mobile upload and download, and offline startup on a direct tool route |

## 2. Visual and accessibility review

- Reviewed screenshots of the desktop and mobile landing page, workspace dashboard, populated PDF and image tools, Application Ready validation, and desktop and mobile settings.
- Checked selected routes at 320, 390, 768, 1024 and 1440 px with no page-level horizontal overflow. Tested a 360 px touch viewport through an actual image download.
- Automated WCAG checks passed for the landing page, workspace, Resize Image, Application Ready, Settings and the mobile search dialog. Keyboard checks covered command search, dialog dismissal and scanner corners.
- Browser console checks found no errors during the catalog and responsive navigation audit. Intentional invalid-file tests verified the user-facing errors and recovery.

## 3. Issues resolved

| Finding | Resolution |
| --- | --- |
| A malformed file containing only a PDF header reached the editing stage | Validate that the parsed document has readable pages, then show a specific error |
| Output validation could show stale results after settings changed | Invalidate generated previews and download entries when key settings or files change |
| File inputs and command labels had inconsistent accessible naming | Bind visible form labels to their controls, and align the search action’s visible and accessible names |
| The landing heading faded in slowly on mobile and a compact settings option clipped | Keep the heading visibly rendered during entrance motion, and shorten the settings label |
| Offline navigation loaded the application shell but failed to load assets with a mismatched `Vary: Origin` cache entry | Match the app’s allowlisted core files by path with consistent cache handling |
| OCR needed dependable local assets and cache invalidation | Use same-origin worker, core and language paths with no CDN fallback in app configuration, and version the OCR offline cache |
| A wildcard static rewrite could intercept production assets | Use static tool HTML and the hosting provider’s native SPA fallback |
| Long or colliding filenames could give misleading extensions or replace a ZIP entry | Preserve short extensions during sanitization and generate unique archive names |

## 4. Build and test results

| Check | Result |
| --- | --- |
| TypeScript and production Vite build | Passed |
| Vitest engine tests | 15 of 15 passed |
| Playwright production browser suite | 18 of 18 passed |
| Configured canonical URLs and sitemap | Verified with a test origin |
| npm dependency audit | No known advisories reported by npm at audit time |
| Main application JS bundle | About 444 kB raw or 144 kB gzip. File-processing modules load separately |
| Local desktop first contentful paint | 140–192 ms across three clean Chromium contexts on loopback. Median 172 ms |
| Browser preview | Running locally and inspected in shared Chrome |

Local timing reflects the test machine and loopback connection. It gives no estimate for a mobile device, network location or production CDN.

## 5. Remaining limits

- The interface is English. OCR supports English and Hindi. Selectable resume PDFs and PDF text overlays use Western fonts.
- Scanned-PDF recompression rasterizes pages when it produces a smaller result. This removes the original text layer, form fields and links. It can return the original when recompression gives no benefit.
- PDF annotation supports text and outlined rectangles. Arbitrary editing of existing PDF text, secure redaction, decryption, password protection and Office conversion are outside the release.
- The document scanner uses manual corners. Camera capture passed with a simulated video device. Physical camera hardware, native PWA installation, update prompts, screen readers, Safari and Firefox still need device-level coverage.
- Target-size image export reports the achieved byte size. PNG has no lossy quality search, and JPEG or WebP may miss a very small target at the configured dimensions.
- Application Ready uses requirements entered by the user. PDF-to-image and image-to-PDF conversions for application slots use their dedicated tools. Very large documents can hit device memory and explicit page limits.
- Browser cache eviction may remove offline assets. First use of each OCR language needs the corresponding local asset download from the app’s origin. Browser storage controls can clear those assets.
- The app was tested locally. Deployment settings are included in the source and build package.
