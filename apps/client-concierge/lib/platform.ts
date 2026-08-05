import 'server-only';
import { AnthropicConciergeProvider, MockConciergeProvider, type ConciergeAIProvider } from '@rosillo/ai';
import { InMemorySessionRegistry, checkSessionSecret, type SessionRegistry } from '@rosillo/auth';
import { SyntheticCustomer360 } from '@rosillo/customer-360';
import { PostgresStore, createStore, resolveStoreKind, type PlatformStore } from '@rosillo/store';
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
 * The store is chosen from the environment (ADR-0011): JSONL files locally, where
 * both applications share a directory, and Postgres when DATABASE_URL is set. A
 * hosted deployment must use Postgres — a serverless filesystem is neither shared
 * with the employee workspace nor durable between requests, so the handoff would
 * silently never happen.
 */

declare global {
  // eslint-disable-next-line no-var
  var __rosilloPlatform: PipelineDeps | undefined;
  // eslint-disable-next-line no-var
  var __rosilloSessions: SessionRegistry | undefined;
}

/**
 * Where session records live.
 *
 * Postgres when there is one, so revoking a session on the instance that served the
 * sign-out applies to every other instance too. In-memory otherwise, which is correct
 * for a single local process and would be wrong on a serverless host — hence the
 * store-backed path being the one a deployment takes.
 */
export function sessions(): SessionRegistry {
  globalThis.__rosilloSessions ??= (() => {
    const store = platform().store;
    return store instanceof PostgresStore ? store.sessionRegistry() : new InMemorySessionRegistry();
  })();
  return globalThis.__rosilloSessions;
}

function build(): PipelineDeps {
  // Throws in production if AUTH_SECRET is missing or is the published placeholder,
  // so a misconfigured deployment fails on its first request rather than running with
  // forgeable sessions (ADR-0013).
  const warning = checkSessionSecret();

  const store: PlatformStore = createStore();
  const provider: ConciergeAIProvider =
    process.env['AI_PROVIDER'] === 'anthropic' ? new AnthropicConciergeProvider() : new MockConciergeProvider();

  // One line, once, naming what is actually active. Worth having: "which store is
  // this deployment using" is the first question when a task fails to appear, and
  // guessing from behaviour costs far more than printing it.
  console.info(
    `[rosillo] concierge starting — store=${resolveStoreKind()} provider=${provider.name} model=${provider.model}`,
  );
  if (warning) console.warn(`[rosillo] ${warning}`);

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
