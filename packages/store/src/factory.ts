import { InMemoryStore, JsonlStore, type PlatformStore } from './index';
import { PostgresStore } from './postgres';

/**
 * Chooses a store from the environment.
 *
 * Three implementations behind one port (ADR-0011): memory for tests, JSONL for local
 * development, Postgres for anything hosted. The choice is explicit rather than
 * inferred, because "it worked locally and silently lost every conversation in
 * production" is the failure this avoids.
 *
 * Setting `DATABASE_URL` selects Postgres on its own. That is deliberate: on a
 * serverless host the filesystem is neither shared nor durable, so a deployment that
 * has a database and quietly used JSONL files anyway would appear to work and lose
 * everything between requests.
 */

export type StoreKind = 'memory' | 'jsonl' | 'postgres';

export function resolveStoreKind(env: NodeJS.ProcessEnv = process.env): StoreKind {
  const explicit = env['ROSILLO_STORE']?.trim().toLowerCase();
  if (explicit === 'memory' || explicit === 'jsonl' || explicit === 'postgres') return explicit;
  if (explicit && explicit.length > 0) {
    throw new Error(`ROSILLO_STORE must be one of memory, jsonl, postgres — got "${explicit}".`);
  }
  return env['DATABASE_URL'] ? 'postgres' : 'jsonl';
}

export function createStore(env: NodeJS.ProcessEnv = process.env): PlatformStore {
  switch (resolveStoreKind(env)) {
    case 'memory':
      return new InMemoryStore();
    case 'postgres':
      return new PostgresStore({ connectionString: env['DATABASE_URL'] ?? '' });
    case 'jsonl':
    default:
      return new JsonlStore(env['ROSILLO_DATA_DIR'] ?? '.data');
  }
}
