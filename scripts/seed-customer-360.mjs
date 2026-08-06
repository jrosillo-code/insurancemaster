#!/usr/bin/env node
/**
 * Loads the synthetic dataset into a Postgres Customer 360.
 *
 * This is what makes `ROSILLO_C360=postgres` usable before anybody has typed a real
 * policy in: the same forty-odd invented clients the platform has always answered
 * about, now read from a database rather than from a TypeScript fixture. It proves
 * the whole stack works over Postgres while the data is still synthetic.
 *
 *   DATABASE_URL='postgres://…' node scripts/seed-customer-360.mjs
 *
 * It refuses to run against a database that already holds adviser-entered policies.
 * A client's real póliza sitting beside forty invented ones is a dataset nobody can
 * trust, and that happens by seeding a demo into the wrong DATABASE_URL.
 */
import { PostgresCustomer360Writer, getSyntheticDataset, datasetSummary } from '@rosillo/customer-360';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const writer = new PostgresCustomer360Writer({ connectionString: url });
try {
  const dataset = getSyntheticDataset();
  await writer.seedSyntheticDataset(dataset);
  const summary = datasetSummary();
  console.info(
    `Seeded the synthetic Customer 360: ${summary.persons} people, ${summary.organisations} organisations, ` +
      `${summary.policies} policies.`,
  );
  console.info('Set ROSILLO_C360=postgres on the applications to read from it.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await writer.close();
}
