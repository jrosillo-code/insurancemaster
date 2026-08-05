# Architecture decision records

One file per decision that would otherwise be re-litigated every few months. Each
records the context, what was decided, and what it costs — including where the
decision is wrong for anything beyond a prototype.

| ADR | Decision |
|---|---|
| [0001](ADR-0001-customer-360-is-a-read-model.md) | Customer 360 is a read model, never a system of record |
| [0002](ADR-0002-evidence-backed-fields.md) | Every material value carries its provenance |
| [0003](ADR-0003-deterministic-mock-provider-is-the-default.md) | The deterministic mock provider is the default |
| [0004](ADR-0004-prototype-authentication.md) | Prototype authentication is deliberately not real |
| [0005](ADR-0005-providers-are-untrusted.md) | AI providers are untrusted input |
| [0006](ADR-0006-authorised-scope-is-a-list-not-a-predicate.md) | Authorised scope is a list of ids, not a predicate |
| [0007](ADR-0007-prohibited-actions-are-absent.md) | Prohibited actions are absent, not disabled |
| [0008](ADR-0008-append-only-hash-chained-audit.md) | The audit log is append-only and hash-chained |
| [0009](ADR-0009-no-chain-of-thought-storage.md) | No chain-of-thought is stored |
| [0010](ADR-0010-typed-answer-contract.md) | The answer is a typed contract, not a string |
| [0011](ADR-0011-jsonl-store.md) | JSONL files for prototype persistence — **supersede before pilot** |
| [0012](ADR-0012-orchestration-is-its-own-package.md) | Orchestration is a separate package from the AI provider |

If you are about to change one of these, write the next ADR rather than editing the
old one. The reasoning that was true at the time is the useful part.
