# ADR-0002 — Every material value carries its provenance

**Status:** accepted · **Date:** 2026-08-05

## Context

Insurance answers are time-dependent and source-dependent. "Your excess is 300 €" is
true, false or misleading depending on the date and on which document was read. A
value passed around as a bare number loses exactly the information needed to know
which.

## Decision

No material value travels through the platform as a primitive. `EvidenceBackedField`
carries the value plus its source type and id, the path within that source, the
interval it applies to, when it was observed, a confidence, and any conflict with
another source. `EvidenceReference` is the citation form attached to an answer.

`value` is a display-ready string rather than a generic. The same envelope crosses the
package, server-action and UI boundary without leaking a type parameter into the wire
format, and formatting decisions (es-ES currency and dates) are made once, at the
point where the source is read.

Knowledge tiers A–E classify sources; only A, B and C may ground a client-facing
answer. Client statements are tier D by definition.

## Consequences

- Every evidence card in the UI can open on the exact field or passage, because the
  reference always knows where it came from.
- Conflict is representable, so it can be surfaced rather than silently resolved.
- Slightly more verbose call sites, and a stringly-typed `value`. Both are worth it:
  a bare number that turns out to be wrong is unattributable, and the alternative
  (`EvidenceBackedField<T>`) infects every signature it touches.
