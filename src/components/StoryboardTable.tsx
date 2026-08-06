import { useEffect, useRef, useState } from "react";
import {
  addShot,
  deleteShot,
  moveShot,
  updateShotValue,
  type FieldDefinition,
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
}: StoryboardTableProps) {
  const [draggedShotId, setDraggedShotId] = useState<string | null>(null);
  const [selectedShotIds, setSelectedShotIds] = useState<string[]>([]);
  const [batchFieldId, setBatchFieldId] = useState("");
  const [batchFieldValue, setBatchFieldValue] = useState("");
  const [isCreationMenuOpen, setIsCreationMenuOpen] = useState(false);
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const [openRowMenuShotId, setOpenRowMenuShotId] = useState<string | null>(null);
  const [focusShotId, setFocusShotId] = useState<string | null>(null);
  const editableCellRefs = useRef(new Map<string, HTMLElement>());
  const visibleFields = project.fields
    .filter((field) => field.visible)
    .sort((left, right) => left.order - right.order);
  const batchFields = visibleFields.filter(
    (field) => field.type !== "image" && field.id !== "shotNumber",
  );
  const allSelected =
    project.shots.length > 0 && selectedShotIds.length === project.shots.length;

  useEffect(() => {
    setSelectedShotIds((current) =>
      current.filter((shotId) => project.shots.some((shot) => shot.id === shotId)),
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

  return (
    <section
      className="storyboard-panel"
      aria-label="分镜表格区域"
      onKeyDown={handleTableKeyDown}
    >
      <div className="storyboard-toolbar">
        <p>{project.shots.length} 个镜头</p>
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
            </div>
          ) : null}
        </div>
      </div>
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
                      event.target.checked ? project.shots.map((shot) => shot.id) : [],
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
            {project.shots.map((shot, shotIndex) => (
              <tr
                aria-label={`镜头 ${shot.id}`}
                key={shot.id}
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
                    <span aria-hidden="true">•••</span>
                  </button>
                  {openRowMenuShotId === shot.id ? (
                    <div aria-label={`镜头 ${shot.id} 操作`} className="shot-actions__menu" role="menu">
                      <button role="menuitem" type="button" onClick={() => void createShots({ beforeShotId: shot.id, count: 1 })}>在上方新增</button>
                      <button role="menuitem" type="button" onClick={() => void createShots({ afterShotId: shot.id, count: 1 })}>在下方新增</button>
                      <button role="menuitem" type="button" onClick={() => void createShots({ copyShotId: shot.id, count: 1 })}>复制镜头</button>
                      <button aria-describedby={`scene-action-note-${shot.id}`} disabled role="menuitem" type="button">移动到场次</button>
                      <span className="sr-only" id={`scene-action-note-${shot.id}`}>场次管理将在下一阶段开放</span>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
