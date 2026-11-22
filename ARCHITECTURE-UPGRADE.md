# DocReady architecture update — 22 November 2026

## Changes implemented

The existing React/TypeScript architecture was extended. No separate application, backend, remote OCR or remote inference service was added.

### Shared tool flow

`src/components/ToolJourney.tsx` supplies a three-stage progress header, local-processing notice, file/output stage tracking, start-over remount and return-to-workspace action. Shared FileList and Results components report their active inputs/outputs. Route changes now remount the tool subtree, clearing its local file/editor state. Results retain the common Download and encrypted Vault actions.

`src/styles/layout-3stage.css` defines 12px cards, a 70/30 desktop workspace, stacked mobile controls and sticky primary actions. PDF Studio, Image Studio, Scanner, OCR, Office converters, PDF signing and the additional PDF suite settings explicitly identify their control panels. Specialized authoring tools and Vault retain their existing editor/dashboard structures within the common shell; these are not yet fully redesigned into identical two-column editors. Custom translation outputs do not yet report all output-stage transitions to the shared shell.

### Scanner

Camera is the primary entry action, above gallery/file import. The live viewfinder requests the rear camera, displays an alignment frame and exposes a torch toggle only when the camera reports torch capability. On camera failure a device-camera input (`capture=environment`) is available; permission policies can require the second user click. Streams stop when capture completes, the camera closes or the component unmounts.

The existing local OpenCV worker continues to detect four corners, perform perspective correction and apply Magic Color, adaptive B&W or Original filters. Multi-page reorder, delete and PDF/PNG/JPEG exports are retained. Every scanner export sets its default Vault destination to Scanned Docs, which users can review before encryption.

### OCR

`src/lib/ocr-pixels.ts` implements grayscale processing, explicit bicubic interpolation, percentile contrast stretching, Otsu threshold selection and local adaptive thresholding. The preparation worker applies up to 2× scaling within its 2,600px/4.5MP working limits. Users can select adaptive cleanup for shadows, Otsu B&W for even scans or grayscale contrast for faint/color ink.

English, Hindi and combined Tesseract language assets remain self-hosted. Tesseract 7 is retained rather than downgrading the installed engine to version 5. Tesseract's IndexedDB model cache and the service worker's OCR asset cache provide offline reuse after the first successful load. Browser storage policy can remove caches. Neither startup time below one second nor an accuracy improvement on every input is established.

The result includes the prepared last-page source, editable extracted text, copy, TXT, DOCX and Save Note to Vault actions. Recognition and pixel preparation run in separate workers. Source files and OCR results are not persisted unless the user explicitly saves them.

### Vault security and bridge

The existing AES-256-GCM and PBKDF2-HMAC-SHA-256 (600,000 iterations) implementation is preserved. Keys remain non-extractable. Random IVs authenticate independently encrypted metadata and 2MiB file chunks; metadata includes filenames, MIME types, tags, OCR text, folder assignment and dates. Folder records are also encrypted. The existing schema is retained so existing encrypted files and backups remain readable. The proposed plaintext MIME/date schema was not substituted for it.

The auto-lock timer is now enforced after three minutes without interaction. Locking aborts active Vault operations, drops the active CryptoKey/session references, clears the decrypted RAM index and closes/revokes active preview URLs. Browser/OS memory cannot be promised to be securely erased. A long passphrase offers more resistance to offline guessing than a short PIN; the existing minimum is 12 characters or 8 PIN digits.

Scanned Docs and ID Cards are added alongside existing default folders. All Files remains the virtual aggregate view. Existing custom folders, encrypted ZIP backup/restore, legacy `.vault` import, storage quota estimates and persistent-storage requests are retained. Current encrypted export uses `.vault.zip`; no new incompatible archive format was introduced.

`src/lib/vault-bridge.ts` exposes both an ESM `VaultBridge` export and `window.VaultBridge.saveFile(blob, filename, defaultFolder)`. The helper validates inputs and opens the shared create/unlock dialog when needed, followed by the existing filename/folder confirmation and Encrypt & Save action. It deliberately returns no CryptoKey or plaintext vault index. This is a reviewed-save flow, not unattended automatic encryption after unlock. Background Remover now also exposes this Vault bridge for transparent and solid outputs.

### Worker and lifecycle improvements

Core PDF merge, split, organize, rotate, watermark, number, annotate and image-to-PDF assembly now use `pdf-edit.worker.ts` through `pdf-edit-client.ts`. PDF page counts are read in that worker. Shared operations receive an AbortSignal; raster workers and PDF editing workers terminate on cancellation/unmount when that signal is supplied. Scanner, OCR and password handling already use disposable workers. Some existing specialized Office/layout/form operations still run asynchronous work on the UI thread; the entire platform has not been proven free of long tasks.

## Verification

- TypeScript passed.
- 50 Vitest tests passed across nine files. New synthetic pixel tests check Otsu class separation, adaptive cleanup on uneven paper, bicubic dimensions/uniform intensity and faint-ink grayscale retention. Existing tests check encrypted records, unique IVs, wrong passwords, authenticated context, tampered backups and backup round trips.
- Production build and local asset/static route audits passed (60 catalog routes; seven PDF groups).
- New Playwright tests cover entry/workspace/output/reset, camera-first mobile layout and the global bridge's locked-Vault flow. Existing Vault auto-lock test now advances 181 seconds.
- Browser execution remains blocked before application startup: local Chromium aborts with `socket() failed: Operation not permitted`. A separate cloud browser also could not reach the local preview (`ERR_CONNECTION_REFUSED`). Camera behavior, mobile spacing, OCR reference accuracy, download bytes, complete stage transitions, CSP execution and offline end-to-end behavior are therefore **not reported as passed**.

Run `npm test`, `npm run build`, `npm run audit:runtime`, `npm run audit:routes`, then `npm run test:browser` on a host that can launch Chromium. Review actual scan and OCR outputs before deployment. This build has not been deployed to the earlier public preview.
