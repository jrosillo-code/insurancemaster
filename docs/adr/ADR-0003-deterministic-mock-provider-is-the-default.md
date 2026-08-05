# ADR-0003 — The deterministic mock provider is the default

**Status:** accepted · **Date:** 2026-08-05

## Context

The platform needs an AI provider for two stages. Using a live model as the default
would mean: no offline development, a cost per test run, and — decisively — an
evaluation whose numbers move when the model moves, so a regression in retrieval or
policy enforcement is indistinguishable from model variance.

## Decision

`MockConciergeProvider` is the default everywhere: development, tests and the
evaluation suite. Keyword classification, template drafting, no randomness, no
network, no clock. It implements the same `ConciergeAIProvider` port as the live
provider, including the ability to produce output the pipeline must reject.

`AnthropicConciergeProvider` (Claude Opus 5, structured outputs, adaptive thinking) is
opt-in via `AI_PROVIDER=anthropic` and used for evaluation. The evaluation CLI
requires an explicit `--live` flag *and* an API key, and warns that results are not
reproducible.

## Consequences

- A change in the evaluation score means a change in behaviour. That is the whole
  point.
- Tests run in ~3 seconds with no network and no key.
- The mock's classifier is a keyword engine, so it needs maintaining as the corpus
  grows — writing the evaluation suite surfaced seven genuine gaps in it. That
  maintenance is cheap and the failures it produces are legible.
- Live-provider quality must be measured separately; the mock proves the *platform*
  works, not that a model does.
