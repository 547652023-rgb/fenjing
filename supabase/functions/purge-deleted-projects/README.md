# Deleted project purge

This function is the scheduled cleanup entry point for projects that have been
in the trash for 30 days. It must be deployed to the same Supabase project as
the migrations in this repository:

```sh
supabase functions deploy purge-deleted-projects
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are supplied by the Supabase Edge
Function runtime. Keep JWT verification enabled. The scheduler must send a
`POST` request to:

```text
https://<project-ref>.supabase.co/functions/v1/purge-deleted-projects
```

with this header:

```text
Authorization: Bearer <service-role-key>
```

Configure that request in the Supabase project's Cron integration (or the
project's existing scheduler) and store the service-role key as a secret. Do
not schedule the function with the anon key or a user access token: the claim
and finalization RPCs intentionally grant execution only to `service_role`.

The function claims at most 100 eligible projects per run. A failed Storage
operation leaves the relational project intact and becomes eligible for retry
after the 15-minute claim lease expires. Schedule it at least every 15 minutes
until a run reports no failures; daily scheduling is sufficient for the
30-day retention requirement.
