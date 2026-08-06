import { useEffect, useState } from "react";
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
}: StoryboardTableProps) {
  const [draggedShotId, setDraggedShotId] = useState<string | null>(null);
  const [selectedShotIds, setSelectedShotIds] = useState<string[]>([]);
  const [batchFieldId, setBatchFieldId] = useState("");
  const [batchFieldValue, setBatchFieldValue] = useState("");
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

  return (
    <section className="storyboard-panel" aria-label="分镜表格区域">
      <div className="storyboard-toolbar">
        <p>{project.shots.length} 个镜头</p>
        <button type="button" onClick={() => onChange(addShot(project))}>
          新增镜头
        </button>
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
                    aria-label={`上移镜头 ${shot.id}`}
                    disabled={shotIndex === 0}
                    title="上移"
                    type="button"
                    onClick={() =>
                      onChange((latestProject) => {
                        const index = latestProject.shots.findIndex(
                          (latestShot) => latestShot.id === shot.id,
                        );
                        return moveShot(latestProject, shot.id, index - 1);
                      })
                    }
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`下移镜头 ${shot.id}`}
                    disabled={shotIndex === project.shots.length - 1}
                    title="下移"
                    type="button"
                    onClick={() =>
                      onChange((latestProject) => {
                        const index = latestProject.shots.findIndex(
                          (latestShot) => latestShot.id === shot.id,
                        );
                        return moveShot(latestProject, shot.id, index + 1);
                      })
                    }
                  >
                    ↓
                  </button>
                  <button
                    aria-label={`删除镜头 ${shot.id}`}
                    className="shot-actions__delete"
                    title="删除"
                    type="button"
                    onClick={() => {
                      if (window.confirm("确定删除这个镜头吗？")) {
                        onChange((latestProject) =>
                          deleteShot(latestProject, shot.id),
                        );
                      }
                    }}
                  >
                    ×
                  </button>
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
