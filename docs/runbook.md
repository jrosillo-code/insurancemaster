# Runbook

Operating notes for the prototype. **Synthetic data only** — none of these procedures
should ever be run against real Rosillo or customer data, because there isn't any and
there must not be.

---

## Running it

```bash
npm install
cp .env.example .env
npm run dev:concierge     # :3000
npm run dev:employee      # :3001
```

Both processes must share `ROSILLO_DATA_DIR` or the handoff will not work. The default
(`.data`) resolves relative to the **process working directory**, so run both from the
repository root. Starting them via `npm run start -w <package>` sets the cwd to the
package directory, which is why the Playwright config passes an absolute path.

Symptom of getting this wrong: the client says a task was created, the employee queue
stays empty, and nothing errors. Check for a stray `apps/*/.data`.

## Resetting the data

```bash
rm -rf .data
```

Everything is regenerated on next use; the synthetic dataset is built in memory from
`packages/customer-360/src/synthetic/`. Restarting is not required — `JsonlStore`
notices the files are gone and rebuilds its cache.

## Configuration that must be set

`AUTH_SECRET` is the only variable without a safe default. In development the
placeholder is used and a warning is logged; **in production the platform refuses to
issue or verify any session without a real one**, so a deployment that forgets it
fails immediately rather than running with forgeable cookies.

```bash
openssl rand -hex 32
```

It must be at least 32 characters and must not be the placeholder from
`.env.example`. Rotating it invalidates every existing session, which is currently
the only way to revoke one.

## Verification

```bash
npm run verify
```

Runs, in order: typecheck → tests → evaluation gates → production build. Each step
fails the script. The end-to-end suite is separate because it starts servers:

```bash
npm run build && npm run test:e2e
```

---

## Common failures

### `npm run test:e2e` cannot find a browser

The environment ships Chromium at a fixed path with a revision Playwright does not
expect, and downloading is blocked. The config sets `executablePath` to
`/opt/pw-browsers/chromium`; override with `PLAYWRIGHT_CHROMIUM_PATH` elsewhere. Do
not run `playwright install`.

### The client shows a stale task status

`JsonlStore` reloads on a size+mtime fingerprint change. If a file is written with the
same size and an unchanged mtime — possible on a coarse-grained filesystem — the
reload is missed. Touch the file or restart. A pilot on PostgreSQL does not have this
problem (ADR-0011).

### The audit chain reports as broken

First check whether anything edited `audit.jsonl` by hand, including an editor that
rewrote line endings. The chain covers content and order, so any modification breaks
it from that index onward — which is the point. If nothing touched it, treat it as a
stop condition (see the threat model) rather than something to work around.

### Two processes wrote at once

Audit appends take an advisory lock (`<file>.lock`), so the chain cannot fork. If a
process is killed mid-append the lock file survives; the next writer breaks it after
ten seconds and continues, so this self-heals. A `.lock` file that is still present
long after everything has stopped can simply be deleted.

Non-audit appends are single `write` calls and are not locked. A malformed line from
an interleaved write is skipped on load rather than crashing the app.

### The evaluation fails after a classifier change

Expected, and useful. `npm run evaluate` prints each failing case with its rationale
and the exact check that failed. Decide whether the label or the platform is wrong —
both happen. Do not relax a gate to make a run pass.

---

## Switching to a live provider

```bash
export AI_PROVIDER=anthropic
export ANTHROPIC_API_KEY=...      # never commit this
npm run evaluate -- --live
```

Only synthetic content is ever sent. Results are not reproducible and the run costs
money, which is why `--live` is required in addition to the environment variable and
the CLI says so before it starts.

`ANTHROPIC_MODEL` overrides the default model if needed.

---

## Adding a synthetic client

`packages/customer-360/src/synthetic/anchors.ts` for a hand-crafted scenario with
stable ids (the ones the evaluation suite and the tests reference), or
`generated.ts` for volume. Run `npm test` afterwards:
`assertIntegrity` checks referential integrity, duplicate ids and orphaned records, and
will tell you exactly what is inconsistent.

Person identifiers pass through `invalidateCheckLetter`, which guarantees a synthetic
NIE can never be a checksum-valid real one. Do not bypass it.

## Adding an approved action

1. Add the code to `ALLOWED_ACTIONS` with its risk, automation mode and human control.
2. Add it to `INTENT_ACTIONS` for the intents that may propose it.
3. Add a queue mapping in `queueForAction`.
4. Add missing-information rules in `packages/actions/src/rules/missingInfo.ts` and
   bump `MISSING_INFO_RULES_VERSION`.
5. Add evaluation cases.

If the action would do anything outside Rosillo, stop. See ADR-0007 — that is a new
ADR and a different conversation, not a catalogue entry.

---

## Before a pilot

Not a backlog — a list of things that are wrong on purpose and must be fixed before
anything real touches this:

1. **Authentication.** Replace the shared demo password with the Rosillo app identity
   (ADR-0004). Attempts are throttled now, but the credential is still known.
2. **Session revocation.** Tokens are stateless and valid until they expire. Signing
   out clears the cookie; it does not invalidate a token already copied.
3. **Audit durability.** The application can still rewrite its own audit file. A pilot
   needs an append-only store it cannot (ADR-0011).
4. **Rate limiting.** Both the request limiter and the sign-in throttle are
   per-process, so they are per-instance behind a load balancer.
5. **A DPIA**, before any real personal data. The prototype's answer to "is there a
   lawful basis for this processing" is "there is no processing of real data".

Already done, and worth not undoing: a real `AUTH_SECRET` is required in production,
security headers and a nonce-based CSP are emitted by both applications, sign-in is
throttled, concurrent audit appends are locked, and `npm audit` is gated in
`scripts/verify.sh`.
