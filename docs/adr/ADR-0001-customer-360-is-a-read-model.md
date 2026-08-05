# ADR-0001 — Customer 360 is a read model, never a system of record

**Status:** accepted · **Date:** 2026-08-05

## Context

Rosillo's authoritative data lives in segElevia and in insurer systems. A "customer
360" that also accepts writes quietly becomes a second source of truth, and the day
the two disagree nobody can say which is right.

The platform needs a unified view of a client's position — parties, organisations,
relationships, accounts, policies, insured objects, claims, receipts, documents and
open tasks — with enough provenance to cite any of it.

## Decision

`@rosillo/customer-360` exposes a **read-only** typed interface. There is no create,
update or delete on any entity. Every method takes an `AuthorisedScope` as its first
argument, and every material field carries a `FieldProvenance`: source type, source
id, path, effective interval, observation time, confidence and any unresolved
conflict.

The synthetic adapter implements that interface. A segElevia adapter would implement
the same one.

## Consequences

- The platform can never corrupt the system of record, because it cannot write to it.
- Any conflict between sources is surfaced with both values rather than resolved.
- Passing scope as an argument rather than reading it from ambient context means an
  unscoped query is a compile error, not a review comment.
- Writes that a real deployment needs (a claim notification, an amendment) go through
  the task queue and a person, which is where they belonged anyway.
