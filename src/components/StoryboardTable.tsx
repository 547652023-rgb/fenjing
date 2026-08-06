import { Fragment, useEffect, useRef, useState } from "react";
import {
  addShot,
  assignShotsToScene,
  createScene,
  deleteScene as deleteLocalScene,
  deleteShot,
  getProductionSummary,
  moveShot,
  PRODUCTION_STATUS_OPTIONS,
  toggleSceneCollapsed,
  updateShotValue,
  type FieldDefinition,
  type ProductionStatus,
  type ProjectUpdate,
  type StoryboardProject,
} from "../domain/storyboard";
import { ImageCell } from "./ImageCell";
import { EditableSelect } from "../workbench/EditableSelect";
import type { RemoteImage } from "../domain/models";

export type StoryboardImageActions = {
  upload: (
    shotId: string,
    fieldId: string,
    currentImages: RemoteImage[],
    files: File[],
  ) => Promise<RemoteImage[]>;
  remove: (
    shotId: string,
    fieldId: string,
    currentImages: RemoteImage[],
    image: RemoteImage,
  ) => Promise<void>;
};

export type ShotCreationOptions = {
  count: number;
  afterShotId?: string;
  beforeShotId?: string;
  copyShotId?: string;
};

type StoryboardTableProps = {
  project: StoryboardProject;
  onChange: (update: ProjectUpdate) => void;
  imageActions?: StoryboardImageActions;
  onBatchCopy?: (shotIds: string[]) => void | Promise<void>;
  onBatchDelete?: (shotIds: string[]) => void | Promise<void>;
  onBatchUpdate?: (
    shotIds: string[],
    fieldId: string,
    value: string,
  ) => void | Promise<void>;
  onCreateShots?: (
    options: ShotCreationOptions,
  ) => void | string[] | Promise<void | string[]>;
  onCreateScene?: () => void | Promise<void>;
  onUpdateScene?: (scene: StoryboardProject["scenes"][number]) => void | Promise<void>;
  onDeleteScene?: (
    sceneId: string,
    treatment: "ungroup" | "delete-shots",
  ) => void | Promise<void>;
  onAssignShotsToScene?: (
    shotIds: string[],
    sceneId: string | null,
  ) => void | Promise<void>;
};

export function parseRemoteImages(value: string): RemoteImage[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((image): image is RemoteImage =>
      Boolean(
        image &&
          typeof image === "object" &&
          "path" in image &&
          typeof image.path === "string" &&
          "url" in image &&
          typeof image.url === "string" &&
          "name" in image &&
          typeof image.name === "string" &&
          "position" in image &&
          typeof image.position === "number",
      ),
    );
  } catch {
    return [];
  }
}

function inputTypeFor(field: FieldDefinition): "date" | "number" | "text" {
  if (field.type === "date" || field.type === "number") {
    return field.type;
  }

  return "text";
}

function columnWidth(field: FieldDefinition): string {
  if (field.id === "frame") {
    return "44rem";
  }

  const typeMinimum = field.type === "image" ? 18 : field.type === "number" ? 10 : 14;
  return `${Math.max(typeMinimum, field.label.length * 2 + 4)}rem`;
}

