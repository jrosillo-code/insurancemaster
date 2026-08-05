# ADR-0006 — Authorised scope is a list of ids, not a predicate

**Status:** accepted · **Date:** 2026-08-05

## Context

The usual shape for authorisation in an application like this is a `canAccess(user,
resource)` check applied at each read. It works, and it fails open the moment someone
adds a query that forgets to call it — which, in a system with a retrieval layer
assembling evidence from six sources, is a matter of time.

## Context is worse with an LLM in the loop

Retrieval is dynamic. The set of records read depends on a plan derived from a
model-classified intent. "Did we remember the check on this path?" is not a question
with a stable answer.

## Decision

`computeScope()` runs at stage 3, before the model is called, and returns concrete id
lists: `partyIds`, `policyIds`, `claimIds`, `documentIds`, `receiptIds`, plus the
grants applied and the authority basis. Every read model method takes the scope and
filters against those lists. A record outside them is never in the working set.

Organisation context **replaces** personal scope rather than adding to it. Grants
expand to concrete ids (`VIEW_POLICIES` → `policyIds`). Special-category access is
granted only to the subject, never through a delegation. A context the caller has no
authority over yields an empty scope and an `ACCESS_DENIED` event rather than an
exception.

## Consequences

- Cross-client leakage is structural. There is no path that reads an unauthorised
  record, because the id was never in the list.
- A forgotten check is impossible: the scope is a required argument, so an unscoped
  query does not compile.
- Scope computation is eager, so a request pays for ids it may not use. With a
  realistic book that is a few hundred ids — irrelevant here, and the point at which
  a pilot would move filtering into SQL with row-level security.
- The evaluation suite still asserts, per case, that every citation resolves inside
  the computed scope. A structural guarantee nobody checks is a guarantee nobody
  should believe.
