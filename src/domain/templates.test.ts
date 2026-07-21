import { describe, expect, it } from "vitest";

import {
  BUILT_IN_TEMPLATES,
  projectToTemplateSnapshot,
  templateToProject,
} from "./templates";
import type { StoryboardProject } from "./storyboard";

const projectWithFrameImage: StoryboardProject = {
  id: "p-1",
  title: "原始项目",
  aspectRatio: "9:16",
  fields: [
    { id: "frame", label: "画面", type: "image", visible: true, order: 0 },
    {
      id: "size",
      label: "景别",
      type: "singleSelect",
      visible: true,
      order: 1,
      options: ["近景"],
    },
  ],
  shots: [{ id: "1", values: { frame: "image-data", size: "近景" } }],
};

describe("template snapshots", () => {
  it("removes image values when saving a project as a template", () => {
    const snapshot = projectToTemplateSnapshot(projectWithFrameImage);

    expect(snapshot.shots[0].values.frame).toBeUndefined();
    expect(snapshot.fields).toEqual(projectWithFrameImage.fields);
  });

  it("creates an independent project from a template snapshot", () => {
    const project = templateToProject(BUILT_IN_TEMPLATES[0].snapshot, "p-2", "广告片");

    expect(project.id).toBe("p-2");
    expect(project.title).toBe("广告片");
    project.fields[0].label = "已修改";
    project.shots[0].values.shotNumber = "99";
    expect(BUILT_IN_TEMPLATES[0].snapshot.fields[0].label).not.toBe("已修改");
    expect(BUILT_IN_TEMPLATES[0].snapshot.shots[0].values.shotNumber).not.toBe("99");
  });

  it("provides the three named built-in templates with stable ids", () => {
    expect(BUILT_IN_TEMPLATES.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: "builtin:professional", name: "专业" },
      { id: "builtin:simple", name: "简洁" },
      { id: "builtin:promotion", name: "宣传片" },
    ]);
  });

  it("keeps every level of built-in template data immutable", () => {
    const template = BUILT_IN_TEMPLATES[0];
    const fieldWithOptions = template.snapshot.fields.find((field) => field.options);

    if (false) {
      // @ts-expect-error Built-in template collection is readonly.
      BUILT_IN_TEMPLATES.push(template);
      // @ts-expect-error Built-in template metadata is readonly.
      template.name = "已修改";
      // @ts-expect-error Built-in snapshots are readonly.
      template.snapshot.title = "已修改";
      // @ts-expect-error Built-in field arrays are readonly.
      template.snapshot.fields.push(template.snapshot.fields[0]);
      // @ts-expect-error Built-in fields are readonly.
      template.snapshot.fields[0].label = "已修改";
      // @ts-expect-error Built-in field options are readonly.
      fieldWithOptions!.options!.push("全景");
      // @ts-expect-error Built-in shot arrays are readonly.
      template.snapshot.shots.push(template.snapshot.shots[0]);
      // @ts-expect-error Built-in shots are readonly.
      template.snapshot.shots[0].values.shotNumber = "99";
    }

    expect(Object.isFrozen(BUILT_IN_TEMPLATES)).toBe(true);
    expect(Object.isFrozen(template)).toBe(true);
    expect(Object.isFrozen(template.snapshot)).toBe(true);
    expect(Object.isFrozen(template.snapshot.fields)).toBe(true);
    expect(Object.isFrozen(template.snapshot.fields[0])).toBe(true);
    expect(Object.isFrozen(fieldWithOptions?.options)).toBe(true);
    expect(Object.isFrozen(template.snapshot.shots)).toBe(true);
    expect(Object.isFrozen(template.snapshot.shots[0])).toBe(true);
    expect(Object.isFrozen(template.snapshot.shots[0].values)).toBe(true);

    const mutableTemplate = template as unknown as {
      snapshot: { fields: { label: string }[]; shots: { values: Record<string, string> }[] };
    };
    const originalLabel = template.snapshot.fields[0].label;
    const originalShotNumber = template.snapshot.shots[0].values.shotNumber;

    expect(() => {
      mutableTemplate.snapshot.fields[0].label = "已修改";
    }).toThrow(TypeError);
    expect(() => {
      mutableTemplate.snapshot.shots[0].values.shotNumber = "99";
    }).toThrow(TypeError);
    expect(template.snapshot.fields[0].label).toBe(originalLabel);
    expect(template.snapshot.shots[0].values.shotNumber).toBe(originalShotNumber);
  });
});
