# Background-removal repair checkpoint

Implementation was written and tested in the workspace, then the execution environment became unavailable before source publication or native rebuild. The live website and v1.0.0 installers still use the preceding implementation.

## Verified before interruption

- 82 Vitest tests across 17 files passed.
- TypeScript and production build passed.
- Xenova/modnet quantized model actually executed with ONNX Runtime WASM and returned finite [1,1,512,512] output.
- Downloaded revision fa2fa546052fba4c08921230a26cc69a333fca12, model size 6,632,188 bytes, SHA256 92e49898c3e05a6d7a944fc67a8cb87c4aad754ffb6ebd949528c7d1105fee3a.
- Published model processor uses RGB / 127.5 - 1, mean/std 0.5. Dynamic input height/width padded to multiples of 32; pad is cropped from the predicted matte.
- Guided GrabCut tests verified foreground/background seeds and untouched source RGB.

## Root issues

The previous worker depended on location.origin, which is null for custom tauri:// origins, and assumed Cache API availability. Its model/runtime lived in separate directories, and service-worker /libs enumeration omitted nested directories. A relative ./libs URL against a nested tool page would also target the wrong folder.

## Workspace changes requiring recovery and publication

Project path /workspace/scratch/0e34d95a08b9/docreadyapp/.sites-checkout.

Modified files include .gitignore, scripts/background-assets.mjs, scripts/background-source.mjs, scripts/release.mjs, public/_headers, src/lib/segment-small.ts, src/lib/background-removal.ts, src/lib/background-removal.worker.ts, src/lib/opencv-worker.ts, src/features/BackgroundRemoval.tsx, src/features/advanced/PhotoStudio.tsx and src/styles.css.

New files include src/lib/background-paths.ts, src/lib/cutout-mask.ts, src/lib/cutout-refine.ts, src/features/background/MaskEditor.tsx, tests/background-cutout.test.ts and public/libs/bg-remover/{model_quantized.onnx,ort.min.js,ort-wasm-simd-threaded.mjs,ort-wasm-simd-threaded.wasm,manifest.json,Apache-2.0.txt}.

The worker returns a separate pure alpha PNG for editing, composites against original full-resolution RGB, releases sessions/tensors/canvases, and opens explicit manual editing if AI initialization fails. The editor has Keep/Erase pointer brushes, keyboard stamping, Undo, brush size, feathered GrabCut refinement, explicit apply, and output blocking while unapplied changes exist. PNG/solid color/Vault actions use the approved result.

The version-matched ORT WASM binary is 14,264,838 bytes. Use the current onnxruntime-web dependency's expected filenames, not obsolete ort-wasm-simd.wasm names. Runtime and model must be committed as actual binary blobs and bundled. GitHub binary model upload may have completed before the orchestration runtime reset, but no corresponding commit was created. Recreating a content-addressed blob is idempotent.

## Remaining verification

Source recovery, final asset audit, committed native assets, browser visual workflows, fresh offline native/WebView checks, native installers and deployment are pending. No new release or website fix has been claimed. Preserve the user's subsequent SECURITY.md commit on main.
