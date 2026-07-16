import {
  addShot,
  updateShotValue,
  type FieldDefinition,
  type StoryboardProject,
} from "../domain/storyboard";

type StoryboardTableProps = {
  project: StoryboardProject;
  onChange: (project: StoryboardProject) => void;
};

function inputTypeFor(field: FieldDefinition): "date" | "number" | "text" {
  if (field.type === "date" || field.type === "number") {
    return field.type;
  }

  return "text";
}

function columnWidth(field: FieldDefinition): string {
  const typeMinimum = field.type === "image" ? 18 : field.type === "number" ? 10 : 14;
  return `${Math.max(typeMinimum, field.label.length * 2 + 4)}rem`;
}

export function StoryboardTable({ project, onChange }: StoryboardTableProps) {
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
            {project.shots.map((shot) => (
              <tr key={shot.id}>
                {visibleFields.map((field) => (
                  <td
                    className={field.id === "shotNumber" ? "sticky-shot-number" : undefined}
                    data-field-type={field.type}
                    key={field.id}
                  >
                    {field.type === "image" ? null : (
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
