# Rosillo AI Platform

**Prototype. Synthetic data only. Not connected to anything real.**

A governed platform with two surfaces over one controlled core:

- **Client Concierge** — a mobile-first, Spanish-first assistant that answers a client's
  questions about their own insurance from Rosillo's own records, cites where every
  material statement came from, and says plainly when it cannot confirm something.
- **Employee Copilot** — the workspace where every request the assistant is not
  allowed to resolve arrives as a prepared task: the client's exact words, the
  authority they acted under, the verified facts with provenance, what is missing,
  and an approve / edit / escalate / reject decision that becomes a client-visible
  status.

The interesting part is what sits between them. The model interprets language; code
and approved rules decide everything else.

---

## What this is not

This prototype **does not**:

- connect to segElevia, Gmail, the Rosillo customer app, any insurer portal, or any
  real Rosillo or customer data;
- send an email, a letter or any other message outside the platform;
- bind, issue, amend or cancel a policy — it prepares requests for a person;
- approve, deny or settle a claim;
- price life or health risk;
- write to a system of record.

Those are not disabled features behind a flag. There is no code path for any of them:
see [`packages/domain/src/actionCatalogue.ts`](packages/domain/src/actionCatalogue.ts),
where the prohibited actions exist only as names in a rejection table, and
[`docs/threat-model.md`](docs/threat-model.md).

The client-facing statement of the same boundary is at `/limitaciones` in the
Concierge.

---

## Quick start

```bash
npm install
cp .env.example .env            # the defaults are safe: mock provider, local JSONL store

# Development runs with a placeholder signing key and says so. Production refuses to
# start a session without a real one:
#   openssl rand -hex 32   →  AUTH_SECRET

npm run dev:concierge           # http://localhost:3000  — client surface
npm run dev:employee            # http://localhost:3001  — employee workspace
```

Both applications share one JSONL data directory (`ROSILLO_DATA_DIR`, default
`.data`), so a task created in the Concierge appears in the Copilot. Sign in with any
synthetic account; the password is `demo` and every account is listed on the login
page.

A five-minute demo:

| Step | Account | Say this | What to look for |
|---|---|---|---|
| 1 | `ana@cliente.test` | `¿Cuál es la franquicia de mi coche?` | A `FACT`, the figure, and an evidence card that opens on the exact clause |
| 2 | `ana@cliente.test` | `¿Qué seguros tiene mi hija Marta?` | Nothing of Marta's — an adult household member grants nothing |
| 3 | `rosa@cliente.test` | `¿Cuánto pago por el seguro de hogar?` | `INSUFFICIENT`: the ERP and the schedule disagree and the platform refuses to pick |
| 4 | `miguel@cliente.test` | `¿Cuál es la franquicia de mi coche?` | 150 €, not the 300 € the superseded schedule still says |
| 5 | `javier@cliente.test` | `Necesito una copia de las condiciones de la póliza de RC` | The document exists but he holds no grant for it, so it is simply absent |
| 6 | `ana@cliente.test` | `Quiero dar de baja el seguro del coche.` | An action card that says *prepared*, never *done* |
| 7 | `carlos@rosillo.test` (Copilot) | — | The task from step 6, with everything a reviewer needs, and four decisions |
| 8 | `carlos@rosillo.test` → Auditoría | — | One hash-chained trail spanning both applications |

---

## Verification

```bash
npm run verify        # audit + typecheck + tests + evaluation gates + production build
```

Or individually:

```bash
npm run audit         # dependency vulnerabilities, gated at high severity
npm run typecheck     # every package and both applications
npm test              # 232 unit, integration and security tests
npm run evaluate      # 78 labelled Concierge cases; exits non-zero on a gate failure
npm run build         # production build of both applications
npm run test:e2e      # 33 Playwright tests, including the cross-application handoff
```

`npm run test:e2e` needs a production build first and starts both applications itself.

---

## Repository layout

