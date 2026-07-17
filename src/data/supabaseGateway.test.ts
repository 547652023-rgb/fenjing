import { describe, expect, it, vi } from "vitest";
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
});
