-- Rosillo AI Platform — persistence schema (ADR-0011 supersedes the JSONL store).
--
-- SYNTHETIC DATA ONLY. Nothing in this database is, or may become, real client data.
--
-- Two things shape this schema.
--
-- 1. The contracts live in @rosillo/domain and are validated by Zod on the way in and
--    on the way out. So each row keeps the full validated object as JSONB, and
--    promotes to columns only what is filtered, ordered or joined on. The alternative
--    — mirroring every field — means two sources of truth that drift, and the Zod
--    schema is the one that is actually enforced.
--
-- 2. Append-only means append-only. Task versions and audit events have no UPDATE and
--    no DELETE path in the application, and the grants below make that true at the
--    database level for every role the application uses.

-- ─── Conversations ──────────────────────────────────────────────────────────
create table if not exists conversations (
  id            text primary key,
  account_id    text        not null,
  context_type  text        not null check (context_type in ('PERSON', 'ORGANISATION')),
  context_id    text        not null,
  title         text        not null,
  created_at    timestamptz not null,
  updated_at    timestamptz not null
);

create index if not exists conversations_account_idx on conversations (account_id, updated_at desc);

-- ─── Messages ───────────────────────────────────────────────────────────────
create table if not exists messages (
  id              text primary key,
  conversation_id text        not null references conversations (id) on delete cascade,
  role            text        not null check (role in ('CLIENT', 'ASSISTANT')),
  body            jsonb       not null,
  created_at      timestamptz not null,
  -- Monotonic within a conversation. Ordering by created_at alone would be unstable:
  -- two messages in the same turn share a timestamp to the millisecond.
  seq             bigserial   not null
);

create index if not exists messages_conversation_idx on messages (conversation_id, seq);

-- ─── Responses ──────────────────────────────────────────────────────────────
create table if not exists responses (
  response_id     text primary key,
  conversation_id text  not null,
  trace_id        text  not null,
  body            jsonb not null
);

create index if not exists responses_conversation_idx on responses (conversation_id);

-- ─── Tasks ──────────────────────────────────────────────────────────────────
-- Every row is a version. The current state of a task is its highest seq; earlier
-- versions are never updated or removed (blueprint §13.3).
create table if not exists task_versions (
  seq             bigserial primary key,
  task_id         text  not null,
  conversation_id text  not null,
  client_id       text  not null,
  employee_queue  text  not null,
  state           text  not null,
  body            jsonb not null,
  created_at      timestamptz not null default now()
);

create index if not exists task_versions_task_idx on task_versions (task_id, seq);
create index if not exists task_versions_queue_idx on task_versions (employee_queue);
create index if not exists task_versions_conversation_idx on task_versions (conversation_id);
create index if not exists task_versions_client_idx on task_versions (client_id);

-- ─── Employee decisions ─────────────────────────────────────────────────────
create table if not exists decisions (
  seq         bigserial primary key,
  task_id     text        not null,
  employee_id text        not null,
  decided_at  timestamptz not null,
  body        jsonb       not null
);

create index if not exists decisions_task_idx on decisions (task_id, seq);

-- ─── AI runs ────────────────────────────────────────────────────────────────
-- Hashes, verdicts and counters. No prompts, no completions, no reasoning (ADR-0009).
create table if not exists ai_runs (
  run_id     text primary key,
  trace_id   text        not null,
  started_at timestamptz not null,
  body       jsonb       not null
);

create index if not exists ai_runs_trace_idx on ai_runs (trace_id);

-- ─── Audit ──────────────────────────────────────────────────────────────────
-- Hash-chained and append-only (ADR-0008). `seq` is the authoritative order: the
-- chain is verified in insertion order, not by timestamp, which two events in the
-- same millisecond would not give us.
create table if not exists audit_events (
  seq           bigserial primary key,
  event_id      text        not null unique,
  occurred_at   timestamptz not null,
  actor_type    text        not null,
  actor_id      text        not null,
  action        text        not null,
  resource_type text        not null,
  resource_id   text        not null,
  purpose_code  text        not null,
  trace_id      text        not null,
  model_run_id  text,
  before_hash   text,
  after_hash    text,
  -- Constrained to non-sensitive values by the Zod schema before it ever gets here.
  -- Raw policy, claim and message text never enters an audit event (blueprint §15.2).
  metadata      jsonb       not null default '{}'::jsonb,
  previous_hash text,
  event_hash    text        not null,
  -- The exact event as hashed. The columns above exist to filter and index on; this
  -- is what is read back. Reconstructing an event from typed columns would round-trip
  -- `occurred_at` through timestamptz, and "2026-08-05T09:00:00Z" comes back as
  -- "...:00.000Z" — a different string, so a different hash, so a chain that fails to
  -- verify for a reason that has nothing to do with tampering.
  body          jsonb       not null
);

