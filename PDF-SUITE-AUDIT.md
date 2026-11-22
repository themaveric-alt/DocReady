# DocReady PDF suite audit — 22 November 2026

## Current result

The existing React application was extended in place. The registry remains `src/catalog.ts`, with a new dependency-free `src/tools-config.ts` defining seven PDF groups and a separate image optimization group. There are 60 catalog routes and 32 entries in the seven PDF groups. The request enumerates 33 tools despite referring to 30. PDF/A is excluded pending a compliant generator and independent validation.

### Implemented engines and integrations

- PDF merge, range/individual/every-N split, removal/reorder, per-page rotation in the organizer, image-to-PDF, PDF image export, text watermarks, numbering, text/rectangle annotations and PDF preview use the existing engines.
- Scanner, English/Hindi OCR, interactive forms and PDF translation reuse the existing modules.
- New modules provide DOCX text to PDF; PPTX slide text to PDF; XLSX/CSV tables to PDF; HTML text to PDF; extracted PDF paragraphs to DOCX; editable text slide PPTX export; extracted rows to XLSX; visible CropBox adjustment; lenient readable-PDF rebuilding; local extractive summaries; Markdown; raster comparison; and destructive raster redaction.
- QPDF AES-256 protection uses a disposable WASM worker and separate user/owner passwords. Existing local password unlock is retained. Visible signing accepts drawing, typed Western text or a PNG/JPEG signature.
- Shared output panels offer downloads and Save to Encrypted Vault. Downloads revoke temporary URLs after 1.5 seconds so browsers can consume the download. Preview URLs are revoked on replacement/unmount.
- Compress PDF and Image Compressor provide three presets, numeric KB/MB/GB ceilings and 20/50/100/200 KB and 1 MB shortcuts, batch individual files plus ZIP, measured sizes and percentage saving.
- Quality search explicitly measures 0.98 and 0.05, then performs eight binary-search iterations. Image target retries reduce dimensions by 10% up to ten times. PDF trials reduce render scale from 1.8 to 0.5. Impossible ceilings report failure. Images use OffscreenCanvas workers where supported; PDF.js uses its worker renderer and a dedicated PDF assembly worker. PNG lossy target export uses WebP with an explicit notice.

## Verification performed

| Check | Result |
| --- | --- |
| TypeScript | Passed |
| Vitest | 46 tests passed across 8 files |
| Static catalog/route output audit | 60 route HTML files and seven categories passed |
| Local runtime inventory/CDN configuration scan | 12 required primary library files passed; additional jsPDF/html2canvas copied locally |
| Production build | Passed; existing large-chunk and QPDF Node fallback externalization warnings remain |
| Browser integration / output downloads | Blocked before app startup by Chromium `socket() failed: Operation not permitted` |
| Visual / mobile / console / CSP execution | Unverified in this environment; no all-tools pass claim |
| Offline runtime and zero-document-network execution | Architecture/static paths checked; browser verification still required |

Tests cover existing PDF manipulation, scanner geometry, credential layouts, workflow/image sizing utilities, safe filenames, registry groups, summary/Markdown behavior, actual DOCX package structure and target-search boundary/ceiling handling. These do not establish every new converter's browser output correctness.

## Assets, dependency decisions and privacy

`scripts/assets.mjs` copies pinned npm distribution files to `public/libs`: PDF-lib, PDF.js and worker, QPDF JS/WASM, Mammoth, DOCX, PptxGenJS, html2pdf, jsPDF, html2canvas, JSZip and Tesseract. Existing OpenCV JS/WASM remain local. ESM code is bundled into same-origin `/assets`; the stable library copies and production bundles are precached. PDF.js auxiliary font/CMap/ICC/WASM paths use the site origin. Worker and WASM directives remain in `_headers`. There are no application imports from unpkg, jsDelivr or cdnjs.

The vulnerable npm SheetJS package was removed, so `xlsx.full.min.js` is deliberately absent. A small local OOXML/CSV reader/writer supplies the supported spreadsheet conversions. Legacy XLS requires conversion to XLSX first. PptxGenJS is pinned to 4.0.0 with image-size overridden to 2.1.0. The production dependency audit still reports two high entries: IMG.LY background-removal and its Zod dependency (the same inherited vulnerability chain, GHSA-mrhx-c7xc-m3w5). No compatible upstream IMG.LY update was available; a breaking Zod-major override was not applied blindly.

No custom backend or document transmission endpoint was introduced. User files stay in active memory except for explicit encrypted-vault saves. Static cache entries contain application assets, not uploaded files.

## Remaining requirements and limits

- PDF/A-1b generation/validation remains unavailable. XMP plus an ICC profile alone would not establish compliance.
- No ad-gate, payment or entitlement implementation exists in this checkout. Premium/free values are metadata only. Requested prices and three-use gating are not connected.
- Office conversions retain readable text/basic tables, not complete source layout, graphics or arbitrary HTML/CSS. Output is raster PDF with browser-shaped fonts. XLSX export retains text rows rather than inferring full tables. PDF-to-PPTX reconstructs editable text but does not recreate images/design.
- Remove/Extract use working page controls/ranges; click-to-mark thumbnail selection is incomplete. Organizer supports per-page rotation, drag order and deletion. Crop/redaction/sign placement currently uses numeric controls rather than the requested full drag editor.
- The PDF editor currently adds text and outlined rectangles. Freehand/image/highlight editing and logo watermarks remain incomplete. Comparison generates difference images/reports but synchronized dual scrolling and semantic text diff remain incomplete. Markdown download exists; live Markdown preview remains incomplete.
- PDF compression rasterizes entire pages, with loss of selectable text, links, forms and source signature verification. It is intended for scans. Very low targets can harm readability; safe minimum scales may prevent reaching a target. It cannot promise an arbitrary exact byte count.
- Ordinary processing uses the existing 80 MB/file, 180 MB/batch and 40-file safeguards; PDF raster exports allow up to 40 pages. These are separate from the vault's chunked intake.
- All browser workflows, new Office outputs, password protection, mobile layouts, network privacy, source-font rendering and offline behavior need verification on a host that can launch Chromium. Real user documents were not used.

## Commands

`npm test`, `npx tsc --noEmit`, `npm run audit:runtime`, `npm run build`, `npm run audit:routes`, `npm run test:browser`.

The current build is in `dist/`. This update has not been deployed to the earlier cloud preview.
