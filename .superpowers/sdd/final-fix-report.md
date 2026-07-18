# Final Export Review Fix Report

Date: 2026-07-18

## Scope and implementation

- PDF: replaced fixed-height/truncating body rows with measured variable-height rows and continuation segments. The renderer sets the 14px Chinese body font before `measureText`, repeats title/header on every continuation page, draws every wrapped line, and keeps the existing 1123x794 canvas plus A4-landscape 842x595 PDF MediaBox.
- XLSX failed images: every original image position now produces one drawing/media slot. Failed loads use a browser-Canvas PNG tile containing `图片加载失败`; successful neighbors retain their original width and order. The placeholder factory is injected in package tests.
- XLSX upload formats: PNG/JPEG/GIF remain embedded directly. Other browser-decodable `image/*` blobs (including WebP/AVIF/SVG when supported by the browser decoder) go through `createImageBitmap` and Canvas PNG transcoding. Fetch, decoder, and canvas primitives are injectable; the WebP regression exercises the full path.
- Utilities: export filenames use local calendar getters; downloads attach/remove the anchor and defer object-URL revocation; ZIP local/central headers use the valid 1980-01-01 DOS epoch.
- Assertions: PDF tests now validate xref object offsets, exact JPEG stream inclusion, A4 dimensions, and the empty-project title/header page. ZIP tests parse EOCD counts/size/offset and central/local timestamp fields.

No package or lockfile changes were made. No runtime dependency, CDN, server, or background export service was added.

## TDD red-green evidence

The first `pnpm test` attempt did not reach Vitest because the managed pnpm wrapper tried to reconcile `node_modules` via the unavailable registry and refused a non-TTY purge. All test and compiler runs below therefore use the already-installed repository-local Vitest/TypeScript packages with the managed Node binary; the dependency graph was not changed.

Common Vitest prefix:

```sh
/Users/anshandapaidangmacm4/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/.pnpm/vitest@4.1.10_jsdom@29.1.1_vite@8.1.4/node_modules/vitest/vitest.mjs
```

1. PDF long-content regression

```sh
<vitest-prefix> --run src/export/pdfExport.test.ts
```

- RED: 1 failed / 5; expected multiple pages, received 1 (the old renderer also drew only the first body line).
- GREEN after continuation layout: 5 passed / 5.
- Final strengthened PDF suite: 6 passed / 6.

2. XLSX mixed success/failure slot regression

```sh
<vitest-prefix> --run src/export/excelExport.test.ts
```

- RED: 1 failed / 4; actual start offsets were `[0, 1090612]`, proving the failed middle slot was removed and the two successes expanded.
- GREEN after placeholder embedding: 4 passed / 4, with offsets `[0, 727075, 1454150]` and placeholder media at `image2.png`.

3. WebP transcode regression

```sh
<vitest-prefix> --run src/export/excelExport.test.ts
```

- RED: 1 failed / 5; the WebP path produced injected failure bytes instead of Canvas PNG bytes.
- GREEN after injected fetch/decode/canvas transcode: 5 passed / 5.
- Final strengthened XLSX suite, including the default Chinese Canvas placeholder and valid PNG media: 6 passed / 6.

4. Local calendar filename regression

```sh
<vitest-prefix> --run src/export/storyboardExport.test.ts
```

- RED: expected `2026-01-02`, received UTC-derived `2026-01-01`.
- GREEN: 4 passed / 4 using `getFullYear`, `getMonth`, and `getDate`.

5. Download lifecycle regression

```sh
<vitest-prefix> --run src/export/download.test.ts
```

- RED: anchor was detached while `click()` ran; revocation was synchronous.
- GREEN: 1 passed / 1; anchor is attached during click, removed afterward, and URL revocation occurs after timers advance.

6. ZIP DOS epoch/EOCD regression

```sh
<vitest-prefix> --run src/export/zip.test.ts
```

- RED: local DOS date was `0`, expected valid epoch `0x0021`.
- GREEN: 2 passed / 2; both local and central dates are 1980-01-01 and EOCD boundaries/counts are self-consistent.

## Final commands and results

Focused exporter/model/download/ZIP/action tests:

```sh
/Users/anshandapaidangmacm4/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/.pnpm/vitest@4.1.10_jsdom@29.1.1_vite@8.1.4/node_modules/vitest/vitest.mjs --run src/export/storyboardExport.test.ts src/export/excelExport.test.ts src/export/pdfExport.test.ts src/export/download.test.ts src/export/zip.test.ts src/export/ExportActions.test.tsx
```

Result: exit 0; 6 test files passed; 21 tests passed.

Full Vitest:

```sh
/Users/anshandapaidangmacm4/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/.pnpm/vitest@4.1.10_jsdom@29.1.1_vite@8.1.4/node_modules/vitest/vitest.mjs --run
```

Result: exit 0; 23 test files passed; 84 tests passed.

TypeScript:

```sh
/Users/anshandapaidangmacm4/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/.pnpm/typescript@7.0.2/node_modules/typescript/bin/tsc --noEmit
```

Result: exit 0; no diagnostics.

Diff hygiene:

```sh
git diff --check
```

Result: exit 0; no whitespace errors.

## Self-review

- Important finding 1: all wrapped text lines are represented in `cellLines`; oversized rows are split until `lineOffset === maximumLineCount`; rendering no longer uses `slice(0, maxLines)`. The long-content test compares all 80 source lines in order across multiple returned JPEG pages and verifies the font at every measurement.
- Important finding 2: `cellImages` now receives either the loaded image or a generated placeholder for every source image. Slot width uses that preserved original count, and media/relationship numbering follows source order. Mixed-slot tests verify anchors, bytes, and visible fallback text.
- Important finding 3: only OOXML-native PNG/JPEG/GIF bypass Canvas. Other formats are decoded from Blob and normalized to PNG with injected browser primitives; WebP is covered. Undecodable data still follows the per-slot failure behavior without aborting the workbook.
- Existing constraints: A4 dimensions remain 842x595; the existing SpreadsheetML control escaping is unchanged and still tested; `buildExportModel` image caps remain frame=5/reference=1; `exportStoryboardExcel` and `exportStoryboardPdf` integration signatures are unchanged; empty projects retain headers/title; no project data is mutated.
- PDF encoding: xref offsets point to all five object headers in the one-page regression, the JPEG byte sequence is present inside a DCT stream with the correct length, and `startxref` points to the xref keyword.
- ZIP: deterministic stored mode and UTF-8 flags remain unchanged; the new epoch is deterministic and specification-valid.
- Download: the URL always receives deferred cleanup from `finally`, including when anchor clicking throws.
- Concern: transcoding depends on the browser being able to decode the specific uploaded `image/*` blob through `createImageBitmap`; formats the browser itself cannot decode intentionally become the visible per-slot failure tile. This preserves the non-fatal export contract.
