# AI E-Card Cutter & Smart Print Studio

Open **Smart Print Studio** in the DocReadyApp sidebar or navigate to `/tools/e-card-cutter`.

1. Choose a PDF, image, or card photo. To label two separate inputs as you select them, use **Add Front** and **Add Back**. Camera access starts only when you press **Camera**.
2. Review every crop and its suggested side. Use **Adjust crop** to move four corners by touch, mouse, or keyboard. If both sides share an input and detection misses one, use **Add crop from source** to create a second independent crop. You can rotate, swap, replace, or remove a crop.
3. Choose **PVC Card — Actual Size** for one 85.60 × 53.98 mm page per selected side, in front-then-back order. If only one side exists, the output contains one page. Choose **A4 — Front & Back on One Sheet** for side-by-side or stacked actual-size cards with configurable spacing, margins and cutting guides. Other layouts and custom sizes are available when printing on paper.
4. Download a print-ready PDF, prepare another export format, or open the local print preview. In the printer dialog use **Actual Size / 100%**. Duplex produces two pages and requires the selected flip edge in your printer settings. The optional 50 mm calibration ruler helps check the printer's actual scale.

## Detection and output

- The browser worker combines OpenCV edges and contours with PDF.js text bounds and raster ink projections. It looks for compact panels, whitespace between them, and lower-page cut or fold guides. Large PDF page outlines are excluded before confidence ranking. Scanned pairs can use local OCR after geometry narrows the search. The source page selector and four handles provide manual correction when a boundary is uncertain. Export stays blocked until the crops and sides are confirmed.
- Side suggestions use PDF text at the detected location or optional English, Hindi, or bilingual local OCR. Suggested ordering without matching evidence requires confirmation. The presets guide detection and contextual clues. They do not establish identity or document authenticity.
- Print sheets support side-by-side, stacked, single-side, grid, movable custom placements, and duplex. PDF sizing is in points derived from millimeters. Artwork always fits proportionally inside its assigned size, so a different source ratio can leave a small margin inside the slot. Use original ratio sizing to match the artwork's proportions.
- PDF export preserves vectors for eligible unencrypted, unrotated source pages without annotations when the full source is the selected artwork. Partial crops use the inverse PDF.js viewport mapping and render only the selected area at the export resolution. A visual clip around an embedded whole PDF would still carry off-crop content, so partial crops use raster output. The derivative has no original signature verification.
- PNG and supported JPEG encoders include print density metadata. The separate browser print preview uses exact millimeter dimensions and raster crops. Browser, margins, and printer settings can still affect physical output. Exportable pixel sizes depend on source resolution, memory, and format.
- Up to 36 MB per file, 12 files and 105 MB per batch, up to 24 pages per PDF and 48 per batch (12 and 24 respectively on browsers reporting 2 GB memory or less), and 24 crops in one workspace. Auto detection loads a roughly 11 MB uncompressed static worker on first use. Larger 600 DPI raster sheets can reach a browser's canvas limit, in which case use the PDF or reduce raster DPI. Manual crop can continue without the detector.

## Privacy

The application reads original files, OCR text, passwords, and generated outputs in browser memory. The source, OCR result, and password are never intentionally written to localStorage, IndexedDB, or service-worker caches. Reset clears application-held references and closes any print preview. Downloaded files stay in the user-selected location. Static app files, the OpenCV worker, and OCR language assets may be cached. Run detection and the selected OCR language online once to make those assets available offline. Browser eviction can remove cached assets.

## Build and tests

The worker pins `@techstark/opencv-js` 4.12.0-release.1 (Apache-2.0), verifies the upstream glue file hash, and substitutes normal closures for older Emscripten binding code that executes generated JavaScript. The OpenCV WASM bytes are unchanged and the site CSP remains unchanged. The production build includes the dependency's Apache license.

```sh
npm test
npm run build
npm run test:browser
```

Browser fixtures in `tests/fixtures/ecard/` are synthetic. Tests cover horizontal and vertical extraction, front/back suggestions, one- and two-sheet outputs, four-corner correction, wrong-password recovery, no document traffic or persistence, offline vision, paper dimensions, PNG/JPEG/ZIP downloads, camera capture with a simulated device, and a mobile-width viewport. Repair regressions also cover synthetic bottom sections with and without borders, a scanned document, separated pages, nonzero PDF box origins, rotation, missing sides, exact PVC dimensions, and QR decoding from the output. No actual UIDAI document, physical PVC printer, or physical Android Go device was available for verification.
