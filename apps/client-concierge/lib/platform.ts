import 'server-only';
import { MockConciergeProvider, type ConciergeAIProvider } from '@rosillo/ai';
import { SyntheticCustomer360 } from '@rosillo/customer-360';
import { JsonlStore, type PlatformStore } from '@rosillo/store';
import { RateLimiter } from '@rosillo/domain';
import { randomIdFactory, type PipelineDeps } from '@rosillo/orchestration';

/**
 * Process-wide platform singletons.
 *
 * `server-only` at the top is load-bearing: importing this module from a client
 * component is a build error, which is what keeps the dataset, the store and the
 * provider out of the browser bundle (blueprint §21 "no provider calls in client
 * code").
 *
 * The store is JSONL-backed and shares its directory with the employee workspace,
 * so a task created here appears there. That is a prototype convenience — see
 * docs/adr/ADR-0011 for the production path.
 */

declare global {
  // eslint-disable-next-line no-var
  var __rosilloPlatform: PipelineDeps | undefined;
}

function build(): PipelineDeps {
  const provider: ConciergeAIProvider = new MockConciergeProvider();
  const store: PlatformStore = new JsonlStore();
  return {
    c360: new SyntheticCustomer360(),
    store,
    provider,
    ids: randomIdFactory(),
    rateLimiter: new RateLimiter(),
  };
}

/** Reused across requests so the rate limiter and JSONL cache survive hot reloads. */
export function platform(): PipelineDeps {
  globalThis.__rosilloPlatform ??= build();
  return globalThis.__rosilloPlatform;
}

/** "Today" for the synthetic dataset. Fixed so renewal windows stay meaningful. */
export const DEMO_TODAY = '2026-08-05';

export function nowIso(): string {
  return new Date().toISOString();
}
