# Architecture

**Synthetic data only.** Nothing described here is connected to a real system.

## The shape of the problem

An insurance answer is only as good as the record behind it, and insurance records are
time-dependent, source-dependent and frequently contradictory. The same question —
"what is my excess?" — has a different correct answer depending on the date, on which
of several policies the client meant, and on whether an endorsement replaced the
schedule. A system that answers fluently but cannot say *which* record it read, *when*
that record was true, or *that two records disagree* is not useful in this domain; it
is a liability.

So the platform is organised around one idea: **the model interprets language, and
code plus approved rules decide everything else.**

```
                        ┌──────────────────────────────┐
   Client Concierge ───▶│                              │
   (Next.js, es-first)  │      orchestration           │◀─── Employee Copilot
                        │   the nine-stage pipeline    │     (Next.js, internal)
                        └───────────────┬──────────────┘
                                        │
        ┌────────────┬──────────────┬───┴────┬──────────────┬─────────────┐
        ▼            ▼              ▼        ▼              ▼             ▼
      auth      customer-360    retrieval   ai          actions        store
   (authority)  (read model)   (evidence) (provider)  (task state)  (append-only)
        └────────────┴──────────────┴────────┴──────────────┴─────────────┘
                                        │
                                     domain
                    (evidence, scope, intents, actions, answer, handoff)
                                        │
                                      audit
                              (hash-chained events)
```

Dependencies point inward. `domain` depends on nothing but Zod; every other package
depends on `domain` and may not widen its contracts locally.

---

## The nine stages

`packages/orchestration/src/pipeline.ts` — `handleClientMessage()`.

### 1. Pre-process

Message length, attachment count, attachment size and MIME type are checked against
fixed limits. Unsupported or oversized files are quarantined rather than processed.
The message is wrapped as *quoted data* with an explicit non-instruction notice, its
delimiters neutralised so it cannot forge the end of its own block, and scanned for
instruction-shaped content. Detection does not refuse the request — it raises a risk
flag and routes the outcome to a person.

### 2–3. Identity, context, authorised scope

`computeScope()` in `packages/auth/src/authority.ts` turns an account plus a requested
person/company context into an **`AuthorisedScope`**: concrete lists of party, policy,
claim, document and receipt ids, together with the grants applied and the basis on
which they were granted.

This is the single most load-bearing design choice in the platform. Scope is a
**list**, not a predicate evaluated later. Everything downstream reads through it, so
a record the caller may not see is never in the working set at all. Cross-client
leakage becomes a structural impossibility rather than a behaviour to test for — and
the evaluation suite still tests for it, on the principle that a claim nobody checks
is a claim nobody should believe.

Three rules that follow from it:

- **Organisation context replaces personal scope.** Acting for Talleres Serrano means
  seeing Talleres Serrano, not Serrano *plus* your own policies.
- **Delegation expands only the grants actually given.** Ana holds `VIEW_POLICIES`
  over Luis. She sees his policies and none of his claims, documents or receipts.
- **Special-category data never travels through a delegation.** The subject reaches
  it; nobody reaches it on their behalf.

A request for a context the caller has no authority over does not throw. It returns an
empty scope, writes an `ACCESS_DENIED` event, and answers with a plain sentence.

### 4. Intent classification

The provider returns a structured `{intent, confidence, secondaryIntents, ...}` object
validated against a Zod schema, restricted to the sixteen approved intents. `UNKNOWN`
is a legitimate outcome, not a failure to be optimised away: five intents are answered
directly, the rest are classified correctly and routed to a person.

### 5. Retrieval plan

The intent — not the model — selects which sources to read, which terms to rank by,
and whether superseded documents are in play. A premium question does not open the
claims file.

### 6. Evidence retrieval

Structured facts first, documents second (ADR-0004: an authoritative fact must not
depend on semantic similarity). Everything is filtered by effective interval against
the request's `asOf` date and by source status, so a superseded schedule is marked
stale rather than quoted as current.

Where the retrieval layer finds nothing sufficient, or two sources disagree, it says
so and the direct-answer path is closed. It does **not** choose a winner. A conflict
between the ERP's 485,00 € and the schedule's 512,40 € produces an `INSUFFICIENT`
answer and a task, not an average and a confident sentence.

### 7. Draft

The provider receives the candidate evidence as an indexed list plus the permitted
action codes, and returns a `ConciergeDraft` — which deliberately contains **no ids of
any kind**, only:

- an answer type,
- the client-facing text,
- `citedEvidenceIndexes`: positions into the list it was given,
- uncertainty, follow-up questions, proposed **action codes**, a safety notice.

One controlled repair attempt is allowed if the output fails validation. A second
failure is a degraded response, not a third try.

### 8. Policy enforcement

`enforcePolicy()` in `packages/orchestration/src/policy.ts`:

