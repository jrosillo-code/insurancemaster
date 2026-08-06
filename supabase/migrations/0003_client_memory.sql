-- Client Relationship Intelligence Layer (ADR-0014).
--
-- Two tables, and one property worth stating: memories are NOT append-only like the
-- audit trail. A client must be able to correct and erase what is held about them,
-- which is the opposite requirement, so `client_memories` permits UPDATE.
--
-- Erasure is a tombstone rather than a DELETE: the row survives with an empty value
-- and `forgottenAt` set. That is not a hedge against erasure — it is what makes
-- erasure demonstrable. A row that vanishes leaves no evidence the deletion happened,
-- and under GDPR the controller has to be able to show that it did.
--
-- SYNTHETIC DATA ONLY.

create table if not exists client_memories (
  id           text primary key,
  account_id   text        not null,
  body         jsonb       not null,
  created_at   timestamptz not null default now()
);

create index if not exists client_memories_account_idx on client_memories (account_id);

create table if not exists client_consent (
  account_id   text primary key,
  body         jsonb       not null,
  updated_at   timestamptz not null default now()
);

alter table client_memories enable row level security;
alter table client_consent  enable row level security;

-- The anon and authenticated roles reach nothing directly; the application connects
-- as rosillo_app and enforces authorisation in code, as everywhere else.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on client_memories, client_consent from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'rosillo_app') then
    grant select, insert, update on client_memories to rosillo_app;
    grant select, insert, update on client_consent  to rosillo_app;
  end if;
end $$;
