import 'server-only';
import { SyntheticCustomer360 } from '@rosillo/customer-360';
import { JsonlStore, type PlatformStore } from '@rosillo/store';

/**
 * Employee-side platform singletons.
 *
 * Shares `ROSILLO_DATA_DIR` with the Concierge, so a task created by a client
 * conversation appears in this queue. Both apps are separate deployments reading
 * one append-only store — a prototype stand-in for the shared database a pilot
 * would use (ADR-0011).
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

export function store(): PlatformStore {
  globalThis.__rosilloEmployeeStore ??= new JsonlStore();
  return globalThis.__rosilloEmployeeStore;
}

export function c360(): SyntheticCustomer360 {
  globalThis.__rosilloEmployeeC360 ??= new SyntheticCustomer360();
  return globalThis.__rosilloEmployeeC360;
}

export function nowIso(): string {
  return new Date().toISOString();
}
