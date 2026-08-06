# Implementation status

As of 2026-08-05. **Synthetic data only.**

## Milestones

| Milestone | Status | Where |
|---|---|---|
| **A** — shared foundation | Complete | `packages/domain`, `packages/audit`, `packages/store`, `packages/ai` |
| **B** — synthetic Customer 360 | Complete | `packages/customer-360` |
| **C** — Client Concierge MVP | Complete | `apps/client-concierge` |
| **D** — nine-stage orchestration | Complete | `packages/orchestration` |
| **E** — employee handoff | Complete | `apps/employee-copilot`, `packages/actions` |
| **Evaluation** | Complete | `packages/evals` — 78 cases, 6 gates |
| **Security & privacy** | Complete for a prototype | `tests/security`, `docs/threat-model.md` |
| **Hardening pass** | Complete | Next 16, fail-closed secret, CSP, throttling, write locking |

## Acceptance gates

| Gate | Status |
|---|---|
| All tests pass | 232 unit / integration / security, 33 end-to-end |
| Production build passes | Both applications, Next 16 |
| No known dependency vulnerabilities | 0, gated at high severity in `npm run verify` |
| Cross-client leakage is zero | 0 across 78 evaluation cases and the per-case structural scope check |
| Prohibited external action count is zero | No capability exists; enforced at three layers |
| Every material answer has valid evidence or is INSUFFICIENT/PRELIMINARY | Unsupported material statement rate 0% |
| No real data anywhere | Synthetic dataset only; identifiers forced to fail real-world checksums |
| Waypoint untouched | Separate product; not modified, imported or coupled |

---

## Milestone A — shared foundation

Done:

- `EvidenceBackedField` and `EvidenceReference` with source type, id, path, effective
  interval, observation time, confidence and unresolved conflict.
- Knowledge tiers A–E; only A/B/C may ground a client answer; client statements are
  tier D by definition.
- `AIRun` metadata: provider, model, prompt versions, stage, input/output hashes,
  policy verdict, schema validity, repairs, latency, tokens. No chain-of-thought.
- Approved action catalogue with nine allowed and eight prohibited codes as separate
  objects; per-intent narrowing; prototype-pollution-safe membership tests.
- Immutable hash-chained audit events with purpose codes and schema-constrained
  non-sensitive metadata.
- Provider abstraction and versioned prompt registry; deterministic mock is the
  default; Anthropic provider is opt-in.

## Milestone B — synthetic Customer 360

Done:

- Read-only typed port; every method takes an `AuthorisedScope`.
- 35 persons, 2 organisations, 35 accounts, 64 policies, 11 claims, 18 documents with
  32 passages, 52 receipts, 17 coverage terms, 10 approved procedures.
- Eight hand-crafted anchor scenarios with stable ids: partial spousal delegation,
  same-surname unrelated client, company admin vs. narrower employee grant, an
  ERP/schedule premium conflict, a superseded schedule replaced by an endorsement, a
  special-category health claim, a fleet and goods-in-transit business, and an
  English-speaking student.
- `assertIntegrity` checks referential integrity, duplicate ids and orphans.

Not done: multi-generational households beyond the García Molina case; brokerage
commission data; any product outside the eight modelled lines.

## Milestone C — Client Concierge

Done: mobile-first Spanish-first chat; persistent synthetic-data banner in the layout;
AI disclosure and "hablar con una persona" above the conversation on every screen;
person/company context switching; blank home with example prompts; conversation
history; evidence cards opening the exact field or passage; uncertainty and
data-freshness; action cards that say *prepared*, never *done*; a `/limitaciones` page
stating what the prototype does not do. Five direct intents plus the
insufficient/conflicting/unavailable state.

The conversation continues across turns. Earlier client turns join term extraction for
retrieval and reach the drafting stage, so a follow-up that names nothing — "¿y la del
coche?" — resolves against what was already being discussed. They are context, never
evidence: a material statement still needs a citation from the current turn's
retrieval.

Not done: file upload beyond metadata validation; push or email notification (there is
no outbound channel by design); voice.

## Milestone D — orchestration

Done: all nine stages with an audit event at each; structured-output classification
with one controlled repair; intent-derived retrieval plans; effectivity filtering;
citation by index with server-side id substitution; policy enforcement with answer
downgrade and action filtering; degraded mode; rate limiting and input limits;
conversation-ownership check inside the pipeline.

A conversation reaches a person when a person has something to do. The intent decides
it — `INTENTS_NEEDING_A_PERSON` covers a document the file does not hold, a claim, an
amendment, a cancellation, a renewal review, a quote, a life event, an explicit ask and
safety — and three conditions escalate a question regardless: two sources that
disagree, which the assistant is forbidden to resolve; safety; and a message carrying
an instruction aimed at the system. A question is otherwise answered, with the route to
a person on the screen rather than imposed. This replaced "insufficient or unclassified
must reach a person", which put most turns in a queue and buried the ones that
mattered.

## Milestone E — employee handoff

Done: queue filtered server-side by role; review screen with verbatim request,
identity and authority, relevant policies, verified facts with provenance and
conflicts, client statements held visually apart, missing information with rule ids,
evidence details, proposed outcome, risk flags, source conversation; approve / approve
with edits / escalate / reject; immutable additive versions; supervisor-only override
with a recorded reason; client-visible status derived from state; audit page that
verifies the chain on render and is restricted to `audit.read`.

The platform sends no email and modifies no policy: there is no code that could.

---

## Known limitations

Prototype-appropriate, and named rather than hidden:

- Shared demo password authentication (ADR-0004). Attempts are throttled and locked
  out, but the credential is still known.
- No session revocation: tokens are stateless and valid until they expire.
- JSONL persistence. Audit appends are locked so the chain cannot fork, but the
  application can still rewrite its own audit file (ADR-0011).
- Rate limiting and sign-in throttling are per-process.
- The deterministic classifier is a keyword engine; it needs extending as the corpus
  grows.
- The evaluation corpus is imagined, not observed. Real questions will be stranger.

## Next

In order of what a pilot needs first:

1. Real identity, from the Rosillo app.
2. PostgreSQL with row-level security and a separate append-only audit store.
3. A live-provider evaluation baseline, and a decision on which model to run.
4. A DPIA before any real personal data — which this prototype must never have.
