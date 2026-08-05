# ADR-0013 — Security configuration fails closed

**Status:** accepted · **Date:** 2026-08-05

## Context

The session signing secret had a fallback: `process.env.AUTH_SECRET ?? 'dev-only-secret-change-me'`.
That placeholder is committed in `.env.example`, so anyone who can read the repository
could mint a valid session for any account in a deployment that had simply forgotten
to set the variable.

The failure mode is the dangerous kind: nothing breaks. The application starts, users
sign in, everything works, and the only symptom is that sessions are forgeable. A
default that is *convenient* and *wrong* will be shipped, because nothing ever
prompts anyone to change it.

The same reasoning applies to the other configuration this platform depends on for a
security property, and to the checks that gate a release.

## Decision

Configuration that a security property depends on fails closed outside development.

- **`AUTH_SECRET`.** Production refuses to sign or verify a session unless a secret is
  set, differs from the published placeholder, and is at least 32 characters. Failure
  is a thrown `MisconfiguredSecretError` on the first request, not a degraded mode.
  Development keeps the placeholder and warns: requiring a real secret to run the demo
  would only teach people to paste one in and stop reading.
- **`npm audit --audit-level=high`** runs first in `scripts/verify.sh`, so a
  high-severity advisory in a shipped dependency fails verification like any other
  defect. It found three the day it was added.
- **Predicates take their input explicitly.** `secretProblem(value)` does not default
  to reading the environment. A security predicate where passing `undefined` quietly
  means "check something else" reads as tested and is not.

## Consequences

- A deployment that forgets `AUTH_SECRET` is broken and obvious, rather than working
  and exploitable. That is the trade this ADR is making, and it is the right way round
  for anything holding a session.
- The end-to-end suite has to supply a secret, because `next start` runs in production
  mode. It passes a fixed test value, which keeps runs reproducible.
- A newly disclosed vulnerability can fail an unrelated change's verification. That is
  a feature: the alternative is finding out later. When one genuinely cannot be fixed
  yet, the decision to accept it gets recorded rather than the gate removed.
