import 'server-only';
import { checkSessionSecret } from '@rosillo/auth';
import { SyntheticCustomer360 } from '@rosillo/customer-360';
import { createStore, resolveStoreKind, type PlatformStore } from '@rosillo/store';

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
  var __rosilloEmployeeC360: SyntheticCustomer360 | undefined;
}

function build(): PlatformStore {
  // Fails closed in production on a missing or placeholder AUTH_SECRET (ADR-0013).
  const warning = checkSessionSecret();
  console.info(`[rosillo] employee workspace starting — store=${resolveStoreKind()}`);
  if (warning) console.warn(`[rosillo] ${warning}`);
  return createStore();
}

export function store(): PlatformStore {
  globalThis.__rosilloEmployeeStore ??= build();
  return globalThis.__rosilloEmployeeStore;
}

export function c360(): SyntheticCustomer360 {
  globalThis.__rosilloEmployeeC360 ??= new SyntheticCustomer360();
  return globalThis.__rosilloEmployeeC360;
}

export function nowIso(): string {
  return new Date().toISOString();
}
