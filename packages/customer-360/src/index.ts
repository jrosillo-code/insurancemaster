/**
 * @rosillo/customer-360 — the authorised read model of a client's insurance position.
 *
 * A read model and an evidence index, never a system of record (ADR-0001). Everything
 * it returns is filtered through an AuthorisedScope, and every material field carries
 * where it came from and when it was observed.
 *
 * SYNTHETIC DATA ONLY.
 */

export * from './model';
export * from './port';
export * from './writer';
export { buildPortfolioSnapshot, rankProcedures, RENEWAL_HORIZON_DAYS } from './ranking';
export { SyntheticCustomer360 } from './synthetic/adapter';
export { createCustomer360, resolveCustomer360Kind, type Customer360Kind } from './factory';
export {
  PostgresCustomer360,
  PostgresCustomer360Writer,
  MissingCustomer360ConnectionError,
  type PostgresCustomer360Options,
} from './postgres';
export {
  buildSyntheticDataset,
  getSyntheticDataset,
  datasetSummary,
  assertIntegrity,
  DatasetIntegrityError,
} from './synthetic/dataset';
export { DATASET_TODAY, OBSERVED_AT } from './synthetic/builders';
export { APPROVED_PROCEDURES, PROCEDURE_FOR_INTENT } from './synthetic/procedures';
