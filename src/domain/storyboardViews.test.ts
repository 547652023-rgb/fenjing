import { describe, expect, it } from "vitest";
import { createProject } from "./storyboard";
import {
  createNamedStoryboardView,
  normalizeColumnPresentation,
} from "./storyboardViews";

describe("storyboard views", () => {
  it("builds a cinematography view without changing the project field definitions", () => {
    const project = createProject();
    const fieldsBefore = project.fields.map((field) => ({ ...field }));

    const view = createNamedStoryboardView("cinematographer", project.fields);
    const presentation = normalizeColumnPresentation(project.fields, view.columns);

    expect(presentation.filter((column) => column.visible).map((column) => column.fieldId)).toEqual([
      "shotNumber",
      "frame",
      "shotSize",
      "cameraAngle",
      "cameraMove",
      "cameraGear",
      "lens",
      "reference",
      "productionStatus",
    ]);
    expect(project.fields).toEqual(fieldsBefore);
  });

  it("keeps new project fields visible when restoring a saved presentation", () => {
    const project = createProject();
    const saved = [
      { fieldId: "shotNumber", visible: true, order: 0, width: "compact" as const, pinned: true },
      { fieldId: "content", visible: true, order: 1, width: "wide" as const, pinned: false },
    ];

    const presentation = normalizeColumnPresentation(project.fields, saved);

    expect(presentation).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldId: "productionStatus", visible: true }),
      expect.objectContaining({ fieldId: "frame", visible: true }),
    ]));
  });
});
