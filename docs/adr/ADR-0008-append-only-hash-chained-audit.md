# ADR-0008 — The audit log is append-only and hash-chained

**Status:** accepted · **Date:** 2026-08-05

## Context

The platform must be able to reconstruct any interaction: who acted, on what, under
which lawful basis, and what the model and the rules did. History that can be
rewritten is not evidence.

## Decision

`AuditLog` exposes `append` and nothing else — no update, no delete. Each event
carries the hash of the previous event and a hash of its own content, so an edit or
deletion in the middle is detectable. `verifyEventChain` returns the index of the
first tampered event, and the employee audit page verifies on render.

Every event carries a `purposeCode`, so an access log can answer *why* and not only
*what*.

Metadata is constrained by schema to short strings, numbers, booleans and small string
arrays. There is no field a policy passage could fit into, which makes "no raw content
in logs" a property of the type rather than a discipline.

## Consequences

- Tampering is detectable rather than silent.
- Compliance questions ("show me every access to this claim, and why") are answerable.
- The chain proves internal consistency, not integrity against an attacker with write
  access to the file — they could recompute it. Named as a residual risk in the threat
  model; a pilot needs an append-only store the application cannot rewrite.
- Concurrent writers can fork the chain. Acceptable for a prototype with one writer
  per file in practice.
