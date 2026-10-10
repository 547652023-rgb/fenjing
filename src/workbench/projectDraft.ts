import type { FieldDefinition, Shot, StoryboardProject } from "../domain/storyboard";

type FieldPatch = { id: string; changes: Partial<FieldDefinition>; added?: FieldDefinition; removed?: boolean; unset?: string[] };

export type ProjectDraft = {
  title?: string;
  aspectRatio?: string;
  fields?: FieldPatch[];
  cells: { shotId: string; fieldId: string; value?: string; removed?: boolean }[];
};

export function collectProjectDraft(server: StoryboardProject, current: StoryboardProject): ProjectDraft {
  const draft: ProjectDraft = { cells: [] };
  if (server.title !== current.title) draft.title = current.title;
  if (server.aspectRatio !== current.aspectRatio) draft.aspectRatio = current.aspectRatio;
  const fieldPatches: FieldPatch[] = [];
  for (const field of current.fields) {
    const saved = server.fields.find(({ id }) => id === field.id);
    if (!saved) { fieldPatches.push({ id: field.id, changes: {}, added: field }); continue; }
    const changes: Partial<FieldDefinition> = {};
    const unset: string[] = [];
    for (const key of new Set([...Object.keys(saved), ...Object.keys(field)])) {
      const property = key as keyof FieldDefinition;
      if (JSON.stringify(saved[property]) === JSON.stringify(field[property])) continue;
      if (field[property] === undefined) unset.push(key);
      else Object.assign(changes, { [key]: field[property] });
    }
    if (Object.keys(changes).length || unset.length) fieldPatches.push({ id: field.id, changes, unset });
  }
  for (const field of server.fields) {
    if (!current.fields.some(({ id }) => id === field.id)) fieldPatches.push({ id: field.id, changes: {}, removed: true });
  }
  if (fieldPatches.length) draft.fields = fieldPatches;
  for (const shot of current.shots) {
    const saved = server.shots.find(({ id }) => id === shot.id);
    if (!saved) continue;
    for (const fieldId of new Set([...Object.keys(saved.values), ...Object.keys(shot.values)])) {
      if (shot.values[fieldId] === saved.values[fieldId]) continue;
      draft.cells.push(shot.values[fieldId] === undefined
        ? { shotId: shot.id, fieldId, removed: true }
        : { shotId: shot.id, fieldId, value: shot.values[fieldId] });
    }
  }
  return draft;
}

export function hasProjectDraft(draft: ProjectDraft): boolean {
  return draft.cells.length > 0 || draft.title !== undefined || draft.aspectRatio !== undefined || draft.fields !== undefined;
}

export function applyProjectDraft(server: StoryboardProject, draft: ProjectDraft): StoryboardProject {
  return {
    ...server,
    title: draft.title ?? server.title,
    aspectRatio: draft.aspectRatio ?? server.aspectRatio,
    fields: [
      ...server.fields.filter((field) => !draft.fields?.some((patch) => patch.id === field.id && patch.removed)).map((field) => {
        const patch = draft.fields?.find(({ id }) => id === field.id);
        const merged = { ...field, ...patch?.changes };
        patch?.unset?.forEach((key) => { delete (merged as unknown as Record<string, unknown>)[key]; });
        return merged;
      }),
      ...(draft.fields ?? []).filter((patch) => patch.added && !server.fields.some(({ id }) => id === patch.id)).map((patch) => patch.added!),
    ],
    shots: server.shots.map((shot) => applyShotDraft(shot, draft)),
  };
}

export function applyShotDraft(shot: Shot, draft: ProjectDraft): Shot {
  const values = { ...shot.values };
  for (const cell of draft.cells.filter(({ shotId }) => shotId === shot.id)) {
    if (cell.removed) delete values[cell.fieldId];
    else values[cell.fieldId] = cell.value!;
  }
  return { ...shot, values };
}

export function readProjectDraft(key: string): ProjectDraft | null {
  try {
    const draft = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!draft || !Array.isArray(draft.cells) || !draft.cells.every((cell: ProjectDraft["cells"][number]) =>
      cell && typeof cell.shotId === "string" && typeof cell.fieldId === "string" && (cell.removed === true || typeof cell.value === "string"))) return null;
    if (draft.title !== undefined && typeof draft.title !== "string") return null;
    if (draft.aspectRatio !== undefined && typeof draft.aspectRatio !== "string") return null;
    if (draft.fields !== undefined && (!Array.isArray(draft.fields) || !draft.fields.every((patch: FieldPatch) => patch && typeof patch.id === "string" && patch.changes && typeof patch.changes === "object" && (!patch.unset || Array.isArray(patch.unset)) && (!patch.added || (typeof patch.added.label === "string" && typeof patch.added.type === "string"))))) return null;
    return draft;
  } catch { return null; }
}

export function writeProjectDraft(key: string, draft: ProjectDraft): void {
  try {
    if (hasProjectDraft(draft)) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  } catch { /* The in-memory draft and leave guard still protect edits if browser storage is full. */ }
}
