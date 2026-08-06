-- Customer 360 — the read model, in a database rather than in a TypeScript fixture.
--
-- Until now the only implementation of `Customer360Port` was `SyntheticCustomer360`,
-- reading a hand-written dataset. That is why the platform could not answer a question
-- about a real póliza: not because anything refused to, but because there was nowhere
-- to put one. These tables are that place.
--
-- Three things to know before reading further.
--
-- 1. **This is still a read model, not a policy administration system** (ADR-0001).
--    In production the management system remains the record of truth; these rows are
--    a cache with provenance attached to every field. Nothing here is authoritative
--    for the insurer, and nothing here executes anything.
--
-- 2. **Provenance is not optional.** Every record carries `field_provenance` inside
--    its JSONB payload: which source each field came from, when it was observed, with
--    what confidence, and whether another source disagrees. A field with no
--    provenance is not material and cannot ground a client-facing statement. That is
--    enforced in `asEvidenceField`, and it is the reason a row here can be cited.
--
-- 3. **The read/write split is in the type system, not in the grants.** Both
--    applications connect as one role, so the database cannot tell the Concierge's
--    reads from the employee workspace's writes. What it can tell is that the
--    Concierge only ever holds a `Customer360Port`, which has no write method. A
--    separate, read-only role for the Concierge is the right next hardening step and
--    is deliberately not pretended at here.
--
-- SYNTHETIC DATA ONLY, until the data-protection work in docs/roadmap.md §"Gap 4" is
-- done. The seed guard in `PostgresCustomer360Writer` refuses to load the synthetic
-- fixture into a database that already holds adviser-entered records, so the two
-- cannot be mixed by accident — but it cannot stop a deliberate one.

-- ─── Parties ────────────────────────────────────────────────────────────────
-- People and organisations. `surname` is promoted because same-surname access
-- control is a case the platform is tested against, not an incidental attribute.
create table if not exists c360_parties (
  id      text primary key,
  type    text not null check (type in ('PERSON', 'ORGANISATION')),
  surname text,
  email   text,
  data    jsonb not null
);

create index if not exists c360_parties_surname_idx on c360_parties (lower(surname));

-- ─── Relationships ──────────────────────────────────────────────────────────
-- How one party may act for another. Scope computation reads this by `from_party_id`
-- on every request, which is why that column exists rather than a JSONB path lookup.
create table if not exists c360_relationships (
  id            text primary key,
  kind          text not null,
  from_party_id text not null,
  to_party_id   text not null,
  data          jsonb not null
);

create index if not exists c360_relationships_from_idx on c360_relationships (from_party_id);

-- ─── Client accounts ────────────────────────────────────────────────────────
-- Sign-in resolves an account by email before any scope exists, so the lookup is
-- case-insensitive and unique on the normalised form.
create table if not exists c360_accounts (
  id       text primary key,
  party_id text not null,
  email    text not null,
  data     jsonb not null
);

create unique index if not exists c360_accounts_email_idx on c360_accounts (lower(email));

-- ─── Policies ───────────────────────────────────────────────────────────────
create table if not exists c360_policies (
  id              text primary key,
  policy_number   text not null,
  holder_party_id text not null,
  data            jsonb not null
);

create index if not exists c360_policies_holder_idx on c360_policies (holder_party_id);

-- ─── Insured objects ────────────────────────────────────────────────────────
-- Reached through a policy's `insuredObjectIds`, so `policy_id` is denormalised here
-- to make "the objects on this policy" one indexed read rather than a JSONB scan.
create table if not exists c360_insured_objects (
  id        text primary key,
  policy_id text not null,
  kind      text not null,
  data      jsonb not null
);

create index if not exists c360_insured_objects_policy_idx on c360_insured_objects (policy_id);

-- ─── Coverage terms ─────────────────────────────────────────────────────────
-- Limits, deductibles and exclusions, each pointing at the document passage it was
-- read from. `effective_to` is promoted because effectivity filtering happens on
-- every retrieval and a superseded term must never answer as a current one.
create table if not exists c360_coverage_terms (
  id             text primary key,
  policy_id      text not null,
  kind           text not null,
  key            text not null,
  document_id    text,
  effective_from date not null,
  effective_to   date,
  data           jsonb not null
);

