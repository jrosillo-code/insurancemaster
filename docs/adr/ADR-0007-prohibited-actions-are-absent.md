# ADR-0007 — Prohibited actions are absent, not disabled

**Status:** accepted · **Date:** 2026-08-05

## Context

The prototype must never send an external message, bind or issue a policy, execute a
cancellation or amendment, approve or deny a claim, price life or health risk, switch
insurer, or write to a system of record.

The obvious implementation is a feature flag: implement the capability, default it
off. That is how these things usually get shipped, and it is why they usually get
shipped by accident — a flag is one config change, one merge, or one misread
environment variable away from being on.

## Decision

Prohibited actions have **no implementation**. `PROHIBITED_ACTIONS` is a table of
codes and refusal reasons, existing only so an attempt can be named in a rejection and
an audit event. There is no mail client, no insurer client and no write path to a
system of record anywhere in the dependency tree.

`ALLOWED_ACTIONS` contains nine codes. Where a regulated operation exists at all, it
exists as `PREPARE_*` and stops at a drafted request for a person.

Every `ProposedAction` carries `externalActionAllowed: z.literal(false)`.

## Consequences

- "Could this be turned on by mistake?" has a structural answer: not without writing
  the capability, which is a visible change under review.
- Changing `externalActionAllowed` is a type error rather than a configuration change.
- Three independent layers enforce it — the policy stage, the task-creation gate, and
  the absence of any capability — which is redundant on purpose.
- A future approved external action means new code, new tests and a new ADR. That is
  the intended cost.
