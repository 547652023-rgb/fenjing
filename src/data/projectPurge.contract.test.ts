import { describe, expect, it, vi } from "vitest";
import migration from "../../supabase/migrations/202607220003_project_home.sql?raw";
import {
  purgeClaimedProjects,
  removeProjectFiles,
  type StorageBucket,
} from "../../supabase/functions/purge-deleted-projects/purge";

function storageBucket(
  listings: Record<string, Array<{ id: string | null; name: string }>>,
): StorageBucket & { remove: ReturnType<typeof vi.fn> } {
  return {
    list: vi.fn(async (path: string) => ({ data: listings[path] ?? [], error: null })),
    remove: vi.fn(async () => ({ error: null })),
  };
}

describe("deleted project purge", () => {
  it("removes every nested Storage object under the project prefix", async () => {
    const bucket = storageBucket({
      "project-1": [{ id: null, name: "shot-1" }],
      "project-1/shot-1": [
        { id: null, name: "frame" },
        { id: null, name: "reference" },
      ],
      "project-1/shot-1/frame": [{ id: "file-1", name: "one.png" }],
      "project-1/shot-1/reference": [{ id: "file-2", name: "two.png" }],
    });

    await removeProjectFiles(bucket, "project-1");

    expect(bucket.remove).toHaveBeenCalledWith([
      "project-1/shot-1/frame/one.png",
      "project-1/shot-1/reference/two.png",
    ]);
  });

  it("finalizes the database row only after Storage deletion succeeds", async () => {
    const events: string[] = [];
    const bucket = storageBucket({
      "project-1": [{ id: "file-1", name: "one.png" }],
    });
    bucket.remove.mockImplementation(async () => {
      events.push("storage");
      return { error: null };
    });
    const finalize = vi.fn(async () => {
      events.push("database");
      return true;
    });

    const result = await purgeClaimedProjects(["project-1"], bucket, finalize);

    expect(events).toEqual(["storage", "database"]);
    expect(result).toEqual({ claimed: 1, purged: 1, failures: [] });
  });

  it("keeps the project row for retry when Storage deletion fails", async () => {
    const bucket = storageBucket({
      "project-1": [{ id: "file-1", name: "one.png" }],
    });
    bucket.remove.mockResolvedValue({ error: new Error("storage unavailable") });
    const finalize = vi.fn(async () => true);

    const result = await purgeClaimedProjects(["project-1"], bucket, finalize);

    expect(finalize).not.toHaveBeenCalled();
    expect(result.purged).toBe(0);
    expect(result.failures).toEqual([
      { projectId: "project-1", error: "storage unavailable" },
    ]);
  });

  it("exposes only service-role purge RPCs and never deletes Storage metadata directly", () => {
    expect(migration).not.toMatch(/delete\s+from\s+storage\.objects/i);
    expect(migration).toMatch(/create or replace function public\.claim_deleted_projects_for_purge\(p_limit integer default 100\)/i);
    expect(migration).toMatch(/create or replace function public\.finalize_deleted_project_purge\(p_project_id uuid\)/i);
    expect(migration).toMatch(/grant execute on function public\.claim_deleted_projects_for_purge\(integer\) to service_role/i);
    expect(migration).toMatch(/grant execute on function public\.finalize_deleted_project_purge\(uuid\) to service_role/i);
    expect(migration).not.toMatch(/grant execute on function public\.(?:claim_deleted_projects_for_purge|finalize_deleted_project_purge).*authenticated/i);
  });

  it("blocks owner updates after a project has been claimed for purge", () => {
    expect(migration).toMatch(
      /create policy projects_update_owner[\s\S]*?using \(purge_started_at is null and public\.is_project_owner\(id\)\)[\s\S]*?with check \(purge_started_at is null and owner_id = auth\.uid\(\)\)/i,
    );
  });
});