create index if not exists c360_coverage_terms_policy_idx on c360_coverage_terms (policy_id);

-- ─── Claims ─────────────────────────────────────────────────────────────────
-- `special_category` is a column, not a JSONB field, because scope computation asks
-- "does this party hold special-category data" before it can build a scope at all.
create table if not exists c360_claims (
  id               text primary key,
  claim_number     text not null,
  policy_id        text not null,
  holder_party_id  text not null,
  status           text not null,
  special_category boolean not null default false,
  data             jsonb not null
);

create index if not exists c360_claims_holder_idx on c360_claims (holder_party_id);
create index if not exists c360_claims_policy_idx on c360_claims (policy_id);

-- ─── Receipts ───────────────────────────────────────────────────────────────
create table if not exists c360_receipts (
  id             text primary key,
  receipt_number text not null,
  policy_id      text not null,
  status         text not null,
  due_date       date not null,
  data           jsonb not null
);

create index if not exists c360_receipts_policy_idx on c360_receipts (policy_id);

-- ─── Documents ──────────────────────────────────────────────────────────────
-- `owner_party_id` is the authorisation anchor: a document belongs to a party, and a
-- policy or claim only narrows which of that party's documents are relevant.
create table if not exists c360_documents (
  id                       text primary key,
  kind                     text not null,
  owner_party_id           text not null,
  policy_id                text,
  claim_id                 text,
  classification           text not null,
  superseded_by_document_id text,
  data                     jsonb not null
);

create index if not exists c360_documents_owner_idx on c360_documents (owner_party_id);
create index if not exists c360_documents_policy_idx on c360_documents (policy_id);
create index if not exists c360_documents_claim_idx on c360_documents (claim_id);

-- ─── Approved procedures ────────────────────────────────────────────────────
-- Tier C. Not client-specific, so there is no owner and no scope filtering — the
-- only table here that any authenticated session may read in full.
create table if not exists c360_procedures (
  id      text primary key,
  title   text not null,
  topics  text[] not null default '{}',
  data    jsonb not null
);

create index if not exists c360_procedures_topics_idx on c360_procedures using gin (topics);

-- ─── Row-level security ─────────────────────────────────────────────────────
-- Same posture as 0001: RLS on, and Supabase's anon/authenticated roles hold nothing.
-- The application connects as its own role, which the next migration grants.
do $$
declare
  t text;
  r text;
  supabase_roles text[] := array(
    select rolname from pg_roles where rolname in ('anon', 'authenticated')
  );
begin
  foreach t in array array[
    'c360_parties', 'c360_relationships', 'c360_accounts', 'c360_policies',
    'c360_insured_objects', 'c360_coverage_terms', 'c360_claims', 'c360_receipts',
    'c360_documents', 'c360_procedures'
  ] loop
    execute format('alter table %I enable row level security', t);
    foreach r in array supabase_roles loop
      execute format('revoke all on table %I from %I', t, r);
    end loop;
  end loop;
end;
$$;

-- ─── Application grants ─────────────────────────────────────────────────────
-- SELECT, INSERT and UPDATE. No DELETE: a policy that ends is CANCELLED, a document
-- that is replaced is superseded, and a record that was entered wrongly is corrected
-- with new provenance. Nothing about a client's history is removed by the
-- application — erasure is a deliberate, audited operation, not a code path.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'rosillo_app') then
    execute 'grant select, insert, update on
      c360_parties, c360_relationships, c360_accounts, c360_policies,
      c360_insured_objects, c360_coverage_terms, c360_claims, c360_receipts,
      c360_documents, c360_procedures
      to rosillo_app';
  else
    raise notice 'Role rosillo_app does not exist yet — skipping grants. Create it, then re-run this migration.';
  end if;
end;
$$;
