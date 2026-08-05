# ADR-0004 — Prototype authentication is deliberately not real

**Status:** accepted · **Date:** 2026-08-05

## Context

Demonstrating the authority model needs many identities: a delegated spouse, an adult
child with no grant, a company admin, a company employee with a narrower grant, an
unrelated namesake. Building real authentication would consume the prototype's budget
without demonstrating anything the prototype exists to demonstrate.

## Decision

A shared demo password (`demo`) over seeded synthetic accounts, in both applications.
The login page lists every account and what it is for. The session is a signed cookie.

This is labelled as prototype-only on the page itself, in the README, and in the
threat model, which names it as the first thing a pilot must replace.

## Consequences

- Anyone who can reach the application can be anyone. Acceptable only because every
  record is invented.
- The authority model is genuinely exercised: switching accounts switches scope, and
  the access-control cases are demonstrable in the browser in under a minute.
- A pilot uses the existing Rosillo app identity. The seam is `packages/auth/src/session.ts`
  and the `Employee`/`Account` lookups — nothing above them assumes how identity was
  established.
