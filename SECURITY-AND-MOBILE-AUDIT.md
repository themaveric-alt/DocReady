# DocReady security, mobile segmentation and desktop implementation

## Changes delivered

- Replaced the 44,348,940-byte decoded IS-Net model with 4,574,861-byte U²-NetP. This is a smaller FP32 architecture, not a quantized IS-Net variant. Pinned SHA-256 `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`. Local `/libs/u2netp.onnx`, Apache-2.0 upstream, rembg official release provenance. Static model cache only. Original content remains in memory.
- WASM-only ONNX execution, single thread, SIMD enabled, proxy disabled, sequential execution, CPU arenas and memory patterns disabled. Input preview bounded to 1024px, then 512px for one fresh-worker retry. The model itself has a fixed 320×320 input. Smaller previews reduce preprocessing allocations. Model initialization memory remains governed by the architecture.
- Every inference explicitly disposes tensors and releases the session in `finally`. The worker closes ImageBitmaps and releases canvases, then the controller terminates it. Cancellation terminates the worker. A bounded timeout prevents indefinitely stuck initialization.
- Smooth alpha compositing uses the original source RGB at original dimensions, within the existing 8MP safety limit. Mask detail comes from the 320px segmentation model and requires review for hair and complex backgrounds.
- A local border-connected color flood-fill fallback can finish simple-background cutouts without loading a model. The UI clearly identifies fallback results and offers direct selection. Uniform or complicated scenes may need a different photograph or manual editing in another tool.
- Retained existing Vault PBKDF2-HMAC-SHA256 at 600,000 iterations, 16-byte random salt, non-extractable AES-256-GCM keys, unique 12-byte random IVs and authenticated chunk/metadata records. Added serialized unlock attempts with progressive session cooldown after five failures. Cooldown does not replace strong passwords or prevent attacks by someone with access to the browser profile or exported ciphertext.
- Retained three-minute auto-lock, pagehide locking, operation abort and preview URL cleanup. No migration or destructive changes to existing Vault records.
- Added explicit production sourcemap disable, HSTS, X-Frame-Options, media CSP, payment/USB restrictions and upgrade-insecure-requests. Kept same-origin WASM/workers, Blob previews, scanner camera and inline styles required by layout. Corresponding-source licensing archives remain available separately.
- Added sensitive-file ignore rules and a static distribution/source security audit. First-party source contains no executable HTML assignment, eval or Function sinks. HTML-to-PDF extracts text and does not insert uploaded HTML into the live page.
- Removed the unused IMG.LY dependency and its Zod advisory chain after switching engines.

## PDF reader

New `/pdf-reader` provides bounded visible-page canvas rendering through IntersectionObserver, single/continuous views, zoom, fit width, day/sepia/dark reading modes, per-page embedded-text search highlighting, bookmark navigation, page deletion/reordering and selected-page rotation using the existing PDF worker. Download and Vault actions are connected. Existing annotation and signature tools are linked.

The requested full inline text/image element editor, thumbnail rendering, blank-page insertion, full annotation suite, text selection layer, cross-page search results list and properties inspector are incomplete. Existing PDF text is not rewritten by this reader. Masking text in an annotation editor would leave underlying content and must never be presented as secure redaction. Large-document and mobile performance remain unmeasured.

## Desktop

Added Tauri v2 Rust shell, local CSP, limited event capability, PDF file associations, launch-argument/single-instance/macOS Opened handling, and a frontend bridge into `/pdf-reader`. Launch files are consumed from native state rather than accepting arbitrary filesystem paths through IPC. Native PDF saves require an OS file destination dialog. Other tools retain browser-style download behavior pending platform testing.

Added a three-OS GitHub Actions build configuration with Windows NSIS, macOS universal DMG, and Linux DEB/AppImage artifact upload. It needs to run in a GitHub repository with Actions. The current Sites source repository does not run GitHub Actions. No installers or signed releases have been produced, linked or advertised. Rust/Cargo and platform system dependencies are unavailable in this executor. Native compilation, file associations, permissions, signing, macOS notarization and native save behavior are unverified. The full bundled asset set exceeds 10MB substantially.

## Verification performed

- TypeScript check and production build passed before final packaging. Final package commands rerun the build.
- 74 Vitest tests across 14 files passed, including border-connected cutout and cooldown regressions.
- Actual U²-NetP session initialized with ONNX WASM CPU, executed inference and returned seven finite `[1,1,320,320]` masks. Input/output tensor disposal and session release completed. This verifies model/runtime compatibility in the executor, not portrait quality or Android browser performance.
- Local runtime audit passed for 12 pinned stable library assets. Static route audit passed for 60 catalog routes and seven PDF categories, plus the separate new reader route.
- Static security audit passed for source sinks, known key patterns, tracked sensitive extensions, distribution exclusions and required headers.
- Available 26-commit Git history scan found zero matches for selected high-confidence private-key/AWS/GitHub-token patterns. This is not an exhaustive forensic secrets audit. No tracked secret required removal or rotation under that scan.
- Production `npm audit --omit=dev` returned zero known vulnerabilities after removing IMG.LY. Registry advisory coverage is limited to its published data.
- Browser opened the updated background-removal entry screen. Synthetic upload automation timed out, then the session reset. A later browser policy denial prevented further browser access. Full upload/inference/download, reader, CSP runtime, network privacy, offline and mobile browser workflows remain unverified in this update.
- No physical 2GB/4GB Android device, memory peak measurement, camera permission test or native operating-system installer test was available. No all-device crash-free or 100%-functional claim is made.

## Deployment constraints

Security headers are supplied through `_headers`; the hosting platform must honor them. Source files, test fixtures and scripts are outside `dist`. The deployment archive does not expose those source directories. Directory listing and host-level path denial depend on the static host. Persistent browser storage and local encryption do not protect a compromised OS or browser extension.
