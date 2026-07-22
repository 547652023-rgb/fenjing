# Deleted project purge

This function is the scheduled cleanup entry point for projects that have been
in the trash for 30 days. It must be deployed to the same Supabase project as
the migrations in this repository:

```sh
supabase functions deploy purge-deleted-projects
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by the Supabase
Edge Function runtime. The function performs its own privileged cleanup, so
configure its **Verify JWT** setting as off and schedule an unauthenticated
`POST` request to:

```text
https://<project-ref>.supabase.co/functions/v1/purge-deleted-projects
```

Configure that request in the Supabase project's Cron integration (or the
project's existing scheduler). Do not expose the service-role key to the
scheduler: it remains available only inside the Edge Function runtime.

The function claims at most 100 eligible projects per run. A failed Storage
operation leaves the relational project intact and becomes eligible for retry
after the 15-minute claim lease expires. Schedule it at least every 15 minutes
until a run reports no failures; daily scheduling is sufficient for the
30-day retention requirement.
