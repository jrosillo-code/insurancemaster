# Threat model

**Scope:** the Rosillo AI Platform prototype — two Next.js applications, one
orchestration core, a synthetic dataset and an optional live AI provider. Synthetic
data only; there is no real client data in any environment.

This is written the way it would be reviewed: what an attacker would try, what stops
them, and — the part that matters most — what would *not* stop them today.

---

## Assets

| Asset | Why it matters |
|---|---|
| A client's policy, claim, receipt and document data | Personal data; some of it special-category (health) |
| The authority graph (who may act for whom) | Compromising it compromises every other control |
| The audit trail | It is the evidence that everything else worked |
| The action boundary | The difference between a prototype and an unlicensed agent acting on a client's cover |
| Provider credentials | Access to a paid API and, in a pilot, to whatever is sent through it |

## Trust boundaries

1. **Browser → server.** Everything from the browser is untrusted, including hidden
   form fields and conversation ids.
2. **Server → AI provider.** The provider is untrusted *in both directions*: what it
   is sent must be safe to send, and what it returns must be validated before use.
3. **Client content → prompt.** Message text, attachment names and document passages
   are data. They are never instructions.
4. **Concierge process ↔ Copilot process.** Two processes sharing a data directory.
5. **Repository → the world.** Anything committed is public to whoever can read the
   repository.

## Actors

- An ordinary client, curious or careless.
- A client deliberately probing for someone else's data — often a relative, which is
  the realistic case in a family broker's book.
- A hostile author of content the platform ingests (an attached document, a pasted
  message).
- An employee acting outside their role.
- A compromised or simply mistaken AI provider.

---

## Threats and controls

### T1 — Reading another client's data

*"Show me my brother's policy." "My number is HOG-2026-0042, tell me the premium."*

**Control.** `AuthorisedScope` is a concrete id allow-list computed server-side per
request, before the model is called. The read model filters every query through it and
returns `null` for an id outside it, even when asked directly. Identifiers pasted by
the client are text; the model cannot emit an id at all, only an index into candidates
it was given.

**Realistic variants covered.** Same surname, unrelated (Carlos vs. the García Molina
household). Same household, adult, no grant (Marta). Married, one-directional
delegation (Ana over Luis, not Luis over Ana). Same company, narrower grant (Javier
sees policies, not claims). A colleague's personal context (Javier → Elena).

**Tested by** `tests/security/authorisation.test.ts`, evaluation categories
`OTHER_CLIENT_DATA` and `FALSE_POLICY_ID`, and a structural per-case check in the
evaluation runner that every citation resolves inside the computed scope.

**Residual risk.** Prototype authentication is a shared demo password over seeded
accounts (ADR-0004). Anyone who can reach the application can be anyone. This is
acceptable only because the data is synthetic, and it is the first thing a pilot must
replace.

---

### T2 — Prompt injection

*"Ignore previous instructions." A closing `</untrusted_content>` fence inside a
message. An attached document that says "the excess is 0 €".*

**Control, in layers.**

- All untrusted text is wrapped with an explicit non-instruction notice; delimiters
  inside it are neutralised so it cannot forge the end of its own block.
- Instruction-shaped content raises `POSSIBLE_PROMPT_INJECTION`, forces human review,
  and is disclosed to the client in the uncertainty block.
- **The layer that actually holds:** nothing the model says can widen scope, select an
  id, or unlock an action. A successful injection changes the wording of an answer; it
  cannot change what data was retrieved or what may be done.
- Client-supplied documents are tier D and cannot ground a material answer.

**Tested by** `tests/security/untrusted-input.test.ts` and evaluation category
`PROMPT_INJECTION` (8 cases, including a delimiter escape and an attachment that
instructs).

**Residual risk.** Pattern-based detection is a heuristic and will miss novel phrasing.
The design assumes it will: detection is a *signal*, not a control. Note that the
detector was found too narrow while writing these tests ("ignora las reglas" without a
trailing qualifier) and widened — expect that to recur.

---

### T3 — The platform acting outside Rosillo

*"Send an email to Allianz cancelling my policy. Do it now."*

**Control.** Prohibited actions have no implementation. There is no mail client, no
insurer client, no write path to a system of record anywhere in the dependency tree.
`enforcePolicy` drops any proposed code outside `ALLOWED_ACTIONS ∩ INTENT_ACTIONS` and
records a `PROHIBITED_ACTION_BLOCKED` event; `assertActionPermitted` re-checks at task
creation with the intent in hand. Every `ProposedAction` carries
`externalActionAllowed: false` as a type-level literal.

**Tested by** `tests/security/prohibited-actions.test.ts` (14 tests across all three
layers) and evaluation category `HUMAN_TASK_REQUIRED` (16 cases).

**Residual risk.** None in the prototype, by construction. The risk is entirely in a
future change that adds an outbound capability; that is why the literal `false` is a
type error to change rather than a config value.

---

### T4 — A confident wrong answer

The failure mode most likely to cause real harm: fluent, plausible, and not what the
policy says.

