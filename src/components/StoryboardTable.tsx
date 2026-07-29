import { useState } from "react";
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
    return "20rem";
  }

  const typeMinimum = field.type === "image" ? 18 : field.type === "number" ? 10 : 14;
  return `${Math.max(typeMinimum, field.label.length * 2 + 4)}rem`;
}

function maxImagesFor(field: FieldDefinition): number {
  return field.id === "frame" || field.id === "reference" ? 5 : 1;
}

export function StoryboardTable({ project, onChange, imageActions }: StoryboardTableProps) {
  const [draggedShotId, setDraggedShotId] = useState<string | null>(null);
  const visibleFields = project.fields
    .filter((field) => field.visible)
    .sort((left, right) => left.order - right.order);

  return (
    <section className="storyboard-panel" aria-label="分镜表格区域">
      <div className="storyboard-toolbar">
        <p>{project.shots.length} 个镜头</p>
        <button type="button" onClick={() => onChange(addShot(project))}>
          新增镜头
        </button>
      </div>
      <div className="storyboard-table-scroll">
        <table className="storyboard-table">
          <thead>
            <tr>
              <th className="sticky-shot-actions" scope="col">
                操作
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
                        maxImages={maxImagesFor(field)}
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
                        maxImages={maxImagesFor(field)}
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
