# ADR-0012 — Orchestration is a separate package from the AI provider

**Status:** accepted · **Date:** 2026-08-05

## Context

The pipeline needs `auth`, `customer-360`, `retrieval`, `actions`, `store` and `ai`.
Putting it inside `@rosillo/ai` would have made the provider abstraction depend on
authorisation, the read model and persistence — inverting the dependency and making
`ai` impossible to reason about or replace in isolation.

## Decision

`@rosillo/ai` stays a low-level package: the provider port, the prompt registry, the
deterministic mock and the Anthropic implementation. It depends only on `@rosillo/domain`.

`@rosillo/orchestration` sits above and composes everything, and is where
`handleClientMessage` and `enforcePolicy` live.

## Consequences

- The dependency graph is acyclic and each layer is testable alone: provider tests
  need no store, policy tests need no provider.
- Adding a provider touches one small package with one dependency.
- One more package boundary and a slightly longer import path. Worth it — the
  alternative buries the platform's most important code inside the package named after
  the part that is least trusted.
