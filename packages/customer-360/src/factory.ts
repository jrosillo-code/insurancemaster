import type { Customer360Port } from './port';
import { PostgresCustomer360 } from './postgres';
import { SyntheticCustomer360 } from './synthetic/adapter';

/**
 * Chooses a Customer 360 implementation from the environment.
 *
 * Deliberately *not* the store's rule. `createStore()` selects Postgres the moment
 * `DATABASE_URL` exists, because a hosted deployment that quietly wrote conversations
 * to a serverless filesystem would lose them. The read model is the opposite case:
 * a deployment that has a database but has not had any policies entered into it yet
 * would show every client an empty portfolio, and "all your policies vanished" is a
 * worse failure than "the demo data is still the demo data".
 *
 * So this one is explicit. `ROSILLO_C360=postgres` opts in; anything else, including
 * a database being present, keeps the synthetic dataset.
 */

export type Customer360Kind = 'synthetic' | 'postgres';

export function resolveCustomer360Kind(env: NodeJS.ProcessEnv = process.env): Customer360Kind {
  const explicit = env['ROSILLO_C360']?.trim().toLowerCase();
  if (explicit === 'synthetic' || explicit === 'postgres') return explicit;
  if (explicit && explicit.length > 0) {
    throw new Error(`ROSILLO_C360 must be one of synthetic, postgres — got "${explicit}".`);
  }
  return 'synthetic';
}

export function createCustomer360(env: NodeJS.ProcessEnv = process.env): Customer360Port {
  if (resolveCustomer360Kind(env) === 'postgres') {
    return new PostgresCustomer360({ connectionString: env['DATABASE_URL'] ?? '' });
  }
  return new SyntheticCustomer360();
}
