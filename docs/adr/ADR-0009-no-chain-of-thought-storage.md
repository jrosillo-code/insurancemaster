# ADR-0009 — No chain-of-thought is stored

**Status:** accepted · **Date:** 2026-08-05

## Context

It is tempting to record a model's reasoning for debugging. It is also a mistake here
on three counts: reasoning traces contain the client's data in an unstructured form
that no retention policy governs; they invite treating the model's account of itself
as an explanation of the system's behaviour; and they are not what an auditor needs.

## Decision

`AIRun` records the provider, model, prompt versions, stage, an input hash, an output
hash, the policy verdict and reason, schema validity, repair count, latency and token
counts. It does not record prompts, completions or reasoning.

Where an answer needs to explain itself, it carries an `operationalNote` — a short
statement of *which rule produced this outcome*. That is a fact about the system, not
a narrative from the model.

## Consequences

- The explanation a client or an auditor sees is the one that is actually true: this
  answer was downgraded because no tier A/B evidence supported it.
- Debugging a specific bad answer is harder — hashes identify *which* run, not what it
  said. Reproducing it deterministically with the mock provider has been the faster
  route in practice anyway.
- No unstructured personal data accumulates in an ungoverned store.
