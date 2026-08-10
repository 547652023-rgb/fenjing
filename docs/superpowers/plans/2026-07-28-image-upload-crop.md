# 16:9 图片上传与裁切 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make storyboard frame uploads crop and compress to 16:9 before storage and display useful upload failures.

**Architecture:** A focused image preparation module normalizes selected and dropped files. `ImageCell` uses it before either local serialization or online upload, while styles lock frame cards to 16:9.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Canvas API.

## Global Constraints

- Frame fields accept at most five images; reference fields accept one image.
- Frame previews use 16:9 center crop and must fit their list cell.
- Storage remains private and only receives browser-processed JPEG files.

---

### Task 1: Normalize frame files before upload

**Files:**
- Create: `src/images/prepareStoryboardImage.ts`
- Create: `src/images/prepareStoryboardImage.test.ts`

- [ ] Write a failing test for a landscape source resulting in a JPEG named with `.jpg`.
- [ ] Run `pnpm test -- --run src/images/prepareStoryboardImage.test.ts` and observe failure.
- [ ] Implement center-crop canvas encoding at a 16:9 aspect ratio with 1920px maximum edge.
- [ ] Run the focused test and confirm it passes.

### Task 2: Use normalized files in image cells

**Files:**
- Modify: `src/components/ImageCell.tsx`
- Modify: `src/components/OnlineImageCell.test.tsx`

- [ ] Write a failing online-image test asserting the upload callback receives a JPEG output file.
- [ ] Run `pnpm test -- --run src/components/OnlineImageCell.test.tsx` and observe failure.
- [ ] Normalize accepted frame files before `onUpload`, and surface gateway error codes in the retry message.
- [ ] Run the focused test and confirm it passes.

### Task 3: Enforce 16:9 frame preview cards

**Files:**
- Modify: `src/styles.css`
- Modify: `src/components/OnlineImageCell.test.tsx`

- [ ] Write a failing test exposing frame-preview markup for 16:9 styling.
- [ ] Add a frame-only preview class and CSS `aspect-ratio: 16 / 9` with cover cropping.
- [ ] Run `pnpm test -- --run`, `pnpm build`, then commit only files from these tasks.
