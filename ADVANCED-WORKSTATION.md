# DocReadyApp advanced workstation

## Implementation checklist

- [x] Inventory existing routes, browser processing workers, print and E-Card engines, application rules, Unicode fonts, PDF handling, offline caching and security headers.
- [x] Integrate six tools into the homepage, catalog and existing router.
- [x] Build a non-destructive portrait editor with local analysis, masking, outfit overlays, restoration and export.
- [x] Reuse physical print layout, local PDF and application processing, repeatable automation and Unicode export.
- [x] Add unit and browser tests for working outputs and the Lite fallback.
- [x] Validate the production build and check Chromium compatibility.

## Features and files

| Workspace | Implementation | Main files |
| --- | --- | --- |
| PrintDesk Pro | Portrait analysis and editing, Passport Photo Maker, the existing PVC / E-Card Cutter, batch sheets, quality inspection and saved print defaults | `PrintDesk.tsx`, `PhotoStudio.tsx`, `PhotoPrintPanels.tsx`, `printPhotos.ts`, `photo/` |
| Document Doctor | File diagnostics, image tone and margin correction, format conversion, PDF rotation, preview and undo | `DocumentDoctor.tsx` |
| Smart Application Pack | Local PDF and OCR extraction, reviewable requirement suggestions, the existing preparation and validation engine, ZIP and a validation summary | `SmartPack.tsx`, `documentInput.ts`, `src/features/Application.tsx` |
| Workflow Automation Studio | Typed and reorderable image and PDF steps, browser-saved definitions, progress, cancellation and output downloads | `WorkflowStudio.tsx`, `workflow.ts` |
| Bilingual Document Composer | Structured English and Hindi drafts with editable text, UTF-8 TXT, print and searchable Unicode PDF | `BilingualComposer.tsx` |
| Smart Form Assistant | Supported AcroForm text, checkbox, radio, list and dropdown entry, preview, PDF export and a separate worksheet for flat forms | `FormAssistant.tsx` |

Feature files are in `src/features/advanced/`. Integration is in `src/App.tsx`, `src/catalog.ts`, `src/styles.css`, `src/features/advanced/advanced.css` and `src/features/Settings.tsx`. The browser compatibility fix uses matching legacy PDF.js builds in `src/lib/pdf-render.ts` and `vite.config.ts`. The service-worker generator in `scripts/release.mjs` marks offline navigation explicitly, so the app can show its offline status even when the browser reports an active network interface. Tests are in `tests/advanced.test.ts`, `tests/browser/advanced.spec.ts`, `tests/browser/workflows.spec.ts` and `tests/browser/accessibility.spec.ts`.

## Photo processing and outfits

The editor keeps the original file, current edit state and undo history in browser memory. The browser decoder applies recognized EXIF orientation. A dedicated worker measures luminance, contrast, clipping, edge detail, noise, color cast and background detail. The same renderer applies crop, transform, tone, sharpening, denoise, masks, outfit geometry and border edits for preview and export. It returns exact pixel dimensions and supports standard 2× resampling. Passport exports use the chosen photo dimensions and DPI. PDF sheets use millimeter-to-point conversion and proportional image placement. PNG preserves transparency.

| Outfit collection | Presets |
| --- | ---: |
| Formal Suit & Blazer | 10 |
| Formal Shirt with Tie | 10 |
| Formal Shirt without Tie | 10 |
| Smart Casual | 10 |

All 40 are original DocReadyApp vector templates. The thumbnail and rendered layer share the same garment geometry. The editor uses browser face landmarks when available, an optional foreground silhouette, or manual neck, shoulder, scale and rotation controls. The protection brush restores original pixels above an outfit. Export requires outfit approval after fitting edits. The passport workflow omits the outfit layer and decorative effects. This is geometric template compositing with manual correction for unusual poses.

## Models, assets and processing limits

- Optional background segmentation reuses the same-origin quantized IMG.LY IS-Net model and existing ONNX Runtime CPU/WASM worker and download cache. The worker and IMG.LY package use AGPL-3.0 terms. The IS-Net upstream notice and dependency notices are shipped in the build. The corresponding modified source package is at `/licenses/background-source.zip`.
- The notification and worksheet tools reuse local Tesseract and staged language packs. Existing Noto Unicode fonts and PDF font infrastructure support Hindi and English. The font license is shipped at `/assets/fonts/OFL.txt`.
- Lite is the default. The manual workflow can fall back to a regular canvas when worker canvas is unavailable, with a 4 megapixel fallback limit. The editor limits previews to 700,000 pixels and final rendering to at most 16 megapixels, reduced to 6 megapixels when the browser reports 2 GB of device memory. The browser, decoder and other tabs can affect total memory.
- Files, portraits, masks and form values remain in the browser session. The site can cache code, static models and language data. Only the workflow definitions and print defaults can be stored by these workspaces, when explicitly saved. Settings can remove those saved configurations.
- Registry audit flagged the existing IMG.LY package through its Zod dependency. Its bundled validator handles fixed segmentation options rather than uploaded document contents. The advisory and bundled dependency remain present. [GitHub advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)

## Verification and limitations

Verified using synthetic portrait poses, a JPEG with EXIF rotation, real local background model inference, rendered and scanned test inputs, generated form fixtures and independent reads of downloaded PDFs and ZIPs. Print page measurements in the browser tests cover A4 and 4 × 6 inch paper. The existing E-Card suite covers exact ID-1 sizes. The browser tests check same-origin static model requests and absence of source file names in persisted storage.

Face alignment and mask accuracy depend on the browser and the photo. Scratch cleanup samples nearby pixels and is intended for small marks. Document Doctor can re-encode supported images and rewrite or rotate readable PDFs. Some malformed, encrypted or unsupported input requires a different tool. Application suggestions need confirmation. XFA, signed-field authoring and flat PDF overlays are outside the form release. The worksheet is a separate preparation file.

Neural super-resolution, automatic colorization and generative try-on are absent. The reviewed ONNX example uses a 3× luminance model, so the released 2× option remains standard resampling. Physical 32-bit Android, Android Go, 2 GB hardware and printers were unavailable. The low-memory test simulates the fallback on Chromium 143 with a 432 × 648 px fixture. A representative restoration run took approximately 460 ms across the measured interaction and export. Renderer JavaScript heap was about 8.20 MB before and 8.46 MB after. The sample excludes workers, decoded image surfaces, GPU memory and browser-wide peak memory. The deployed site uses its existing hosting access policy. The app has no account system, payment gateway or feature locks.
