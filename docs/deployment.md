# Deploying to Vercel with Supabase

**Synthetic data only.** Putting this on the public internet does not change that
rule — it sharpens it. A deployed URL is reachable by anyone who finds it, and the
authentication in front of it is a shared demo password (ADR-0004). Never point a
deployed instance at real Rosillo or customer data.

Two Vercel projects from one repository, over one Supabase database:

```
                          Supabase Postgres
                    (conversations, tasks, audit)
                            ▲            ▲
                            │            │
        ┌───────────────────┘            └──────────────────┐
        │                                                   │
  Vercel project A                                    Vercel project B
  apps/client-concierge                               apps/employee-copilot
  concierge.example.com                               copilot.example.com
```

They must share a database. The handoff — a client's request becoming a task an
adviser sees — is the whole product, and it happens through the store. Two databases
means two disconnected applications that each appear to work.

---

## Why not the JSONL store

It cannot work here, and it fails quietly rather than loudly:

- Vercel's filesystem is ephemeral. Anything written during a request is gone.
- Instances are not shared. Two requests may not touch the same machine, so the two
  applications certainly do not share a directory.

The store factory therefore selects Postgres as soon as `DATABASE_URL` is set. That is
deliberate — a deployment that had a database and used files anyway would look healthy
and lose every conversation between requests.

---

## 1. Supabase

