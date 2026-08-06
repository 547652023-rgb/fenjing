# Storyboard Production Workflow Roadmap

> **For agentic workers:** Treat this as the product roadmap for the storyboard platform. Implement phases in order; each phase must pass its stated acceptance checks before the next phase begins.

**Goal:** Evolve the current editable storyboard table into a production workflow spanning storyboard creation, review, shoot planning, and call sheets.

**Product direction:** Retain the established cinematic studio visual system (ink black, warm white, champagne copper, wine red). Borrow the reference platform's interaction model—not its yellow visual identity: rapid table entry, scene grouping, nearby view controls, and production-oriented handoff.

**Current foundation:** The app already supports projects, custom fields, image cells, image upload, drag sorting, per-project templates, realtime collaboration, roles, and Excel/PDF export. The roadmap extends these capabilities rather than replacing them.

---

## Phase 1 — Faster storyboard entry

### 1. Batch selection and actions

**Outcome:** A producer can act on many shots without repeating row-level operations.

**Interaction steps:**

1. Add a checkbox to the sticky left table column and a select-all checkbox in the header.
2. Selecting one or more shots reveals a contextual batch bar above the table: selected count, copy, delete, move to scene, set field, and clear selection.
3. Copy creates a new sequence immediately after the last selected shot. Copy all non-image values, but clear image values.
4. Set field opens one compact panel: choose a visible editable field, enter or choose a value, preview the selected-shot count, then apply.
5. Delete always requires confirmation that states the exact number of shots to be removed.
6. Clear selection returns the workbench to its normal toolbar.

**Acceptance checks:**

- Selecting ten shots and copying creates ten new shots in the same order.
- Image fields are blank on copied shots.
- A batch update changes only the chosen field on the selected shots.
- A cancellation never mutates the project.

### 2. Efficient shot creation

**Outcome:** A user can create a run of empty shots or a derivative shot in one action.

**Interaction steps:**

1. Change the primary "新增镜头" control into a split button.
2. Keep the main action as "新增 1 个镜头".
3. Place these actions in the adjacent menu: 新增 5 个镜头, 新增 10 个镜头, 在当前镜头下方新增, 复制当前镜头, 新增场次.
4. Auto-number every new shot; preserve the user's visible sort order.
5. When inserting from a row or the batch bar, focus the first editable text/select cell in the first created shot.

**Acceptance checks:**

- Adding five shots needs one confirmation click after opening the menu.
- A copied shot retains text/select values but not uploaded images.
- Newly inserted shots appear directly after their source row.

### 3. Compact row controls and keyboard support

**Outcome:** The table stays quiet and readable even at high shot counts.

**Interaction steps:**

1. Retain the drag handle in the sticky action cell.
2. Replace the visible up/down/delete button cluster with one "更多" menu.
3. Include: 在上方新增, 在下方新增, 复制镜头, 移动到场次, 上移, 下移, 删除镜头.
4. Use the wine-red destructive treatment only for delete.
5. Support contextual keyboard actions: Cmd/Ctrl+D for duplicate, Cmd/Ctrl+Enter for insert below, and Delete/Backspace for deleting selected shots after confirmation.
6. Provide accessible names and visible focus states for every menu item and shortcut target.

**Acceptance checks:**

- The sticky action column contains only selection, drag, and more controls.
- All previous reorder and delete behavior remains available.
- Keyboard actions never fire while a text input is actively editing a value.

---

## Phase 2 — Scene-based production structure

### 4. Scene groups and shot assignment

**Outcome:** Shots can be understood as scenes from the script, not only as a flat numbered list.

**Interaction steps:**

1. Introduce scene records separate from shot records.
2. Render a distinct scene header row before its shots, with scene number, scene name, INT/EXT, DAY/NIGHT, target duration, shoot date, and notes.
3. Allow scenes to collapse and expand; show their shot count and planned duration while collapsed.
4. Add "未分组镜头" for shots without a scene.
5. Enable assigning selected shots to a scene from the batch bar and moving one shot from its row menu.
6. When deleting a scene, offer: delete scene and its shots, or delete the scene only and move its shots to ungrouped.

**Acceptance checks:**

- A project can contain grouped and ungrouped shots at the same time.
- Collapsing a scene never removes its shots or changes export order.
- Moving a shot between scenes preserves all values and images.
- Scene deletion always makes the treatment of child shots explicit.

### 5. Project production summary and filters

**Outcome:** A user knows the scale and readiness of the project within seconds.

**Interaction steps:**