```
packages/
  domain/          contracts: evidence, scope, intents, action catalogue, answer, handoff
  audit/           append-only hash-chained events
  store/           the persistence port + in-memory, JSONL and Postgres implementations
  auth/            identity, delegated authority, scope computation
  customer-360/    the authorised read model and the synthetic dataset
  retrieval/       retrieval plans and evidence retrieval with effectivity filtering
  ai/              provider abstraction, prompt registry, deterministic mock, Anthropic
  actions/         the approved-action state machine and missing-information rules
  orchestration/   the nine-stage pipeline and policy enforcement
  evals/           the labelled evaluation suite and its metrics
apps/
  client-concierge/   Next.js — the client surface
  employee-copilot/   Next.js — the employee workspace
tests/
  security/        authorisation, untrusted input, action boundary, audit and privacy
  e2e/             Playwright, both applications
supabase/
  migrations/      the Postgres schema, append-only triggers and RLS
docs/
  architecture.md, threat-model.md, evaluation.md, deployment.md,
  implementation-status.md, runbook.md, adr/
```

---

## How an answer is produced

Nine stages, in this order, every time
([`packages/orchestration/src/pipeline.ts`](packages/orchestration/src/pipeline.ts)):

1. pre-process and sanitise the message and any attachments
2. authenticate and resolve the active person/company context
3. compute the **authorised scope** — a concrete allow-list of record ids
4. classify the intent using structured output
5. build a narrow retrieval plan from the intent
6. retrieve evidence *within that scope*
7. draft a typed answer over that evidence
8. enforce policy and action rules, substituting real ids
9. present, create any task, and write immutable audit events

The model participates in stages 4 and 7 only. It never sees the database, never
selects a record id, and never decides whether an action is permitted. Three
consequences are worth stating plainly:

- **Cross-client leakage is structural, not behavioural.** Scope is an id allow-list
  computed before the model is called. "Show me Carlos's policy" fails because the id
  is not in the list, not because the model declined.
- **Citations are by index.** The model returns positions into the candidate list it
  was given; orchestration substitutes the real ids and drops anything out of range.
  An invented identifier cannot survive.
- **No material claim without evidence.** An answer asserting something about the
  client's cover must carry a tier A or tier B citation, or it is downgraded to
  `INSUFFICIENT` before the client ever sees it.

See [`docs/architecture.md`](docs/architecture.md) for the full picture and
[`docs/adr/`](docs/adr/) for why each part is shaped the way it is.

---

## The AI provider

The default is a deterministic mock: keyword classification and template drafting, no
randomness, no network, no clock. That is what makes the evaluation numbers
comparable between runs — a score change means a behaviour change rather than model
variance.

A live Anthropic provider is available and opt-in (`AI_PROVIDER=anthropic`, plus
`ANTHROPIC_API_KEY`). It is used for evaluation, not as the default, and only ever
sees synthetic content. Providers are treated as untrusted in either case: every
output is schema-validated, every identifier is substituted server-side, and every
proposed action is filtered through the approved catalogue.

---

## Evaluation

78 hand-labelled synthetic cases across ten categories, run through the real pipeline.
Six acceptance gates fail the build rather than the report:

| Gate | Current |
|---|---|
| No cross-client leakage | 0 cases |
| No unsupported material statement | 0% |
| Every proposed action in the approved catalogue | 100% |
| No uncaught pipeline error | 0 |
| Every refusal degraded safely | 100% |
| All labelled cases pass | 78/78 |

Run `npm run evaluate` for the full scorecard, or see
[`docs/evaluation.md`](docs/evaluation.md).

---

## Deploying it

Two Vercel projects — one per application — over one Supabase Postgres database. The
shared database is what makes the handoff work; the JSONL store cannot, because a
serverless filesystem is neither shared nor durable.

```bash
export DATABASE_URL='postgresql://...pooler.supabase.com:5432/postgres'
npm run db:migrate
```

Step-by-step instructions, the environment variables each project needs, and how to
tell whether it actually worked: [`docs/deployment.md`](docs/deployment.md).

A deployed instance is still a demo behind a shared password. Putting it on the
internet does not change the synthetic-data-only rule — it sharpens it.

---

## Boundaries that must not move

- **Synthetic data only.** No real Rosillo or customer data, in any environment, at
  any time, including in developer tooling and personal model accounts.
- **`externalActionAllowed` is `false`**, everywhere, as a type-level literal. It
  changes only under an explicitly approved server-side policy that does not exist
  yet.
- **The Waypoint travel application is a separate product.** It is not modified,
  imported, deployed with, or coupled to anything here.
- **No raw policy, claim or message text in logs** by default.
