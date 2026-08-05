# ADR-0011 — JSONL files for prototype persistence

**Status:** accepted · **Date:** 2026-08-05 · **Supersede before pilot**

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

## What a pilot needs

PostgreSQL with row-level security (scope enforced in the database as well as the
application), a separate append-only audit store the application cannot rewrite, and
real migrations. The port makes that a new implementation rather than a rewrite.
