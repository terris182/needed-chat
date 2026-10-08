# Supabase grants for new tables

From 2026-10-30 Supabase no longer auto-grants Data API access to new tables
or views in the `public` schema. Every migration that creates a table, view or
materialized view must carry explicit grants, or the API returns permission
errors.

## Rules

- Always grant `service_role` (server routes, cron, seed scripts).
- Grant `authenticated` only if the app reads or writes the table as a
  signed-in user. RLS still limits rows, so keep policies in place.
- Grant `anon` select only if the table is read with the anon key while signed
  out. If unsure, do not grant anon.
- Never loosen or change RLS policies as part of a grants change.

## Copy-paste block

```sql
alter table public.my_table enable row level security;

grant select, insert, update, delete on table public.my_table to service_role;
grant select, insert, update, delete on table public.my_table to authenticated;
-- only if read while signed out with the anon key:
-- grant select on table public.my_table to anon;
```

Sequences used by serial or identity columns need
`grant usage, select on sequence public.my_table_id_seq to authenticated, service_role;`.

`supabase/migrations/20261008_explicit_data_api_grants.sql` backfills grants
for the existing tables and sets default privileges for future ones, but still
add explicit grants in each new migration so it is self-contained.
