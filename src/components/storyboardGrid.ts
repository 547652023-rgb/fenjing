import type { FieldDefinition, StoryboardProject } from "../domain/storyboard";

export type GridChange = {
  shotId: string;
  fieldId: string;
  before: string | undefined;
  value: string;
};

export function undoableGridChanges(project: StoryboardProject, changes: GridChange[]): GridChange[] {
  const fields = new Set(project.fields.map(field => field.id));
  const shots = new Map(project.shots.map(shot => [shot.id, shot]));
  return changes.filter(change => fields.has(change.fieldId)
    && shots.get(change.shotId)?.values[change.fieldId] === change.value);
}

export function applyGridChanges(project: StoryboardProject, changes: GridChange[], undo = false): StoryboardProject {
  const fields = new Set(project.fields.map(field => field.id));
  const byShot = new Map<string, GridChange[]>();
  for (const change of undo ? undoableGridChanges(project, changes) : changes) {
    if (!fields.has(change.fieldId)) continue;
    const entries = byShot.get(change.shotId) ?? [];
    entries.push(change);
    byShot.set(change.shotId, entries);
  }
  return {
    ...project,
    shots: project.shots.map(shot => {
      const entries = byShot.get(shot.id);
      if (!entries) return shot;
      const values = { ...shot.values };
      for (const change of entries) {
        if (!undo) values[change.fieldId] = change.value;
        else if (values[change.fieldId] === change.value) {
          if (change.before === undefined) delete values[change.fieldId];
          else values[change.fieldId] = change.before;
        }
      }
      return { ...shot, values };
    }),
  };
}

export function validateGridValue(field: FieldDefinition, value: string): boolean {
  if (field.type === "image" || field.id === "shotNumber") return false;
  if (!value) return true;
  if (field.type === "number") return /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value))
    && (field.id !== "durationSeconds" || Number(value) >= 0);
  if (field.type === "date") return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  return field.type !== "singleSelect" || field.allowCustomValue !== false || !!field.options?.includes(value);
}

export function parseClipboardGrid(text: string): string[][] {
  const rows: string[][] = [[]];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const startsQuotedCell = char === '"' && !cell
      && /^"(?:[^"]|"")*"(?=[\t\r\n]|$)/.test(text.slice(index));
    if (char === '"' && (quoted || startsQuotedCell)) {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else quoted = !quoted;
    } else if (!quoted && (char === "\t" || char === "\n" || char === "\r")) {
      rows[rows.length - 1].push(cell);
      cell = "";
      if (char !== "\t") {
        if (char === "\r" && text[index + 1] === "\n") index++;
        if (index + 1 < text.length) rows.push([]);
        else return rows;
      }
    } else cell += char;
  }
  rows[rows.length - 1].push(cell);
  return rows;
}
