import { expect, it } from "vitest";
import { createProject } from "../domain/storyboard";
import { applyProjectDraft, collectProjectDraft } from "./projectDraft";

it("restores a local rename without removing remote additions or other remote field changes", () => {
  const base = createProject();
  const edited = { ...base, fields: base.fields.map((field) => field.id === "content" ? { ...field, label: "镜头内容" } : field) };
  const draft = collectProjectDraft(base, edited);
  const remote = { ...base, fields: [...base.fields.map((field) => field.id === "notes" ? { ...field, label: "导演备注" } : field), { id: "remote", label: "新增字段", type: "text" as const, visible: true, order: 99 }] };
  const result = applyProjectDraft(remote, draft);
  expect(result.fields.find(({ id }) => id === "content")?.label).toBe("镜头内容");
  expect(result.fields.find(({ id }) => id === "notes")?.label).toBe("导演备注");
  expect(result.fields.find(({ id }) => id === "remote")?.label).toBe("新增字段");
});


it("removes a deleted cell key while preserving unrelated remote values", () => {
  const base = createProject();
  base.shots[0].values.notes = "旧备注";
  const edited = { ...base, shots: base.shots.map((shot) => ({ ...shot, values: { shotNumber: shot.values.shotNumber } })) };
  const remote = { ...base, shots: base.shots.map((shot) => ({ ...shot, values: { ...shot.values, content: "远端内容" } })) };
  const restored = applyProjectDraft(remote, collectProjectDraft(base, edited));
  expect(restored.shots[0].values.notes).toBeUndefined();
  expect(restored.shots[0].values.content).toBe("远端内容");
});
