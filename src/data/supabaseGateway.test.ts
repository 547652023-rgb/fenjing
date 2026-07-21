import { describe, expect, it, vi } from "vitest";
import { BUILT_IN_TEMPLATES } from "../domain/templates";
import { createProject } from "../domain/storyboard";
import {
  createSupabaseGateway,
  mapSupabaseError,
  refreshImageUrlsInValues,
} from "./supabaseGateway";

describe("SupabaseStoryboardGateway", () => {
  it("maps an empty versioned update to a conflict", async () => {
    const chain: Record<string, unknown> = {};
    chain.update = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.select = vi.fn().mockResolvedValue({ data: [], error: null });
    const client = { from: vi.fn(() => chain) };
    const gateway = createSupabaseGateway(client);

    await expect(
      gateway.saveShot("project-1", createProject().shots[0], 2),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("maps Supabase errors to stable gateway codes", () => {
    expect(mapSupabaseError({ code: "23505", message: "duplicate" })).toMatchObject({
      code: "already_member",
    });
    expect(mapSupabaseError({ code: "42501", message: "denied" })).toMatchObject({
      code: "forbidden",
    });
    expect(mapSupabaseError({ message: "Failed to fetch" })).toMatchObject({
      code: "network",
    });
  });

  it("replaces field rows as one ordered set to avoid position collisions", async () => {
    const deleteEq = vi.fn().mockResolvedValue({ data: null, error: null });
    const deleteFields = vi.fn(() => ({ eq: deleteEq }));
    const selectInserted = vi.fn().mockResolvedValue({
      data: [
        { id: "field-1", field_key: "shotNumber" },
        { id: "field-2", field_key: "shotSize" },
      ],
      error: null,
    });
    const insertFields = vi.fn(() => ({ select: selectInserted }));
    const insertOptions = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = {
      from: vi.fn((table: string) =>
        table === "fields"
          ? { delete: deleteFields, insert: insertFields }
          : { insert: insertOptions },
      ),
    };
    const gateway = createSupabaseGateway(client);
    const project = createProject();

    await gateway.saveProjectMeta("project-1", {
      fields: project.fields.filter((field) =>
        ["shotNumber", "shotSize"].includes(field.id),
      ),
    });

    expect(deleteFields).toHaveBeenCalledOnce();
    expect(insertFields).toHaveBeenCalledOnce();
    expect(insertOptions).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ field_id: "field-2", value: "大远景" }),
      ]),
    );
  });

  it("refreshes private image URLs while keeping image metadata", async () => {
    const image = {
      path: "project/shot/frame/a.png",
      url: "expired",
      name: "a.png",
      position: 0,
    };

    const values = await refreshImageUrlsInValues(
      { frame: JSON.stringify([image]), notes: "保留" },
      new Set(["frame"]),
      async (path) => `signed:${path}`,
    );

    expect(JSON.parse(values.frame)).toEqual([
      { ...image, url: `signed:${image.path}` },
    ]);
    expect(values.notes).toBe("保留");
  });

  it("combines member-visible custom templates with immutable built-ins", async () => {
    const custom = {
      id: "template-1",
      source_project_id: "project-1",
      name: "广告",
      snapshot: {
        title: "广告模板",
        aspectRatio: "16:9",
        fields: [],
        shots: [],
      },
      updated_at: "2026-07-21T01:00:00.000Z",
    };
    const order = vi.fn().mockResolvedValue({ data: [custom], error: null });
    const select = vi.fn(() => ({ order }));
    const client = { from: vi.fn(() => ({ select })) };
    const gateway = createSupabaseGateway(client);

    expect(await gateway.listTemplates()).toEqual([
      ...BUILT_IN_TEMPLATES,
      {
        id: custom.id,
        sourceProjectId: custom.source_project_id,
        name: custom.name,
        snapshot: custom.snapshot,
        builtIn: false,
        updatedAt: custom.updated_at,
      },
    ]);
    expect(client.from).toHaveBeenCalledWith("project_templates");
  });

  it("replaces seeded fields, options, and shots when creating from a snapshot", async () => {
    const project = createProject();
    const snapshot = {
      title: "模板标题",
      aspectRatio: "9:16",
      fields: project.fields.filter((field) => ["shotNumber", "shotSize"].includes(field.id)),
      shots: [
        { id: "template-shot-1", values: { shotNumber: "1", shotSize: "远景" } },
        { id: "template-shot-2", values: { shotNumber: "2", shotSize: "特写" } },
      ],
    };
    const projectSelect = vi.fn().mockResolvedValue({
      data: [{
        id: "project-1",
        title: "新项目",
        owner_id: "user-1",
        updated_at: "2026-07-21T01:00:00.000Z",
      }],
      error: null,
    });
    const projectInsert = vi.fn(() => ({ select: projectSelect }));
    const deleteFieldsEq = vi.fn().mockResolvedValue({ data: null, error: null });
    const insertFieldsSelect = vi.fn().mockResolvedValue({
      data: [
        { id: "field-1", field_key: "shotNumber" },
        { id: "field-2", field_key: "shotSize" },
      ],
      error: null,
    });
    const insertFields = vi.fn(() => ({ select: insertFieldsSelect }));
    const insertOptions = vi.fn().mockResolvedValue({ data: null, error: null });
    const deleteShotsEq = vi.fn().mockResolvedValue({ data: null, error: null });
    const insertShots = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "user-1", email: "owner@example.com" } } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        if (table === "projects") return { insert: projectInsert };
        if (table === "fields") {
          return {
            delete: vi.fn(() => ({ eq: deleteFieldsEq })),
            insert: insertFields,
          };
        }
        if (table === "field_options") return { insert: insertOptions };
        if (table === "shots") {
          return {
            delete: vi.fn(() => ({ eq: deleteShotsEq })),
            insert: insertShots,
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    const gateway = createSupabaseGateway(client);

    await gateway.createProject("新项目", snapshot);

    expect(projectInsert).toHaveBeenCalledWith({
      title: "新项目",
      owner_id: "user-1",
      aspect_ratio: "9:16",
    });
    expect(insertFields).toHaveBeenCalledWith([
      expect.objectContaining({ project_id: "project-1", field_key: "shotNumber", position: 0 }),
      expect.objectContaining({ project_id: "project-1", field_key: "shotSize", position: 3 }),
    ]);
    expect(insertOptions).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ field_id: "field-2", value: "大远景", position: 0 }),
      ]),
    );
    expect(insertShots).toHaveBeenCalledWith([
      { project_id: "project-1", position: 0, values: snapshot.shots[0].values },
      { project_id: "project-1", position: 1, values: snapshot.shots[1].values },
    ]);
  });

  it("removes image values from caller-supplied template snapshots before inserting shots", async () => {
    const snapshot = {
      title: "带图片的模板",
      aspectRatio: "16:9",
      fields: [
        { id: "frame", label: "画面", type: "image" as const, visible: true, order: 0 },
        { id: "content", label: "内容", type: "text" as const, visible: true, order: 1 },
      ],
      shots: [{ id: "template-shot", values: { frame: "image-data", content: "保留" } }],
    };
    const projectSelect = vi.fn().mockResolvedValue({
      data: [{
        id: "project-1",
        title: "新项目",
        owner_id: "user-1",
        updated_at: "2026-07-21T01:00:00.000Z",
      }],
      error: null,
    });
    const projectInsert = vi.fn(() => ({ select: projectSelect }));
    const deleteFieldsEq = vi.fn().mockResolvedValue({ data: null, error: null });
    const insertFieldsSelect = vi.fn().mockResolvedValue({
      data: [
        { id: "field-1", field_key: "frame" },
        { id: "field-2", field_key: "content" },
      ],
      error: null,
    });
    const insertFields = vi.fn(() => ({ select: insertFieldsSelect }));
    const deleteShotsEq = vi.fn().mockResolvedValue({ data: null, error: null });
    const insertShots = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "user-1", email: "owner@example.com" } } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        if (table === "projects") return { insert: projectInsert };
        if (table === "fields") {
          return {
            delete: vi.fn(() => ({ eq: deleteFieldsEq })),
            insert: insertFields,
          };
        }
        if (table === "field_options") return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
        if (table === "shots") {
          return {
            delete: vi.fn(() => ({ eq: deleteShotsEq })),
            insert: insertShots,
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    const gateway = createSupabaseGateway(client);

    await gateway.createProject("新项目", snapshot);

    expect(insertShots).toHaveBeenCalledWith([
      { project_id: "project-1", position: 0, values: { content: "保留" } },
    ]);
  });
});
