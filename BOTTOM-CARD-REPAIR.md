# Bottom detachable wallet card repair

## Root cause

The prior OpenCV contour path analyzed the whole page. Its shape check used
long-edge / short-edge and allowed ratios from 1.05 to 3.4. Only the separate
text/ink grouping path restricted lower-page search, and only for Aadhaar.
Consequently compact-looking letter/receipt regions could outscore real cards.
Manual page-switch seeds also used arbitrary proportions, and the editor offered
"Use whole source" on A4 pages.

## Changes

- Standard portrait-paper PDF presets search the bottom 42% first. If fewer than
  two faces are found, a compact-card-only full-page pass locates off-center and
  stacked faces. Full pages and large letter rectangles still fail validation.
- Native PDF rotation is removed for analysis. Candidate corners are mapped back
  into the displayed viewport; normalized coordinates still feed the existing
  high-quality PDF crop and all output/Vault paths.
- A final independent guard accepts compact landscape width/height ratios 1.35–1.95,
  compact geometry and bottom-region placement. Portrait/page-sized crops fail.
- Directional morphology joins dashed edges. Neutral cutting guides, colored
  headers and interior ink groups are analyzed separately. Generous intra-card
  spacing retains separated number/footer lines.
- Twin guide panels require actual ink in each half; a missing back stays missing.
  Left/right ordering is a side suggestion requiring review unless independent
  text evidence identifies the side confidently.
- Detected corners initialize the crop handles directly. Unknown layouts get an
  explicitly unverified, ID-ratio bottom seed, never a successful A4 extraction.
  Standard PDF card editor and PDF/PNG/JPG/Vault exports reject whole-page crops.
  Explicit custom-document mode retains its separate manual behavior.

## Verification and limits

New tests execute real OpenCV in Node on solid, dashed, faint, single-side,
letter-only and rotated synthetic layouts. A real PDF.js → OpenCV → previewCrop
→ prepareExport pipeline renders a synthetic PDF at 300 DPI, generates PVC and
A4 horizontal/vertical PDFs, reopens and renders those files, checks front/back
colors and exclusion of the letter's green marker, and checks exact page sizes:
85.60 × 53.98 mm PVC and 210 × 297 mm A4. A separate-page case is also covered.
These are processing integration tests with a native Canvas implementation,
not a browser UI run or a guarantee of QR readability for every input.

No actual UIDAI/PAN/EPIC/APAAR/ABHA/e-Shram/licence samples were available.
There are therefore no supposedly calibrated authority-specific fixed boxes.
Fixed coordinates cannot guarantee millimeter-accurate boundaries across layout
versions. Faint/inferred crops require confirmation; unmatched layouts require
manual correction. Compact-card validation rejects portrait pages and large
letter regions; explicit custom mode remains available for non-card documents.
Low-memory devices retain the existing lower-resolution analysis limits.

## Precision follow-up (uneven crops)

Reproduced a staggered, borderless pair where the previous shared-height,
ratio-expanding fallback started the left crop at x=31 instead of x=80 (about
49 excess source pixels). Each side now gets independent top/bottom content
bounds with only a two-pixel safety margin. Cutting guides no longer manufacture
card widths from panel height. Source proportions are preserved; ID-1 fitting
is exclusively an export operation. Inferred boundaries still require review.

The crop editor's image was capped by height while its fit-content overlay
container could retain a different width. Its image, SVG and handle coordinate
surface now share one explicit aspect-ratio-based width. Browser DOM measurements
on the tested portrait PDF gave exactly 284.578125 × 402.15625 CSS pixels for all
three, with zero size mismatch. Fine keyboard moves use 0.1% increments; independent
edge inputs are available after explicitly aligning the edges. Small corner moves
no longer get swallowed by the former 0.005 normalized rectangle tolerance.

A live browser run used a fictional PDF and verified local upload, front/back
detection, original/cropped preview, corner keyboard movement, numeric edge edit,
reset, apply, and A4/PVC downloads. The actual browser downloads were read back
with pdf-lib: A4 was one 210 × 297 mm page; PVC was two 85.60 × 53.98 mm pages.
A browser extension emitted metadata errors; these were extension logs, not
document-processing errors. The browser run was desktop only. Actual government
files and the user's failing layout remain unverified without a representative
sample. Universal precision or perfect detection is not claimed.

## Same-side and stacked face follow-up

The content fallback now searches whitespace gutters along both axes at actual
positions, including both faces within one half of the page. A tall merged row
group is split before single-card limits are applied. A bounded full-page search
finds compact cards above the bottom strip. Orthogonal line reconstruction handles
card borders interrupted by letter frames; those inferred boundaries require review.
Analysis runs in the existing worker on at most an 1800-pixel-long-edge image,
while final crop rendering keeps its original high-quality PDF source.

The Aadhaar pair selector previously kept one Front, one Back and only unlabeled
remainders. Two regions both guessed as Front caused the second crop to disappear.
It now keeps distinct non-overlapping regions regardless of duplicate side guesses,
marks the conflicting label uncertain, and requires confirmation instead of manual
back-side cropping. It never adds a blank/missing reverse.

Regression tests cover left/right-column stacks, a borderless vertical stack, two
small faces wholly in the left half, a compact face above the initial bottom ROI,
duplicate Front guesses, overlap rejection, and a PDF.js-rendered intersecting-frame
layout. These remain synthetic layouts, not an assertion of universal government
document compatibility.

A desktop browser test uploaded a single fictional PDF with both faces stacked
in the left column, one above the initial bottom search region. Both previews
appeared automatically without opening the crop editor. Deliberately conflicting
Front hints produced an honest side-confirmation state; swapping/confirming the
labels allowed export. The actual downloaded PDF was reopened and contained two
85.60 × 53.98 mm pages. Side-label confirmation remains separate from automatic
boundary detection. No real government document was used in this test.

## Navigation readability update

Navigation surfaces now override decorative matte glass with 94% white / midnight
surfaces, 24px blur, 160% saturation, defined borders, floating shadows and a 1100
stacking layer. Unsupported blur and reduced-transparency preferences use solid
surfaces. Native language-menu option rows use opaque browser/OS popup colors.
No dependency, external asset URL, storage schema or document-upload path changed.
