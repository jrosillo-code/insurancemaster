-- Grants for the application's own database role.
--
-- Separate from 0001 because it needs a role that a migration must not create: the
-- password would have to live in this file, and this file lives in the repository.
-- Create the role first (see docs/deployment.md or scripts/setup-database.sh), then
-- run this. Re-running it is safe.
--
-- If the role is missing this migration says so and does nothing, rather than failing
-- halfway and leaving the schema in a state nobody can describe.

-- ─── The application's own role ─────────────────────────────────────────────
-- Until now the application connected as the table owner, which meant it could drop
-- the append-only triggers it is supposed to be bound by. "The application cannot
-- rewrite history" was therefore a statement about the application's code, not about
-- its permissions — and code changes.
--
-- `rosillo_app` has exactly what the platform does and nothing else: SELECT and
-- INSERT everywhere, UPDATE only on the two tables that legitimately mutate
-- (conversations move their title and timestamp; sessions get revoked), and no DDL
-- at all. It cannot drop a trigger, alter a table or truncate anything.
--
-- Grants only. Creating the role and setting its password is a deployment step, not a
-- migration step: a password does not belong in a file that lives in the repository.
-- See docs/deployment.md.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_roles where rolname = 'rosillo_app') then
    raise notice 'Role rosillo_app does not exist yet — skipping grants. Create it, then re-run this migration.';
    return;
  end if;

  execute 'grant usage on schema public to rosillo_app';

  foreach t in array array[
    'conversations', 'messages', 'responses',
    'task_versions', 'decisions', 'ai_runs', 'audit_events', 'sessions'
  ] loop
    execute format('grant select, insert on table %I to rosillo_app', t);
  end loop;

  -- The only two tables the platform updates in place. Everything else is append-only,
  -- and now that is enforced by the grant as well as by the trigger.
  execute 'grant update on table conversations to rosillo_app';
  execute 'grant update (revoked_at, revoked_reason) on table sessions to rosillo_app';

  execute 'grant usage, select on all sequences in schema public to rosillo_app';

  -- Tables added later inherit the same shape rather than defaulting to nothing and
  -- being fixed by hand under time pressure.
  execute 'alter default privileges in schema public grant select, insert on tables to rosillo_app';
  execute 'alter default privileges in schema public grant usage, select on sequences to rosillo_app';

  -- RLS is enabled on every table and there are no permissive policies, so a
  -- non-owner is denied by default. The platform computes authorisation itself as an
  -- id allow-list before any query runs (ADR-0006); this policy grants the row access
  -- the application needs while leaving the PostgREST roles with nothing.
  foreach t in array array[
    'conversations', 'messages', 'responses',
    'task_versions', 'decisions', 'ai_runs', 'audit_events', 'sessions'
  ] loop
    execute format('drop policy if exists rosillo_app_access on %I', t);
    execute format(
      'create policy rosillo_app_access on %I for all to rosillo_app using (true) with check (true)', t
    );
  end loop;
end;
$$;
