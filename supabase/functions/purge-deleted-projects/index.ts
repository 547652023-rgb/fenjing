import { createClient } from "npm:@supabase/supabase-js@2";
import { purgeClaimedProjects } from "./purge.ts";

const BUCKET = "storyboard-images";

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: candidates, error: claimError } = await supabase.rpc(
    "claim_deleted_projects_for_purge",
    { p_limit: 100 },
  );
  if (claimError) {
    return Response.json({ error: "Forbidden or unable to claim projects" }, { status: 403 });
  }

  const result = await purgeClaimedProjects(
    (candidates ?? []).map(({ project_id }: { project_id: string }) => project_id),
    supabase.storage.from(BUCKET),
    async (projectId) => {
      const { data, error } = await supabase.rpc("finalize_deleted_project_purge", {
        p_project_id: projectId,
      });
      if (error) throw error;
      return data === true;
    },
  );

  return Response.json(result, { status: result.failures.length === 0 ? 200 : 500 });
});