Create a project at [supabase.com](https://supabase.com). Any region; pick one near
your users (`eu-west` for Spain).

Copy the connection string from **Project Settings → Database → Connection string →
URI**, and take the **direct** one on port **5432** — the next step issues DDL, which
the pooler will not do.

Then, from a checkout:

```bash
./scripts/setup-database.sh 'postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres'
```

That one command:

1. creates `rosillo_app`, the least-privilege role the deployment connects as, with a
   generated password (pass your own as a second argument if you prefer);
2. applies both migrations in order;
3. **verifies the role cannot rewrite history** — it tries to drop the append-only
   trigger, disable it, delete from the audit log and truncate it, and fails the script
   if any of those is permitted;
4. prints the `DATABASE_URL` to paste into Vercel.

It is safe to re-run. The password is shown once and never written to disk.

No `psql` locally? Paste `supabase/migrations/0001_platform_schema.sql` and then
`0002_app_role_grants.sql` into the Supabase SQL editor, in that order, having first
run `create role rosillo_app login password '…';`.

### What the migrations do

`0001` creates eight tables, marks `audit_events`, `task_versions` and `decisions`
append-only with statement-level triggers, enables row-level security on everything,
and revokes all access from the `anon` and `authenticated` roles.

That last part matters: Supabase publishes those roles through PostgREST and **the
anon key is public by design**. The platform does not use PostgREST — it connects over
a direct Postgres session and computes authorisation itself, before any query runs
(ADR-0006). So nothing here should be reachable with the anon key, and after the
migration nothing is. Check it:

```sql
-- Should return zero rows.
select table_name, privilege_type
from information_schema.role_table_grants
where grantee in ('anon', 'authenticated');
```

`0002` grants `rosillo_app` what the platform actually needs: SELECT and INSERT on
every table, UPDATE on exactly two (a conversation's title and timestamp, a session's
revocation), and **no DDL at all**.

That is the point of having a second role. Connecting as the table owner would mean
the application could drop the append-only triggers it is supposed to be bound by — so
"the application cannot rewrite history" would describe its code rather than its
permissions, and code changes.

### Which port, where

| Port | Use for |
|---|---|
| **5432** — direct | `setup-database.sh`, migrations, local tooling. Issues DDL. |
| **6543** — transaction pooler | Vercel. Serverless opens far more connections than Postgres tolerates. |

The store detects a pooled URI and disables prepared statements, which the transaction
pooler does not support. Nothing to configure.

---

## 2. Vercel

Two projects, both importing the same repository.

### Project A — Client Concierge

| Setting | Value |
|---|---|
| Root Directory | `apps/client-concierge` |
| Framework | Next.js (detected) |
| Install Command | `npm install --workspaces --include-workspace-root` |
| Build Command | `npm run build` (detected) |

Leave "Include files outside the root directory" **on** — it is a workspace, and the
build needs `packages/`.

Environment variables (Production and Preview):

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | the **6543** pooler URI, as `rosillo_app` | Selects the Postgres store |
| `AUTH_SECRET` | `openssl rand -hex 32` | **Required.** Production refuses to issue a session without it |
| `AI_PROVIDER` | `mock` | Deterministic, no key, no cost. `anthropic` for a live model |
| `ANTHROPIC_API_KEY` | — | Only if `AI_PROVIDER=anthropic` |

### Project B — Employee Copilot

Identical, with Root Directory `apps/employee-copilot`, and:

- the **same** `DATABASE_URL` — this is what makes the handoff work;
- its **own** `AUTH_SECRET`, different from the Concierge's. The two surfaces already
  use separate cookie names and separate token kinds, so a client token cannot be
  replayed as an employee one; separate secrets mean that holds even if one is leaked.
- no `AI_PROVIDER` — the employee workspace runs no model.

### Deploy

Push, or click Deploy. Both projects build from the same commit.

---

## 3. Check it worked

```bash
curl -sI https://<concierge-url>/login | grep -i 'content-security-policy\|strict-transport'
```

You should see a nonce-based CSP and HSTS. Then, in a browser:

1. Sign in to the Concierge as `ana@cliente.test` / `demo`.
2. Ask `Quiero dar de baja el seguro del coche.` — an action card appears saying the
   request is *prepared*.
3. Sign in to the Copilot as `carlos@rosillo.test` / `demo`. **The task is in the
   queue** — that is the database doing its job across two deployments.
4. Approve it, then reload the client conversation. The status has changed.
5. Copilot → **Auditoría**: one hash-chained trail spanning both applications, and it
   verifies.

If step 3 shows an empty queue, the two projects are not on the same database. Check
`DATABASE_URL` in both.

---

## What to expect from the logs

Each application logs one line at startup naming what is actually active:

```
[rosillo] concierge starting — store=postgres provider=mock model=deterministic-v1
[rosillo] employee workspace starting — store=postgres
```

`store=jsonl` on Vercel means `DATABASE_URL` is not set, and nothing will persist.

---

## Common failures

**Everyone is signed out after a deploy.** Expected if `AUTH_SECRET` changed: every
token was signed with the old one. Session *records* survive; the signatures do not.

**`permission denied` or `must be owner` in the logs.** The application is doing
something `rosillo_app` is not granted. If it is a legitimate operation the grant list
in the migration needs extending — deliberately, with a reason. If it is an UPDATE or
DELETE on an append-only table, the application is doing something it should not.

**`MisconfiguredSecretError` on every request.** `AUTH_SECRET` is missing, is the
placeholder from `.env.example`, or is shorter than 32 characters. This is deliberate:
without it, sessions would be signed with a key published in the repository, so the
platform refuses rather than running insecurely (ADR-0013).

**`MissingConnectionStringError`.** `ROSILLO_STORE=postgres` without a `DATABASE_URL`.

**"too many connections" / `MaxClientsInSessionMode`.** Using the 5432 direct URI on
Vercel. Switch to 6543.

**"prepared statement already exists".** A pooled URI the detector missed. Set
`prepare: false` explicitly, or open an issue with the URI shape (redacted).

**The build cannot resolve `@rosillo/*`.** "Include files outside the root directory"
is off, or the install command is not the workspace-aware one.

**Tasks appear in the queue but the audit page reports a broken chain.** Treat this as
a stop condition, not a nuisance. See the threat model.

---

## Resetting a deployed instance

```sql
-- The append-only triggers refuse DELETE and TRUNCATE, which is the point.
-- Dropping and re-creating the schema is the supported reset.
drop schema public cascade;
create schema public;
```

Then re-run the migration. Everything else is rebuilt in memory: the synthetic
dataset — clients, policies, claims, documents — is generated by
`packages/customer-360/src/synthetic/` at startup and is not stored in the database at
all. Only conversations, tasks, decisions, AI-run metadata and audit events persist.

That is worth stating plainly, because it changes what the database is: it holds *what
happened*, never the insurance data itself.

---

## Before this is more than a demo

Deployment does not change what ADR-0004 and ADR-0011 say. A public URL protected by a
shared demo password is a demo, and it stays one until:

1. **Real identity** replaces the demo password.
2. **Session revocation** exists — tokens are currently valid until they expire.
3. **The database owner is a separate person from the deployment.** `rosillo_app`
   cannot drop the append-only triggers, but whoever holds the owner credentials can.
   Splitting those two is what finishes the job.
4. **Rate limiting is global.** Both limiters are per-instance, and serverless means
   many instances. Session revocation is already shared, because it lives in the
   database; the request and sign-in counters are not.
5. **A DPIA is completed** — before any real personal data, which this must never have.
