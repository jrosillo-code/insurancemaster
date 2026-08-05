# ADR-0010 — The answer is a typed contract, not a string

**Status:** accepted · **Date:** 2026-08-05

## Context

If an assistant returns prose, the interface has no way to distinguish "your excess is
300 €, here is the clause" from "I think that's probably covered". Both render as a
paragraph, and the second reads as authoritative because it sounds the same as the
first. Eloquence outruns evidence.

## Decision

Every answer is one of seven types — `FACT`, `EXPLANATION`, `PROCEDURE`,
`PRELIMINARY`, `INSUFFICIENT`, `EMERGENCY`, `OUT_OF_SCOPE` — and the type determines
what the interface is allowed to render.

`MATERIAL_ANSWER_TYPES` (`FACT`, `EXPLANATION`, `PRELIMINARY`) assert something about
the client's cover and therefore require tier A/B evidence. Without it the answer is
downgraded to `INSUFFICIENT` in the policy stage, before rendering.

The response also carries evidence references, uncertainty, follow-up questions,
proposed actions, a human-review flag, a data-freshness summary and a trace id.

## Consequences

- "Answer with no citation" is unrepresentable as a `FACT`. The invariant is enforced
  by the type plus one policy rule, not by prompt wording.
- The UI can label every answer honestly and style caution differently from certainty,
  because it knows which it has.
- Coverage questions are capped at `PRELIMINARY`: applying wording to a specific event
  is judgement, and the platform says so.
- Seven types is a real constraint on expressiveness. That is the intent.
