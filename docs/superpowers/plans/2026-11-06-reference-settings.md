# Reference settings completion plan

**Goal:** Complete the six approved settings gaps observed in 闪电分镜 project111, preserving existing editing and reliable delivery behavior.

**Spec:** The user's “修改吧” approves the preceding six-item comparison; prior authorization covers branch, per-step tests, merge, push and deployment. Baseline `93058c3`.

**Architecture:** Reuse React/TypeScript and the incumbent controls. Table display settings are personal per-project preferences in guarded localStorage; shared project aspect ratio remains the gateway-persisted value. No new dependencies or database schema. Independent export work may proceed in parallel with disjoint file ownership.

## Behavior decisions
- Project ratio drives image-cell geometry and preparation of new frame uploads; reference images retain original bytes. Validate numerical ratio syntax; support all observed preset ratios and custom positive ratios. Existing already-cropped files cannot be reconstructed.
- Table settings: text size small/medium/large (14/16/18px), alignment centered/left/upper-left and image fit contain/cover. Keep current centered/contain defaults. Reopen restores preferences; unavailable or invalid storage falls back safely.
- Put display controls in a compact “分镜设置” disclosure next to existing table controls. Aspect ratio links to the existing shared project setting in online workbench, avoiding duplicate unsaved metadata.
- Reference export was inspected again: max14 → max4 produces 镜号/画面/参考/其他, combining overflow fields into labeled details. Match that grouping rather than truncating fields. Preserve overflow images and long/multiline text. Default unset max keeps existing exports unchanged; UI offers no limit or 4–14 columns.
- Header/navigation color: offer accessible dark colors (existing green default, black, navy, burgundy) with white labels. Apply to PDF and Excel headers. Include settings in preview identity; preview and downloaded bytes remain identical.

## Tasks and verification
1. [x] Image ratio: failing geometry/upload regressions, generalized positive ratio crop, valid presets/custom handling, ImageCell props and table linkage; test portrait/square/cinematic, invalid/legacy ratios, original reference files and bounded decoding.
2. [ ] Table text size: failing UI preference/remount test; guarded per-project storage and control; verify real cell styles, independent PDF text size and full-text modal behavior.
3. [ ] Alignment: failing centered/left/upper-left test; apply horizontal and vertical positioning to plain/multiline fields, keep expanded editor readable; verify long text is not clipped.
4. [ ] Image fit: failing contain/cover switch test; link CSS to preferences for all image cells, persisted and isolated by project.
5. [ ] Export maximum columns: fail tests first; group overflow labeled fields and images into other while preserving order/data and pagination; PDF preview/actual file and Excel export tests.
6. [ ] Export header color: fail tests first; color validation/normalization, PDF/Excel header rendering and UI; preview invalidation and cancellation regression tests.

## Review focus
- Non-16:9 project switching must change the actual image slot and new uploads; malformed historical ratios must not produce broken CSS or huge canvases.
- Storage failure/corruption must not interrupt editing; preferences must not leak between projects.
- A long cell must remain editable/scrollable in every alignment and font size, with existing clipboard and undo behavior preserved.
- Column grouping must not silently lose overflow images, labels, zero values, empty rows, or long text; preserve shot identity and image failure reporting.
- Preview settings changes must invalidate old downloads without breaking Excel/PDF cancellation, retry, Logo and same-Blob acceptance.

## Delivery
- [ ] Per-task test results recorded below; full suite and production build.
- [ ] Fresh independent whole-branch review and any meaningful findings fixed with regression tests.
- [ ] Merge/push, successful Pages deployment, online settings and exported-artifact checks.

## Results
- Branch `feature/storyboard-reference-settings` from `93058c3`; baseline 47 files / 373 tests passed.

- Task1 RED: portrait upload still cropped16:9, ratio slots unchanged, invalid ratios accepted. GREEN: 5 files / 93 tests passed. New frame processing and table previews follow ratio; malformed legacy ratios display16:9 safely; reference bytes preserved.
