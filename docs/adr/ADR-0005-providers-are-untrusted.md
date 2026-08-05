# ADR-0005 — AI providers are untrusted input

**Status:** accepted · **Date:** 2026-08-05

## Context

A model can return malformed JSON, a hallucinated policy number, an action code that
does not exist, or fluent text asserting something no document says. Treating its
output as trusted makes every downstream control depend on model behaviour, which is
the one thing that cannot be guaranteed.

## Decision

Provider output is validated and constrained at four levels:

1. **Schema.** Zod-validated with exactly one controlled repair attempt. A second
   failure is a degraded response, not a third try.
2. **No identifiers.** `conciergeDraftSchema` has no id field of any kind. Citations
   are `citedEvidenceIndexes` — positions into the candidate list the model was given.
   Orchestration substitutes real ids and drops out-of-range indexes.
3. **Action codes only.** The model proposes codes; the catalogue decides. Labels,
   related policy ids and approval flags are attached server-side.
4. **Answer-type policy.** A material answer without tier A/B evidence is downgraded
   before rendering, regardless of how confident the text sounds.

## Consequences

- A hallucinated identifier cannot reach the client, because it cannot be expressed.
- The same guarantees hold for the mock and for a live model, so swapping providers
  does not change the safety properties.
- Index-based citation is slightly awkward to prompt for, and the model can cite an
  index it did not really use. The second is a quality problem, not a safety one, and
  the evaluation measures it.
