# ADR-0011 — JSONL files for prototype persistence

**Status:** accepted for local development · **Date:** 2026-08-05 · **Superseded for hosted deployments by `PostgresStore`**

## Context

The prototype needs persistence that survives a restart, is inspectable by hand, is
genuinely append-only, and is shared by two separate Next.js processes. It does not
need concurrency, indexes or migrations.

## Decision

`PlatformStore` is a port. `InMemoryStore` serves tests and the evaluation suite;
`JsonlStore` extends it and appends one JSON line per mutation to
`conversations.jsonl`, `messages.jsonl`, `responses.jsonl`, `tasks.jsonl`,
`decisions.jsonl` and `audit.jsonl`.

Two details that were not obvious until both applications were running:

- **Cross-process reads.** A cache populated once never sees the other process's
  writes, so a client kept seeing "in the queue" after an adviser had acted. Each
  file's size and mtime is fingerprinted and the cache rebuilt when either changes.
- **Cross-process audit chaining.** The previous hash is read from what is already on
  disk (`buildAuditEvent`), not from a per-process counter, so one chain spans both
  applications.

## Consequences

- History is physically append-only and a tampered line is detectable through the
  hash chain.
- Debugging is `tail -f`.
- Reload is O(file) on change. Irrelevant at prototype scale, unacceptable at any
  other.
- **Concurrent writers can interleave lines and fork the audit chain.** There is no
  locking. Acceptable only because writes are low-frequency and effectively
  single-writer per file.
- No query capability: `listTasks` scans.

## What happened next

The port did its job: `PostgresStore` is a new implementation, not a rewrite, and the
same tests run against both. Anything hosted uses it, because neither assumption above
survives a serverless host — the filesystem is not shared between the two applications
and does not persist between requests. `createStore()` selects Postgres as soon as
`DATABASE_URL` is set, so a deployment cannot quietly use files and lose everything.

Two things got *better* rather than merely equivalent:

- **The audit lock is real.** `pg_advisory_xact_lock` inside a transaction is a mutex;
  the file lock was a lock file with a stale-detection heuristic.
- **Append-only is enforced by the database.** Statement-level triggers refuse UPDATE,
  DELETE and TRUNCATE on `audit_events`, `task_versions` and `decisions`, so it is a
  property of the schema rather than of the current application code.

Building it also surfaced a latent defect in the audit design: `jsonb` sorts object
keys, and the event hash was built on `JSON.stringify`, which follows insertion order.
Every chain would have failed to verify on any hosted deployment. The hash is now
canonical — sorted at every depth — which makes it a property of the event's content
rather than of how the object happened to be built. See `packages/audit/test`.

Still open, and still the reason ADR-0011 is not simply closed: the application
connects as the table owner, so it can drop the triggers it is bound by. A production
audit store is one the application has no credentials to rewrite.

## What a pilot still needs

Row-level security that enforces *client scope* rather than only shutting out the
PostgREST roles. Today authorisation is computed in the application as an id allow-list
(ADR-0006) and the database trusts it; defence in depth would express the same
constraint in SQL.