1. **Resolve citations from indexes.** Out-of-range indexes are dropped. This is why
   an invented policy id cannot reach the client: the model was never able to express
   one.
2. **Downgrade unsupported material answers.** `FACT`, `EXPLANATION` and `PRELIMINARY`
   assert something about the client's cover. Without a tier A or tier B citation they
   become `INSUFFICIENT` and lose their non-procedure evidence.
3. **Filter actions to catalogue ∩ intent.** A prohibited code is a security event,
   not a validation warning. An allowed code outside its intent is dropped — a
   coverage question cannot reach for a cancellation.
4. **Add uncertainty rather than replace it.** Insufficiency reasons, conflicts, stale
   sources and injection notices accumulate.

### 9. Present, hand off, audit

The response is validated once more against `conciergeResponseSchema`, stored, and
rendered. If it proposes an action a person must act on, a handoff task is created
with the missing-information rules already evaluated. Every stage has written an audit
event by this point.

---

## Evidence and knowledge tiers

No material value travels through this platform as a bare primitive. An
`EvidenceBackedField` carries the value, its source type and id, the path within that
source, the interval it applies to, when it was observed, a confidence, and any
unresolved conflict.

| Tier | Source | May ground a client answer |
|---|---|---|
| A | ERP fields, claim records, particular conditions | yes |
| B | Contractual documents, endorsements, insurer communications | yes |
| C | Approved Rosillo procedures (labelled as procedure, never as cover) | yes |
| D | Adviser interpretation, **client statements** | no |
| E | General knowledge | no |

Client statements are tier D by definition. What a client says about their own policy
is a claim about the world, not a record, so it can never on its own support a
material answer — including when it arrives as an attached document.

---

## The action catalogue

`packages/domain/src/actionCatalogue.ts` holds two separate objects. `ALLOWED_ACTIONS`
has nine codes, each with a risk level, an automation mode and a description of the
human control. `PROHIBITED_ACTIONS` has eight, and exists only so an attempt to use
one can be *named* in a rejection and an audit event.

Prohibited actions have no handler, no route and no flag. `EXECUTE_CANCELLATION` is
not a disabled feature; it is a string in a rejection table. `PREPARE_CANCELLATION`
exists, and stops at a drafted request.

`INTENT_ACTIONS` narrows further: each intent may only produce actions from its own
list. Membership tests use `hasOwnProperty`, so `isAllowedAction('toString')` is
`false`.

Every `ProposedAction` carries `externalActionAllowed: z.literal(false)`. Changing it
is a type error, not a configuration change.

---

## The handoff

A task carries what a person actually needs to decide: the client's verbatim request,
the identity and authority behind it, the relevant policies, the verified facts with
provenance and conflicts, the client's own statements **held visually and structurally
apart** from anything Rosillo verified, the missing information with the rule id that
demanded it, the proposed outcome, the risk flags, and a link to the source
conversation.

Decisions are `APPROVE`, `APPROVE_WITH_EDITS`, `ESCALATE`, `REJECT`. Each appends a
new immutable version; none replaces the previous one. Approving while `REQUIRED`
information is outstanding needs both a supervisor role and a recorded override
reason. An employee's correction becomes a new source with `sourceId:
employee:<id>` — the record an audit needs to show who confirmed what.

---

## Audit

Every event is hashed with its predecessor's hash, so an edit or deletion in the
middle of the log is detectable rather than silent. `verifyEventChain` returns the
index of the first tampered event. The employee workspace verifies the chain on render
of the audit page, because a log nobody checks is a filing cabinet rather than a
control.

Metadata is non-sensitive **by schema**: values are limited to short strings, numbers,
booleans and small string arrays. Raw policy text, claim text, message text and answer
text never enter an audit event. There is no chain-of-thought storage anywhere
(ADR-0009): an `AIRun` records input and output hashes, a policy verdict, schema
validity, repair count, latency and token counts — never reasoning.

---

## Persistence

`PlatformStore` is a port with two implementations: `InMemoryStore` (tests, the
evaluation suite) and `JsonlStore` (both applications). Every mutation appends one
line to a file, which is a poor database and an excellent audit log.

The two applications are separate processes sharing one directory, so `JsonlStore`
fingerprints each file's size and mtime and reloads when another process has written.
Audit events chain from what is already on disk rather than from a per-process
counter. ADR-0011 records why this is acceptable for a prototype and what a pilot
needs instead.

---

## Language

Spanish first, in the product and in the code that touches it. Two consequences worth
recording because both cost real debugging time:

- A regex `\b` after a Spanish *stem* never matches, because the stem is followed by
  an inflected ending: `/cubiert\b/` does not match "cubierta". There is a regression
  table for inflected forms in `packages/ai/test/mockProvider.test.ts`.
- es-ES/CLDR omits the thousands separator below five digits, so 4 821 formats as
  `4821` and 12 345 as `12.345`. This is the RAE convention, and it is correct.
