# Translation Tools

DocReadyApp bundles two direct translation directions.

| Direction | Model origin | ONNX conversion revision | Local model download |
| --- | --- | --- | --- |
| English → Hindi | Helsinki-NLP/opus-mt-en-hi | Xenova `7aad72006a1588a9c3485ed6203aed99eebbc872` | About 81.5 MiB |
| Hindi → English | Helsinki-NLP/opus-mt-hi-en | Xenova `99853100ed9d932987a6816e8cf7b1b6742a6116` | About 77.9 MiB |

Both packs use INT8 Marian encoder and merged decoder weights. The separately downloaded CPU runtime is about 14 MiB and is shared between model directions. Each document run loads only one direction. The worker uses Transformers.js 4.3.2 and ONNX Runtime Web's single-thread WASM execution provider. WebGPU and intermediate-language translation are not enabled. Spanish, French and German can use the browser’s separate on-device Translator when that API and the selected pair are available. The browser manages its own language pack downloads. DocReadyApp has no remote inference fallback. On browsers without this API the additional translation options are disabled.

## Licenses and attributions

Helsinki-NLP's published English–Hindi and Hindi–English OPUS-MT weights use Apache-2.0. The Xenova repositories identify converted ONNX versions of these weights and carry upstream model attribution. This build uses the pinned Xenova INT8 conversions with no edits to their bytes. The hosting build splits the largest files into 16 MiB parts, losslessly compresses those parts for hosting, and rejoins the unchanged weights in the browser. It includes the Transformers.js and ONNX Runtime license texts under `dist/licenses/`. Transformer inference uses the Apache-2.0 Transformers.js package. ONNX Runtime uses MIT. Franc-min uses MIT and performs local character n-gram language identification. Unicode exports use self-hosted OFL Noto Sans Devanagari fonts. No NLLB-200 model is bundled.

- [Helsinki-NLP English → Hindi model card](https://huggingface.co/Helsinki-NLP/opus-mt-en-hi)
- [Helsinki-NLP Hindi → English model card](https://huggingface.co/Helsinki-NLP/opus-mt-hi-en)
- [Xenova English → Hindi conversion](https://huggingface.co/Xenova/opus-mt-en-hi/tree/7aad72006a1588a9c3485ed6203aed99eebbc872)
- [Xenova Hindi → English conversion](https://huggingface.co/Xenova/opus-mt-hi-en/tree/99853100ed9d932987a6816e8cf7b1b6742a6116)
- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)

## Build

The model setup command is for the developer machine. It downloads published, redistributable weights and verifies both size and SHA-256 against `src/features/translation/models/model-lock.json`. A maintainer with the pinned files already on disk can set `DOCREADY_MODEL_SOURCE` to a directory containing the original files under `en-hi/` and `hi-en/`.

```bash
npm ci --ignore-scripts
node scripts/assets.mjs
npm run models:prepare
npm run background:prepare
npm run build
npm run preview
```

The build checks that the files are present and correct. No runtime request goes to Hugging Face. Serve all of `dist/` as one HTTPS origin. Browser clients download only the model direction they request. Temporary use can stream from the origin. **Save offline** stores only the model, tokenizer, and runtime files in Cache Storage. When OCR is needed offline, first load its selected OCR language through a real recognition run. Cached application assets and model files are subject to browser storage eviction.

## Transfer and retention

Model asset requests use validated, same-origin paths. Model input is sent to a local dedicated Web Worker. PDFs, images, OCR text, translations and glossary terms stay in memory in the active tab. The app's model cache stores no document contents. Closing the tab or reloading drops the working session. The site hosts weights and code, with local processing on the device. Optional files exported by the user remain in the destination they choose.

## Output behavior

- PDF native extraction keeps source page numbers and block positions. A low-text page or a PDF containing a corrupted character map can fall back to local OCR. A manual OCR-all option handles mixed pages when native extraction omits text embedded in images.
- PDF layout inference uses geometry to detect paragraphs, simple headings, two columns, lists, and repeated aligned table rows. Complex forms and arbitrary table merges can require correction. Reflow exports text only, and the position-preserving mode approximates block placement with reflow when the text would overlap.
- The PDF download uses a 180 DPI browser-shaped visual layer plus a Unicode search layer using the self-hosted Noto Sans and Noto Sans Devanagari TrueType files embedded using fontkit, with explicit ToUnicode mappings. Text can be selected and copied. The PDF does not contain vector text for the visible layer. HTML uses embedded fonts and real DOM text. TXT contains corrected Unicode text.
- Image replacement keeps the original OCR line boxes for masking, merges neighboring lines for translation context, samples the surrounding flat color where reliable, and fits translated text inside the original region. When that approach cannot reconstruct the background, it uses a solid panel. It does not perform generative inpainting. Overlay and comparison exports preserve access to the original image. Image/PDF output contains pixels. TXT contains selectable text.
- PNG and supported browser JPEG output carry DPI metadata. Image PDF physical page dimensions use the selected resolution. WebP reports the equivalent print dimensions. An upscale increases pixel count without recovering detail.
- OCR confidence is a recognition score. Translation quality depends on source quality and domain. Review text, especially numbers, names, context and negation. URLs, email addresses, common technical identifiers, dates and explicit glossary terms are preserved as literal segments. Preserving literals can make nearby phrasing less fluent.
- Limits are 36 MB for PDF input, 12 selected source pages, 36 exported pages, 20 MB for image input, and 200 text blocks or 48,000 characters per extracted session. The model runs in a separate browser worker with cancellation. Older devices can run out of memory.

## Checks

Automated translation tests use generated multi-page PDFs, a PDF with Unicode Hindi text, scanned PDF pages, and printed-image samples. Covered workflows include both directions, negation, reference identifiers, tables, mixed English–Hindi Unicode copy, editing, PNG/JPEG/PDF exports, responsive mobile sizing, model removal, and offline model inference. A network test checks request origins and bodies and that user text remains outside persistent browser storage.

### Previous release results

The production build passed 20 unit tests and 22 Chromium browser tests. A generated translated PDF was visually checked and its Unicode text was independently extracted with PDF.js and Poppler. The test samples covered matras, conjuncts, half letters, Devanagari with English and digits, and a translated table. Offline inference was verified after saving a model, and a mobile-width viewport was tested through image download. Physical mobile hardware and translation directions beyond English and Hindi were outside this verification.
