export interface StorageEntry {
  id: string | null;
  name: string;
}

export interface StorageBucket {
  list(
    path: string,
    options: {
      limit: number;
      offset: number;
      sortBy: { column: string; order: "asc" };
    },
  ): Promise<{ data: StorageEntry[] | null; error: unknown | null }>;
  remove(paths: string[]): Promise<{ error: unknown | null }>;
}

export interface PurgeFailure {
  projectId: string;
  error: string;
}

const PAGE_SIZE = 100;
const REMOVE_BATCH_SIZE = 100;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function removeProjectFiles(
  bucket: StorageBucket,
  projectId: string,
): Promise<void> {
  const directories = [projectId];
  const filePaths: string[] = [];

  while (directories.length > 0) {
    const directory = directories.shift()!;
    let offset = 0;

    while (true) {
      const { data, error } = await bucket.list(directory, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw error;

      const entries = data ?? [];
      for (const entry of entries) {
        const path = `${directory}/${entry.name}`;
        if (entry.id === null) directories.push(path);
        else filePaths.push(path);
      }

      if (entries.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  for (let offset = 0; offset < filePaths.length; offset += REMOVE_BATCH_SIZE) {
    const { error } = await bucket.remove(filePaths.slice(offset, offset + REMOVE_BATCH_SIZE));
    if (error) throw error;
  }
}

export async function purgeClaimedProjects(
  projectIds: string[],
  bucket: StorageBucket,
  finalize: (projectId: string) => Promise<boolean>,
): Promise<{ claimed: number; purged: number; failures: PurgeFailure[] }> {
  let purged = 0;
  const failures: PurgeFailure[] = [];

  for (const projectId of projectIds) {
    try {
      await removeProjectFiles(bucket, projectId);
      if (await finalize(projectId)) purged += 1;
    } catch (error) {
      failures.push({ projectId, error: errorMessage(error) });
    }
  }

  return { claimed: projectIds.length, purged, failures };
}