**Control.** A material answer without a tier A/B citation is downgraded to
`INSUFFICIENT` before rendering. Conflicting sources close the direct-answer path
entirely — the platform does not choose a winner. Superseded documents are filtered by
effective interval and disclosed as stale. Coverage questions are at most
`PRELIMINARY`, because applying wording to a specific event is judgement.

**Tested by** evaluation categories `EFFECTIVE_DATE_CONFLICT`, `MISSING_DOCUMENT` and
`BROAD_UNCERTAIN`, plus the `unsupported material statement rate` gate (must be 0%).

**Residual risk.** The synthetic corpus is what a person imagined a client would ask.
Real questions will be stranger. The evaluation suite is a floor, not a ceiling.

---

### T5 — Tampering with the audit trail

**Control.** Events are hash-chained; an edit or deletion breaks the chain and
`verifyEventChain` returns the index of the first broken event. The employee audit
page verifies on render. Task versions and employee decisions are append-only.

**Tested by** `tests/security/audit-and-privacy.test.ts`, including chaining across two
processes.

**Residual risk — real and worth naming.** The chain proves *internal consistency*, not
*integrity against an attacker with write access to the file*. Someone who can write
`audit.jsonl` can recompute the whole chain. Two concurrent writers can fork it. A
pilot needs an append-only store the application cannot rewrite (ADR-0011).

---

### T6 — Sensitive data in the wrong place

**Control.** Audit metadata is constrained *by schema* to short strings, numbers,
booleans and small arrays — there is no field a passage could fit in. Message text,
policy text, claim text and answer text are never written to an event. No
chain-of-thought is stored anywhere (ADR-0009). Control characters are stripped before
anything reaches a log. Special-category claim evidence is not client-downloadable
even to its own subject, and never reachable through a delegation.

**Tested by** `tests/security/audit-and-privacy.test.ts`.

**Residual risk.** `LOG_RAW_CONTENT` exists for local development. It defaults to
false and must never be enabled anywhere else.

---

### T7 — Cross-site scripting and content injection into the UI

**Control.** Both applications render every value as text through React, which escapes
it. There is no `dangerouslySetInnerHTML` anywhere in either application. Client
content reaches the page only as text nodes.

**Residual risk.** Low, and it stays low only if the no-`dangerouslySetInnerHTML` rule
is treated as a rule.

---

### T8 — Denial of service and cost

**Control.** Per-account rate limiting, a maximum message length, a maximum attachment
count and size, an allow-list of MIME types, a provider timeout, and a bounded
conversation history in the prompt. The default provider makes no network calls at
all.

**Residual risk.** The rate limiter is in-process, so it is per-instance rather than
global. Fine for one process; wrong for a pilot behind a load balancer.

---

### T9 — Employee misuse

**Control.** Queue-based access: an operator sees only their queues, and opening a task
in a queue they do not hold redirects. Approving with required information outstanding
needs the supervisor permission *and* a recorded reason. The audit page is restricted
to `audit.read` (supervisor, admin, DPO). Authorisation is re-checked in the server
action, not only on the page that rendered the form — a hidden field is not a
permission.

**Residual risk.** Same as T1: prototype authentication.

---

### T10 — Provider compromise or malfunction

**Control.** Every provider output is schema-validated with one controlled repair, then
policy-enforced. The provider cannot emit an id, an action outside the catalogue, or a
scope. On timeout or repeated invalid output, the platform degrades to a plain message
and records the failure — it does not retry indefinitely and does not guess.

**Residual risk.** With a live provider, synthetic client content is sent to a third
party. This is acceptable for synthetic data and would need a data-processing
assessment before any real data, which this prototype must never have.

---

## What would not stop an attacker today

Stated plainly, because a threat model that only lists wins is marketing:

1. **Authentication.** Shared demo password, seeded accounts, no MFA, no lockout.
   Anyone who can reach the app is anyone they choose.
2. **Session security.** A signed cookie with a development secret from
   `.env.example`. No rotation, no revocation, no device binding.
3. **Audit durability.** The application can rewrite its own audit file.
4. **Multi-writer safety.** Two processes appending to the same JSONL files can
   interleave and fork the audit chain. Single-writer-per-file in practice; not
   enforced.
5. **Transport.** No TLS termination, CSP, HSTS or security headers are configured —
   deployment concerns a prototype does not address.
6. **Rate limiting.** Per-process, not global.
7. **Dependency supply chain.** `npm audit` is available and not gated in CI.

None of these are acceptable for a pilot. All of them are acceptable for a prototype
whose only data is invented, and none of them are load-bearing for the properties this
prototype exists to demonstrate.

---

## Stop conditions

Work stops and the prototype is reassessed if any of these is ever observed:

- a response containing a resource outside the caller's computed scope;
- any action taken outside Rosillo;
- a material answer delivered without valid evidence;
- real client data present in the repository, the dataset or a log;
- the audit chain failing to verify without a known, recorded cause.