create index if not exists audit_events_trace_idx on audit_events (trace_id);
create index if not exists audit_events_resource_idx on audit_events (resource_type, resource_id);

-- ─── Append-only enforcement ────────────────────────────────────────────────
-- The application has no update or delete path for these tables. This makes that a
-- property of the database rather than a property of the current code: a future
-- change cannot quietly acquire one, and neither can a session that reaches the
-- database directly with the application's credentials.
create or replace function refuse_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'Table % is append-only: % is not permitted', tg_table_name, tg_op
    using hint = 'History is evidence. Append a new row instead.';
end;
$$;

-- Statement-level, not row-level. A row-level trigger never fires when the statement
-- matches nothing, so `delete from audit_events` on an empty table would succeed —
-- and the refusal would look like it worked while actually depending on there being
-- data. Statement-level triggers also cover TRUNCATE, which row-level ones cannot.
do $$
declare
  t text;
begin
  foreach t in array array['audit_events', 'task_versions', 'decisions'] loop
    execute format('drop trigger if exists %I on %I', t || '_append_only', t);
    execute format(
      'create trigger %I before update or delete on %I for each statement execute function refuse_mutation()',
      t || '_append_only', t
    );
    execute format('drop trigger if exists %I on %I', t || '_no_truncate', t);
    execute format(
      'create trigger %I before truncate on %I for each statement execute function refuse_mutation()',
      t || '_no_truncate', t
    );
  end loop;
end;
$$;

-- ─── Access ─────────────────────────────────────────────────────────────────
-- Supabase publishes `anon` and `authenticated` through PostgREST, and the anon key
-- is public by design. Nothing here is meant to be reachable that way: the platform
-- connects over a direct Postgres session and computes authorisation itself, as a
-- concrete id allow-list, before any query runs (ADR-0006).
--
-- So: revoke everything from the PostgREST roles, and enable RLS with no permissive
-- policy, which denies by default. Someone holding the anon key gets nothing. The
-- table owner still reads and writes normally — owners bypass RLS unless it is
-- FORCEd, which is the behaviour we want for the application's own connection.
do $$
declare
  t text;
  r text;
  -- `anon` and `authenticated` exist on Supabase and nowhere else. Guarding on that
  -- keeps this migration runnable against a plain Postgres — which is what the store
  -- tests use, and a migration that only runs in one environment is a migration that
  -- gets tested in none.
  supabase_roles text[] := array(
    select rolname from pg_roles where rolname in ('anon', 'authenticated')
  );
begin
  foreach t in array array[
    'conversations', 'messages', 'responses',
    'task_versions', 'decisions', 'ai_runs', 'audit_events'
  ] loop
    execute format('alter table %I enable row level security', t);
    foreach r in array supabase_roles loop
      execute format('revoke all on table %I from %I', t, r);
    end loop;
  end loop;

  foreach r in array supabase_roles loop
    execute format('revoke all on all sequences in schema public from %I', r);
    execute format('revoke all on all functions in schema public from %I', r);
  end loop;

  if cardinality(supabase_roles) = 0 then
    raise notice 'anon/authenticated not present — not a Supabase database. RLS is enabled regardless.';
  end if;
end;
$$;

-- ─── Sessions ───────────────────────────────────────────────────────────────
-- A signed token is unforgeable but not retractable. Without a server-side record,
-- signing out clears one cookie and a copied token stays valid until it expires.
-- The token carries a session id; this table is the authority on whether it still
-- means anything (blueprint §12.3).
create table if not exists sessions (
  session_id     text primary key,
  kind           text        not null check (kind in ('CLIENT', 'EMPLOYEE')),
  subject_id     text        not null,
  created_at     timestamptz not null,
  expires_at     bigint      not null,
  revoked_at     timestamptz,
  revoked_reason text
);

-- Revoking every session for one subject is the realistic incident response, so it
-- gets an index rather than a sequential scan.
create index if not exists sessions_subject_idx on sessions (subject_id) where revoked_at is null;
create index if not exists sessions_expiry_idx on sessions (expires_at);

do $$
declare
  r text;
  supabase_roles text[] := array(
    select rolname from pg_roles where rolname in ('anon', 'authenticated')
  );
begin
  execute 'alter table sessions enable row level security';
  foreach r in array supabase_roles loop
    execute format('revoke all on table sessions from %I', r);
  end loop;
end;
$$;
