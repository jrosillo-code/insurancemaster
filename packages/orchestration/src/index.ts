/**
 * @rosillo/orchestration — the nine-stage controlled Concierge pipeline.
 *
 * The model interprets language; code and approved rules decide everything else
 * (blueprint §10.1). Kept separate from @rosillo/ai so the provider abstraction
 * stays a low-level dependency and orchestration can compose auth, retrieval,
 * actions, audit and storage above it (ADR-0012).
 */

export * from './pipeline';
export * from './policy';
export * from './ids';