export function StoryboardTable({
  project,
  onChange,
  imageActions,
  onBatchCopy,
  onBatchDelete,
  onBatchUpdate,
  onCreateShots,
  onCreateScene,
  onUpdateScene,
  onDeleteScene,
  onAssignShotsToScene,
}: StoryboardTableProps) {
  const [draggedShotId, setDraggedShotId] = useState<string | null>(null);
  const [selectedShotIds, setSelectedShotIds] = useState<string[]>([]);
  const [batchFieldId, setBatchFieldId] = useState("");
  const [batchFieldValue, setBatchFieldValue] = useState("");
  const [batchSceneId, setBatchSceneId] = useState("");
  const [isCreationMenuOpen, setIsCreationMenuOpen] = useState(false);
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const [openRowMenuShotId, setOpenRowMenuShotId] = useState<string | null>(null);
  const [focusShotId, setFocusShotId] = useState<string | null>(null);
  const [sceneEditorId, setSceneEditorId] = useState<string | null>(null);
  const [rowScenePickerShotId, setRowScenePickerShotId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ProductionStatus | null>(null);
  const [coverageFilter, setCoverageFilter] = useState<"frames" | "pending" | "completed" | null>(null);
  const editableCellRefs = useRef(new Map<string, HTMLElement>());
  const visibleFields = project.fields
    .filter((field) => field.visible)
    .sort((left, right) => left.order - right.order);
  const batchFields = visibleFields.filter(
    (field) => field.type !== "image" && field.id !== "shotNumber",
  );
  const summary = getProductionSummary(project);
  const filteredShots = project.shots.filter((shot) => {
    const status = shot.values.productionStatus || "待制作";
    if (statusFilter && status !== statusFilter) return false;
    if (coverageFilter === "frames") return Boolean(shot.values.frame?.trim());
    if (coverageFilter === "completed") return status === "已完成";
    if (coverageFilter === "pending") return status !== "已完成";
    return true;
  });
  const allSelected =
    filteredShots.length > 0 && filteredShots.every((shot) => selectedShotIds.includes(shot.id));
  const scenesById = new Map(project.scenes.map((scene) => [scene.id, scene]));
  const sceneShotIds = new Map<string, string>();
  const sceneShotCounts = new Map<string, number>();
  let firstUngroupedShotId: string | null = null;
  let ungroupedShotCount = 0;
  filteredShots.forEach((shot) => {
    if (shot.sceneId && scenesById.has(shot.sceneId)) {
      if (!sceneShotIds.has(shot.sceneId)) sceneShotIds.set(shot.sceneId, shot.id);
      sceneShotCounts.set(shot.sceneId, (sceneShotCounts.get(shot.sceneId) ?? 0) + 1);
      return;
    }
    if (!firstUngroupedShotId) firstUngroupedShotId = shot.id;
    ungroupedShotCount += 1;
  });

  useEffect(() => {
    setSelectedShotIds((current) =>
      current.filter((shotId) => filteredShots.some((shot) => shot.id === shotId)),
    );
  }, [project.shots]);

  useEffect(() => {
    if (!focusShotId) return;
    editableCellRefs.current.get(focusShotId)?.focus();
    setFocusShotId(null);
  }, [focusShotId, project.shots]);

  function toggleShotSelection(shotId: string, selected: boolean) {
    setSelectedShotIds((current) =>
      selected
        ? [...current, shotId]
        : current.filter((candidate) => candidate !== shotId),
    );
  }

  function applyBatchFieldValue() {
    if (!batchFieldId || selectedShotIds.length === 0) return;
    if (onBatchUpdate) {
      void onBatchUpdate(selectedShotIds, batchFieldId, batchFieldValue);
      return;
    }
    onChange((latestProject) =>
      selectedShotIds.reduce(
        (nextProject, shotId) =>
          updateShotValue(nextProject, shotId, batchFieldId, batchFieldValue),
        latestProject,
      ),
    );
  }

  function assignShots(shotIds: string[], sceneId: string | null) {
    if (shotIds.length === 0) return;
    if (onAssignShotsToScene) {
      void onAssignShotsToScene(shotIds, sceneId);
      return;
    }
    onChange((latestProject) => assignShotsToScene(latestProject, shotIds, sceneId));
  }

  function createNewScene() {
    setIsCreationMenuOpen(false);
    if (onCreateScene) {
      void onCreateScene();
      return;
    }
    onChange((latestProject) => createScene(latestProject));
  }

  function deleteSelectedShots() {
    if (selectedShotIds.length === 0) return;
    if (!window.confirm(`确定删除选中的 ${selectedShotIds.length} 个镜头吗？`)) return;
    if (onBatchDelete) {
      void onBatchDelete(selectedShotIds);
    } else {
      onChange((latestProject) =>
        selectedShotIds.reduce(
          (nextProject, shotId) => deleteShot(nextProject, shotId),
          latestProject,
        ),
      );
    }
    setSelectedShotIds([]);
  }

  function isEditingField(target: EventTarget | null) {
    if (target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
      return true;
    }
    if (!(target instanceof HTMLInputElement)) return false;
    return !["checkbox", "radio", "file", "button", "submit"].includes(target.type);
  }

  function moveShotByOffset(shotId: string, offset: number) {
    setOpenRowMenuShotId(null);
    onChange((latestProject) => {
      const index = latestProject.shots.findIndex((shot) => shot.id === shotId);
      if (index < 0) return latestProject;
      return moveShot(latestProject, shotId, index + offset);
    });
  }

  function deleteOneShot(shotId: string) {
    setOpenRowMenuShotId(null);
    if (!window.confirm("确定删除这个镜头吗？")) return;
    onChange((latestProject) => deleteShot(latestProject, shotId));
  }

  function handleTableKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (isEditingField(event.target)) return;
    if (!activeShotId) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
      event.preventDefault();
      void createShots({ count: 1, copyShotId: activeShotId });
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void createShots({ count: 1, afterShotId: activeShotId });
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selectedShotIds.length > 0) {
      event.preventDefault();
      deleteSelectedShots();
    }
  }

  async function createShots(options: ShotCreationOptions) {
    setIsCreationMenuOpen(false);
    if (onCreateShots) {
      const createdShotIds = await onCreateShots(options);
      if (createdShotIds?.[0]) setFocusShotId(createdShotIds[0]);
      return;
    }

    let nextProject = project;
    const sourceShotId = options.copyShotId ?? options.afterShotId;
    const sourceShot = sourceShotId
      ? project.shots.find((shot) => shot.id === sourceShotId)
      : undefined;
    const createdShotIds: string[] = [];
    for (let index = 0; index < options.count; index += 1) {
      nextProject = addShot(nextProject);
      const createdShot = nextProject.shots[nextProject.shots.length - 1];
      createdShotIds.push(createdShot.id);
      if (sourceShot && options.copyShotId) {
        Object.entries(sourceShot.values).forEach(([fieldId, value]) => {
          const field = project.fields.find((candidate) => candidate.id === fieldId);
          if (fieldId !== "shotNumber" && field?.type !== "image") {
            nextProject = updateShotValue(nextProject, createdShot.id, fieldId, value);
          }
        });
      }
    }
    if (sourceShotId || options.beforeShotId) {
      const insertionShotId = options.beforeShotId ?? sourceShotId;
      const sourceIndex = nextProject.shots.findIndex((shot) => shot.id === sourceShotId);
      const insertionIndex = options.beforeShotId
        ? nextProject.shots.findIndex((shot) => shot.id === insertionShotId)
        : sourceIndex + 1;
      createdShotIds.forEach((shotId, index) => {
        nextProject = moveShot(nextProject, shotId, insertionIndex + index);
      });
    }
    onChange(nextProject);
    if (createdShotIds[0]) setFocusShotId(createdShotIds[0]);
  }

  function renderSceneHeader(
    label: string,
    shotCount: number,
    sceneId?: string,
  ) {
    const scene = sceneId ? scenesById.get(sceneId) : undefined;
    const collapseLabel = scene?.collapsed ? `展开场次 ${scene.number}` : `收起场次 ${scene?.number}`;
    return (
      <tr
        aria-label={scene ? `场次 ${scene.number} ${scene.name}` : "未分组镜头"}
        className={`scene-group-row${scene ? "" : " scene-group-row--ungrouped"}`}
        key={`scene-header-${sceneId ?? "ungrouped"}`}
      >
        <td colSpan={visibleFields.length + 1}>
          <div className="scene-group-row__content">
            {scene ? (
              <button
                aria-label={collapseLabel}
                className="scene-group-row__toggle"
                type="button"
                onClick={() => {
                  const nextScene = { ...scene, collapsed: !scene.collapsed };
                  if (onUpdateScene) void onUpdateScene(nextScene);
                  else onChange((current) => toggleSceneCollapsed(current, scene.id));
                }}
              >
                <svg aria-hidden="true" viewBox="0 0 16 16">
                  <path d={scene.collapsed ? "M6 3l5 5-5 5" : "M3 6l5 5 5-5"} />
                </svg>
              </button>
            ) : null}
            <strong>{label}</strong>
            <span>{shotCount} 个镜头</span>
            {scene ? (
              <span className="scene-group-row__meta">
                {[scene.intExt, scene.dayNight, scene.targetDurationSeconds && `${scene.targetDurationSeconds} 秒`, scene.shootDate]
                  .filter(Boolean)
                  .join(" · ") || "待补充制作信息"}
              </span>
            ) : null}
            {scene ? (
              <button
                aria-label={`编辑场次 ${scene.number}`}
                className="scene-group-row__edit"
                type="button"
                onClick={() => setSceneEditorId(scene.id)}
              >
                编辑
              </button>
            ) : null}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <section
      className="storyboard-panel"
      aria-label="分镜表格区域"
      onKeyDown={handleTableKeyDown}
    >
      <div className="storyboard-toolbar">
        <p>{filteredShots.length === project.shots.length ? `${project.shots.length} 个镜头` : `显示 ${filteredShots.length} / ${project.shots.length} 个镜头`}</p>
        <div className="shot-creation-control">
          <button type="button" onClick={() => void createShots({ count: 1 })}>
            新增 1 个镜头
          </button>
          <button
            aria-expanded={isCreationMenuOpen}
            aria-haspopup="menu"
            aria-label="新增选项"
            className="shot-creation-control__toggle"
            type="button"
            onClick={() => setIsCreationMenuOpen((open) => !open)}
          >
            ▾
          </button>
          {isCreationMenuOpen ? (
            <div className="shot-creation-menu" role="menu">
              <button role="menuitem" type="button" onClick={() => void createShots({ count: 5 })}>
                新增 5 个镜头
              </button>
              <button role="menuitem" type="button" onClick={() => void createShots({ count: 10 })}>
                新增 10 个镜头
              </button>
              <button
                disabled={!activeShotId}
                role="menuitem"
                type="button"
                onClick={() => activeShotId && void createShots({ count: 1, afterShotId: activeShotId })}
              >
                在当前镜头下方新增
              </button>
              <button
                disabled={!activeShotId}
                role="menuitem"
                type="button"
                onClick={() => activeShotId && void createShots({ count: 1, copyShotId: activeShotId })}
              >
                复制当前镜头
              </button>
              <button role="menuitem" type="button" onClick={createNewScene}>
                新增场次
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <section aria-label="制作概览" className="production-summary">
        <div className="production-summary__metrics">
          <button type="button" onClick={() => { setStatusFilter(null); setCoverageFilter(null); }}>
            <span>场次</span><strong>{summary.sceneCount}</strong>
          </button>
          <button type="button" onClick={() => { setStatusFilter(null); setCoverageFilter(null); }}>
            <span>镜头</span><strong>{summary.shotCount}</strong>
          </button>
          <button type="button" onClick={() => { setStatusFilter(null); setCoverageFilter("frames"); }}>
            <span>已供画面</span><strong>{summary.framesSupplied}</strong>
          </button>
          <span className="production-summary__metric"><span>预计时长</span><strong>{summary.estimatedRuntimeSeconds} 秒</strong></span>
          <button type="button" onClick={() => { setStatusFilter(null); setCoverageFilter("pending"); }}>
            <span>待处理</span><strong>{summary.pendingShotCount}</strong>
          </button>
          <button type="button" onClick={() => { setStatusFilter(null); setCoverageFilter("completed"); }}>
            <span>已完成</span><strong>{summary.completedShotCount}</strong>
          </button>
        </div>
        <div aria-label="制作状态筛选" className="production-summary__statuses">
          {PRODUCTION_STATUS_OPTIONS.map((status) => (
            <button
              aria-pressed={statusFilter === status}
              className={statusFilter === status ? "is-active" : undefined}
              key={status}
              type="button"
              onClick={() => { setStatusFilter(status); setCoverageFilter(null); }}
            >
              {status} {summary.statusCounts[status]}
            </button>
          ))}
        </div>
      </section>
      {statusFilter || coverageFilter ? (
        <div aria-label="当前筛选" className="storyboard-filter-chips">
          <span>当前筛选</span>
          <button
            aria-label={`移除筛选 ${statusFilter ?? (coverageFilter === "frames" ? "已供画面" : coverageFilter === "completed" ? "已完成" : "待处理")}`}
            type="button"
            onClick={() => { setStatusFilter(null); setCoverageFilter(null); }}
          >
            {statusFilter ?? (coverageFilter === "frames" ? "已供画面" : coverageFilter === "completed" ? "已完成" : "待处理")} ×
          </button>
          <button type="button" onClick={() => { setStatusFilter(null); setCoverageFilter(null); }}>清除筛选</button>
        </div>
      ) : null}
      {selectedShotIds.length > 0 ? (
        <div aria-label="批量操作" className="storyboard-batch-bar" role="toolbar">
          <strong>已选择 {selectedShotIds.length} 个镜头</strong>
          <button
            type="button"
            onClick={() => onBatchCopy && void onBatchCopy(selectedShotIds)}
          >
            复制镜头
          </button>
          <label>
            <span className="sr-only">批量字段</span>
            <select
              aria-label="批量字段"
              value={batchFieldId}
              onChange={(event) => {
                setBatchFieldId(event.target.value);
                setBatchFieldValue("");
              }}
            >
              <option value="">选择字段</option>
              {batchFields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.label}
                </option>
              ))}
            </select>
          </label>
          <input
            aria-label="批量字段值"
            disabled={!batchFieldId}
            placeholder="输入字段值"
            value={batchFieldValue}
            onChange={(event) => setBatchFieldValue(event.target.value)}
          />
          <button disabled={!batchFieldId} type="button" onClick={applyBatchFieldValue}>
            应用字段值
          </button>
          <label>
            <span className="sr-only">归入场次</span>
            <select
              aria-label="归入场次"
              value={batchSceneId}
              onChange={(event) => setBatchSceneId(event.target.value)}
            >
              <option value="">选择场次</option>
              <option value="__ungrouped__">移出场次</option>
              {project.scenes.map((scene) => (
                <option key={scene.id} value={scene.id}>
                  场次 {scene.number} · {scene.name}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={!batchSceneId}
            type="button"
            onClick={() => {
              assignShots(selectedShotIds, batchSceneId === "__ungrouped__" ? null : batchSceneId);
              setBatchSceneId("");
            }}
          >
            归入场次
          </button>
          <button className="storyboard-batch-bar__delete" type="button" onClick={deleteSelectedShots}>
            删除镜头
          </button>
          <button type="button" onClick={() => setSelectedShotIds([])}>
            取消选择
          </button>
        </div>
      ) : null}
      <div className="storyboard-table-scroll">
        <table className="storyboard-table">
          <thead>
            <tr>
              <th className="sticky-shot-actions" scope="col">
                <input
                  aria-label="选择全部镜头"
                  checked={allSelected}
                  type="checkbox"
                  onChange={(event) =>
                    setSelectedShotIds(
                      event.target.checked ? filteredShots.map((shot) => shot.id) : [],
                    )
                  }
                />
              </th>
              {visibleFields.map((field) => (
                <th
                  className={field.id === "shotNumber" ? "sticky-shot-number" : undefined}
                  data-field-type={field.type}
                  key={field.id}
                  scope="col"
                  style={{ minWidth: columnWidth(field) }}
                >
                  {field.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredShots.map((shot) => {
              const shotIndex = project.shots.findIndex((candidate) => candidate.id === shot.id);
              const scene = shot.sceneId ? scenesById.get(shot.sceneId) : undefined;
              const isUngrouped = !scene;
              const showSceneHeader = scene && sceneShotIds.get(scene.id) === shot.id;
              const showUngroupedHeader = isUngrouped && firstUngroupedShotId === shot.id;
              return (
              <Fragment key={shot.id}>
                {showSceneHeader
                  ? renderSceneHeader(
                    `场次 ${scene.number} · ${scene.name}`,
                    sceneShotCounts.get(scene.id) ?? 0,
                    scene.id,
                  )
                  : null}
                {showUngroupedHeader
                  ? renderSceneHeader("未分组镜头", ungroupedShotCount)
                  : null}
                {scene?.collapsed ? null : <tr
                aria-label={`镜头 ${shot.id}`}
                onFocusCapture={() => setActiveShotId(shot.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggedShotId === null) {
                    return;
                  }
                  onChange((latestProject) => {
                    const targetIndex = latestProject.shots.findIndex(
                      (latestShot) => latestShot.id === shot.id,
                    );
                    return moveShot(latestProject, draggedShotId, targetIndex);
                  });
                  setDraggedShotId(null);
                }}
              >
                <td className="sticky-shot-actions shot-actions">
                  <input
                    aria-label={`选择镜头 ${shot.id}`}
                    checked={selectedShotIds.includes(shot.id)}
                    type="checkbox"
                    onChange={(event) => toggleShotSelection(shot.id, event.target.checked)}
                  />
                  <button
                    aria-label={`拖动镜头 ${shot.id}`}
                    className="shot-actions__drag"
                    draggable
                    title="拖动排序"
                    type="button"
                    onDragEnd={() => setDraggedShotId(null)}
                    onDragStart={() => setDraggedShotId(shot.id)}
                  >
                    ⋮⋮
                  </button>
                  <button
                    aria-expanded={openRowMenuShotId === shot.id}
                    aria-haspopup="menu"
                    aria-label={`更多镜头 ${shot.id}`}
                    className="shot-actions__more"
                    type="button"
                    onClick={() => setOpenRowMenuShotId((current) =>
                      current === shot.id ? null : shot.id,
                    )}
                  >
                    <svg aria-hidden="true" className="shot-actions__more-icon" viewBox="0 0 16 16">
                      <circle cx="3" cy="8" r="1" />
                      <circle cx="8" cy="8" r="1" />
                      <circle cx="13" cy="8" r="1" />
                    </svg>
                  </button>
                  {openRowMenuShotId === shot.id ? (
                    <div aria-label={`镜头 ${shot.id} 操作`} className="shot-actions__menu" role="menu">
                      <button role="menuitem" type="button" onClick={() => void createShots({ beforeShotId: shot.id, count: 1 })}>在上方新增</button>
                      <button role="menuitem" type="button" onClick={() => void createShots({ afterShotId: shot.id, count: 1 })}>在下方新增</button>
                      <button role="menuitem" type="button" onClick={() => void createShots({ copyShotId: shot.id, count: 1 })}>复制镜头</button>
                      <button
                        aria-expanded={rowScenePickerShotId === shot.id}
                        role="menuitem"
                        type="button"
                        onClick={() => setRowScenePickerShotId((current) => current === shot.id ? null : shot.id)}
                      >
                        移动到场次
                      </button>
                      {rowScenePickerShotId === shot.id ? (
                        <label className="shot-actions__scene-picker">
                          <span>选择场次</span>
                          <select
                            aria-label={`移动镜头 ${shot.id} 到场次`}
                            defaultValue={shot.sceneId ?? "__ungrouped__"}
                            onChange={(event) => {
                              assignShots([shot.id], event.target.value === "__ungrouped__" ? null : event.target.value);
                              setOpenRowMenuShotId(null);
                              setRowScenePickerShotId(null);
                            }}
                          >
                            <option value="__ungrouped__">未分组</option>
                            {project.scenes.map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>
                                场次 {candidate.number} · {candidate.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <button disabled={shotIndex === 0} role="menuitem" type="button" onClick={() => moveShotByOffset(shot.id, -1)}>上移</button>
                      <button disabled={shotIndex === project.shots.length - 1} role="menuitem" type="button" onClick={() => moveShotByOffset(shot.id, 1)}>下移</button>
                      <button className="shot-actions__menu-delete" role="menuitem" type="button" onClick={() => deleteOneShot(shot.id)}>删除镜头</button>
                    </div>
                  ) : null}
                </td>
                {visibleFields.map((field) => (
                  <td
                    className={
                      field.id === "shotNumber"
                        ? "sticky-shot-number"
                        : field.type === "image"
                          ? "image-table-cell"
                          : undefined
                    }
                    data-field-type={field.type}
                    key={field.id}
                  >
                    {field.type === "image" && imageActions ? (
                      <ImageCell
                        images={parseRemoteImages(shot.values[field.id] ?? "")}
                        label={`${field.label}-${shot.id}`}
                        maxImages={field.id === "frame" ? 5 : 1}
                        onUpload={(files) =>
                          imageActions.upload(
                            shot.id,
                            field.id,
                            parseRemoteImages(shot.values[field.id] ?? ""),
                            files,
                          )
                        }
                        onRemove={(image) =>
                          imageActions.remove(
                            shot.id,
                            field.id,
                            parseRemoteImages(shot.values[field.id] ?? ""),
                            image,
                          )
                        }
                      />
                    ) : field.type === "image" ? (
                      <ImageCell
                        label={`${field.label}-${shot.id}`}
                        maxImages={field.id === "frame" ? 5 : 1}
                        value={shot.values[field.id] ?? ""}
                        onChange={(value) =>
                          onChange((latestProject) =>
                            updateShotValue(latestProject, shot.id, field.id, value),
                          )
                        }
                      />
                    ) : field.type === "singleSelect" ? (
                      <EditableSelect
                        allowCustomValue={field.allowCustomValue ?? true}
                        label={`${field.label}-${shot.id}`}
                        options={field.options ?? []}
                        value={shot.values[field.id] ?? ""}
                        onChange={(value) =>
                          onChange((latestProject) =>
                            updateShotValue(
                              latestProject,
                              shot.id,
                              field.id,
                              value,
                            ),
                          )
                        }
                      />
                    ) : (
                      <input
                        aria-label={`${field.label}-${shot.id}`}
                        ref={(element) => {
                          if (field.id === "shotNumber") {
                            if (element) editableCellRefs.current.set(shot.id, element);
                            else editableCellRefs.current.delete(shot.id);
                          }
                        }}
                        type={inputTypeFor(field)}
                        value={shot.values[field.id] ?? ""}
                        onChange={(event) =>
                          onChange(
                            updateShotValue(project, shot.id, field.id, event.target.value),
                          )
                        }
                      />
                    )}
                  </td>
                ))}
              </tr>}
              </Fragment>
              );
            })}
            {filteredShots.length === 0 ? (
              <tr className="storyboard-empty-filter-state">
                <td colSpan={visibleFields.length + 1}>
                  <strong>没有符合当前筛选的镜头</strong>
                  <button type="button" onClick={() => { setStatusFilter(null); setCoverageFilter(null); }}>清除筛选</button>
                </td>
              </tr>
            ) : null}
            {(statusFilter || coverageFilter ? [] : project.scenes)
              .filter((scene) => !sceneShotIds.has(scene.id))
              .map((scene) => renderSceneHeader(`场次 ${scene.number} · ${scene.name}`, 0, scene.id))}
          </tbody>
        </table>
      </div>
      {sceneEditorId ? (() => {
        const scene = scenesById.get(sceneEditorId);
        if (!scene) return null;
        return (
          <form
            aria-label={`编辑场次 ${scene.number}`}
            className="scene-editor"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const nextScene = {
                ...scene,
                name: String(form.get("name") ?? "").trim() || "未命名场次",
                intExt: String(form.get("intExt") ?? "") as typeof scene.intExt,
                dayNight: String(form.get("dayNight") ?? "") as typeof scene.dayNight,
                targetDurationSeconds: String(form.get("targetDurationSeconds") ?? ""),
                shootDate: String(form.get("shootDate") ?? ""),
                notes: String(form.get("notes") ?? ""),
              };
              if (onUpdateScene) void onUpdateScene(nextScene);
              else onChange((latestProject) => ({
                ...latestProject,
                scenes: latestProject.scenes.map((candidate) => candidate.id === scene.id ? nextScene : candidate),
              }));
              setSceneEditorId(null);
            }}
          >
            <header><p>场次 {scene.number}</p><button type="button" onClick={() => setSceneEditorId(null)}>关闭</button></header>
            <label>名称<input defaultValue={scene.name} name="name" /></label>
            <label>内外景<select defaultValue={scene.intExt} name="intExt"><option value="">未设置</option><option value="INT">INT</option><option value="EXT">EXT</option><option value="INT/EXT">INT/EXT</option></select></label>
            <label>日夜<select defaultValue={scene.dayNight} name="dayNight"><option value="">未设置</option><option value="DAY">DAY</option><option value="NIGHT">NIGHT</option></select></label>
            <label>目标时长（秒）<input defaultValue={scene.targetDurationSeconds} name="targetDurationSeconds" type="number" /></label>
            <label>拍摄日期<input defaultValue={scene.shootDate} name="shootDate" type="date" /></label>
            <label>制作备注<textarea defaultValue={scene.notes} name="notes" /></label>
            <footer>
              <button type="button" onClick={() => { if (window.confirm("解除镜头归属后删除这个场次吗？")) { if (onDeleteScene) void onDeleteScene(scene.id, "ungroup"); else onChange((latest) => deleteLocalScene(latest, scene.id, "ungroup")); setSceneEditorId(null); } }}>解除并删除场次</button>
              <button type="button" onClick={() => { if (window.confirm("确定删除这个场次及其全部镜头吗？")) { if (onDeleteScene) void onDeleteScene(scene.id, "delete-shots"); else onChange((latest) => deleteLocalScene(latest, scene.id, "delete-shots")); setSceneEditorId(null); } }}>删除场次及镜头</button>
              <button type="submit">保存场次</button>
            </footer>
          </form>
        );
      })() : null}
    </section>
  );
}
