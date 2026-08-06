import 'server-only';
import { InMemorySessionRegistry, checkSessionSecret, type SessionRegistry } from '@rosillo/auth';
import { createCustomer360, resolveCustomer360Kind, type Customer360Port } from '@rosillo/customer-360';
import { PostgresStore, createStore, resolveStoreKind, type PlatformStore } from '@rosillo/store';

/**
 * Employee-side platform singletons.
 *
 * Reads the same store as the Concierge, so a task created by a client conversation
 * appears in this queue: a shared `ROSILLO_DATA_DIR` locally, the same `DATABASE_URL`
 * when hosted. Both applications are separate deployments over one append-only store
 * (ADR-0011).
 *
 * Note what is absent: no AI provider. The employee workspace reads what the
 * Concierge prepared and records what a person decided; it runs no model.
 */

declare global {
  // eslint-disable-next-line no-var
  var __rosilloEmployeeStore: PlatformStore | undefined;
  // eslint-disable-next-line no-var
  var __rosilloEmployeeC360: Customer360Port | undefined;
  // eslint-disable-next-line no-var
  var __rosilloEmployeeSessions: SessionRegistry | undefined;
}

/** Session records, Postgres-backed when there is a database (see the client app). */
export function sessions(): SessionRegistry {
  globalThis.__rosilloEmployeeSessions ??= (() => {
    const backing = store();
    return backing instanceof PostgresStore ? backing.sessionRegistry() : new InMemorySessionRegistry();
  })();
  return globalThis.__rosilloEmployeeSessions;
}

function build(): PlatformStore {
  // Fails closed in production on a missing or placeholder AUTH_SECRET (ADR-0013).
  const warning = checkSessionSecret();
  console.info(`[rosillo] employee workspace starting — store=${resolveStoreKind()} c360=${resolveCustomer360Kind()}`);
  if (warning) console.warn(`[rosillo] ${warning}`);
  return createStore();
}

export function store(): PlatformStore {
  globalThis.__rosilloEmployeeStore ??= build();
  return globalThis.__rosilloEmployeeStore;
}

/**
 * The Customer 360 read port.
 *
 * Declared as the interface, not the class. The synthetic dataset is the only
 * implementation today; a real one is a second class behind this same type, which
 * is the whole point of the port being read-only by construction (ADR-0001).
 */
export function c360(): Customer360Port {
  globalThis.__rosilloEmployeeC360 ??= createCustomer360();
  return globalThis.__rosilloEmployeeC360;
}

export function nowIso(): string {
  return new Date().toISOString();
}