1. Add a compact summary below the project title: scene count, shot count, frames supplied, estimated runtime, pending shots, completed shots.
2. Add a status field when it does not already exist, with at least: 待制作, 待拍, 拍摄中, 已完成, 需修改.
3. Make summary values clickable filters.
4. Keep active filters visible as removable chips above the table.
5. Show an explicit empty result state with a "清除筛选" action.

**Acceptance checks:**

- Clicking "待拍" shows only shots with that status.
- All summary counts recalculate after edits, additions, deletions, and realtime changes.
- Export defaults to the current project order, not a temporary filtered subset, unless the user explicitly chooses "导出当前筛选".

---

## Phase 3 — Role-specific workbench views

### 6. Nearby column controls and saved views

**Outcome:** Directors, producers, and cinematographers can use the same project without drowning in irrelevant columns.

**Interaction steps:**

1. Add a "列设置" control at the table toolbar, rather than hiding all configuration in the project settings modal.
2. Support show/hide, drag ordering, column width, and sticky/fixed-column choices.
3. Add named views: 导演视图, 制片视图, 摄影视图.
4. Allow each member to save a personal view without changing colleagues' views.
5. Let project owners select one default project view.
6. Preserve the existing fields/settings dialog as the place to create and manage data definitions; use the new control for presentation only.

**Acceptance checks:**

- A user can switch from director to producer view without altering project fields.
- Personal display preferences do not trigger a shared realtime project change.
- The owner-defined default applies only when a member has no personal preference.

### 7. Frame review and storyboard view

**Outcome:** Visual stakeholders can review frames without reading a dense production table.

**Interaction steps:**

1. Add a "故事板" view next to the workbench view.
2. Render a card per shot with hero frame, shot number, scene, shot size, duration, content summary, and status.
3. Add a frame lightbox with previous/next navigation and the associated shot information.
4. Support review states: 已确认 and 需修改; surface a clear status on the card and in the table.
5. Provide a read-only review mode or shareable link that hides structural settings and destructive actions.
6. Support thumbnail sizing, aspect-ratio preview, and contain/cover fitting as per-user view settings.

**Acceptance checks:**

- Storyboard card order matches the workbench order and scene grouping.
- A review-state change is visible in both views immediately.
- The read-only experience cannot edit fields, images, order, or project metadata.

---

## Phase 4 — Production delivery

### 8. Shoot plan

**Outcome:** The project can turn selected storyboard data into a practical shooting plan.

**Interaction steps:**

1. Add a "拍摄计划" workspace tab.
2. Aggregate scenes and shots by planned shooting day, not only story order.
3. Show scene, shot count, planned duration, location, cast, props, equipment, and status.
4. Let a producer change a shoot-day assignment without changing the story's scene/shot order.
5. Keep every planned item linked to its source scene/shot; opening an item returns to the workbench row.

**Acceptance checks:**

- A scene can be scheduled for a shoot day independently of its script order.
- Changes to a shot's production data are reflected in the shoot plan.
- Moving a plan item does not reorder the storyboard.

### 9. Call sheets and delivery history

**Outcome:** The platform can publish the daily operational document used by the crew.

**Interaction steps:**

1. Add a "拍摄通告" workspace tab.
2. Create a call sheet from one shoot day, including date, call time, location, contact, scenes/shots, cast calls, equipment, props, and safety/production notes.
3. Export PDF and Excel from the existing delivery room; offer a read-only sharing link if external hosting permissions allow it.
4. On publish, create an immutable version entry with publisher, timestamp, and version number.
5. Clearly label superseded call-sheet versions; never silently overwrite a published document.

**Acceptance checks:**

- A call sheet reflects the selected shoot day's latest plan at generation time.
- Published versions remain viewable after later edits.
- PDF/Excel exports identify the project, date, and call-sheet version.

---

## Implementation order

1. Batch selection and actions.
2. Fast multi-shot creation.
3. Compact row menu and keyboard support.
4. Scene groups and assignment.
5. Production summary and filters.
6. Column controls and saved views.
7. Storyboard review view.
8. Shoot plan.
9. Call sheets and delivery history.

## Release gates

- **After items 1–3:** Release as “fast storyboard entry.”
- **After items 4–5:** Release as “scene-based storyboard production.”
- **After items 6–7:** Release as “director and client review workspace.”
- **After items 8–9:** Release as “production planning and call-sheet workflow.”

## Non-negotiable product rules

- Preserve the existing cinematic studio palette; do not adopt the reference product's yellow-and-white visual identity.
- Every mutation must retain the current autosave, realtime-conflict, role, and export guarantees.
- New views must work with existing templates and existing projects; migrations must provide safe defaults.
- Create tests before each behavior change, including keyboard operation, destructive-action confirmation, role restrictions, and export order.
- Verify desktop and narrow-screen usability before every release gate.
