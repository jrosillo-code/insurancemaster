import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PostgresCustomer360, PostgresCustomer360Writer } from '../src/postgres';
import { getSyntheticDataset } from '../src/synthetic/dataset';
import { DATASET_TODAY } from '../src/synthetic/builders';
import type { AdviserIdentity } from '../src/writer';
import { assertCustomer360Contract } from './conformance';

/**
 * The Postgres Customer 360, against a real database.
 *
 * Skipped unless `TEST_DATABASE_URL` is set, because a database test that mocks the
 * database tests the mock. `scripts/local-postgres.sh` starts a throwaway one.
 *
 * The first half of this file is the *same* conformance suite the synthetic adapter
 * runs, loaded with the *same* dataset. That is the whole argument for swapping the
 * port being safe: not that the SQL looks right, but that two implementations answer
 * identically when asked the same questions about the same records.
 *
 * The second half covers what only this implementation has: the write side, and the
 * provenance it stamps.
 */

/**
 * Its own database, derived from `TEST_DATABASE_URL`.
 *
 * Not fastidiousness: `packages/store` resets the whole `public` schema in its
 * `beforeAll`, and vitest runs test files in parallel. Sharing one database meant
 * that reset landing between this file's migration and its first query, which
 * surfaces as `relation "c360_parties" does not exist` in a suite that has nothing
 * to do with the store. Two suites that each reset a schema must not share one.
 */
function resolveConnection(): string | undefined {
  const explicit = process.env['TEST_C360_DATABASE_URL'];
  if (explicit) return explicit;
  const base = process.env['TEST_DATABASE_URL'];
  if (!base) return undefined;

  const url = new URL(base);
  const target = `${url.pathname.replace(/^\//, '') || 'postgres'}_c360`;
  const admin = new URL(base);
  admin.pathname = '/postgres';
  try {
    execFileSync('psql', [admin.toString(), '-q', '-c', `create database ${target}`], { stdio: 'pipe' });
  } catch {
    // Already exists, which is the normal case on every run after the first.
  }
  url.pathname = `/${target}`;
  return url.toString();
}

const CONNECTION = resolveConnection();
const describeIfDb = CONNECTION ? describe : describe.skip;
const MIGRATION = resolve(__dirname, '../../../supabase/migrations/0004_customer_360.sql');

const ADVISER: AdviserIdentity = { employeeId: 'emp_paula', displayName: 'Paula Ruiz' };
const opened: { close(): Promise<void> }[] = [];

function psql(args: string[]): void {
  execFileSync('psql', [CONNECTION as string, '-q', '-v', 'ON_ERROR_STOP=1', ...args], { stdio: 'pipe' });
}

/**
 * A clean database, every time.
 *
 * The truncate is not tidiness. The write-side block leaves adviser-entered policies
 * behind, and the seed guard — correctly — refuses to load the fixture over them, so
 * a file that only migrated passed on a fresh database and failed on the second run.
 * That is the shape of bug that gets diagnosed as "flaky" and ignored.
 */
function migrate(): void {
  psql(['-f', MIGRATION]);
  psql([
    '-c',
    `truncate c360_parties, c360_relationships, c360_accounts, c360_policies,
             c360_insured_objects, c360_coverage_terms, c360_claims, c360_receipts,
             c360_documents, c360_procedures`,
  ]);
}

function reader(): PostgresCustomer360 {
  const instance = new PostgresCustomer360({ connectionString: CONNECTION as string });
  opened.push(instance);
  return instance;
}

function writer(): PostgresCustomer360Writer {
  const instance = new PostgresCustomer360Writer({ connectionString: CONNECTION as string });
  opened.push(instance);
  return instance;
}

afterAll(async () => {
  for (const instance of opened) await instance.close();
});

describeIfDb('PostgresCustomer360 satisfies the Customer360Port contract', () => {
  const dataset = getSyntheticDataset();
  let seeded: Promise<PostgresCustomer360> | null = null;

  assertCustomer360Contract(async () => {
    // Seeded once for the whole suite. Every assertion in the contract is a read, so
    // reloading per test would only make it slower.
    seeded ??= (async () => {
      migrate();
      await writer().seedSyntheticDataset(dataset);
      return reader();
    })();
    return { c360: await seeded, dataset, today: DATASET_TODAY };
  });
});

describeIfDb('the write side', () => {
  it('stamps every material field with the adviser who entered it', async () => {
    migrate();
    const write = writer();
    const party = await write.createParty(
      { type: 'PERSON', name: 'Guillermo Rosillo', surname: 'Rosillo', city: 'Madrid' },
      ADVISER,
      '2026-08-06T09:00:00.000Z',
    );

    const policy = await write.createPolicy(
      {
        policyNumber: 'AUT-2026-9001',
        holderPartyId: party.id,
        insurer: 'Allianz',
        product: 'AUTO',
        productLabel: 'Auto — Todo Riesgo',
        status: 'ACTIVE',
        inceptionDate: '2026-03-01',
        renewalDate: '2027-03-01',
        premium: 812.4,
        previousPremium: 742.3,
      },
      ADVISER,
      '2026-08-06T09:05:00.000Z',
    );

    // The point of the source type: every figure is attributable to a person who
    // read the document, not to "the system".
    expect(policy.fieldProvenance['premium']?.sourceType).toBe('ADVISER_ENTERED');
    expect(policy.fieldProvenance['premium']?.sourceId).toBe(ADVISER.employeeId);
    expect(policy.fieldProvenance['premium']?.observedAt).toBe('2026-08-06T09:05:00.000Z');
    expect(policy.fieldProvenance['renewalDate']?.confidence).toBe(1);
  });

  it('carries the adviser’s own confidence when the document was unclear', async () => {
    migrate();
    const write = writer();
    const party = await write.createParty({ type: 'PERSON', name: 'Prueba' }, ADVISER, '2026-08-06T09:00:00.000Z');
    const policy = await write.createPolicy(
      {
        policyNumber: 'HOG-2026-9002',
        holderPartyId: party.id,
        insurer: 'Mapfre',
        product: 'HOGAR',
        productLabel: 'Hogar — Multirriesgo',
        status: 'ACTIVE',
        inceptionDate: '2026-01-15',
        renewalDate: '2027-01-15',
        premium: 389,
        confidence: 0.7,
      },
      ADVISER,
      '2026-08-06T09:10:00.000Z',
    );
    expect(policy.fieldProvenance['premium']?.confidence).toBe(0.7);
  });

  it('records a correction as a new observation rather than an untraceable edit', async () => {
    migrate();
    const write = writer();
    const party = await write.createParty({ type: 'PERSON', name: 'Prueba' }, ADVISER, '2026-08-06T09:00:00.000Z');
    const entry = {
      policyNumber: 'AUT-2026-9003',
      holderPartyId: party.id,
      insurer: 'Allianz',
      product: 'AUTO' as const,
      productLabel: 'Auto',
      status: 'ACTIVE' as const,
      inceptionDate: '2026-03-01',
      renewalDate: '2027-03-01',
      premium: 800,
    };
    const created = await write.createPolicy(entry, ADVISER, '2026-08-06T09:00:00.000Z');
    const corrected = await write.updatePolicy(
      created.id,
      { ...entry, premium: 812.4 },
      { employeeId: 'emp_luis', displayName: 'Luis Marín' },
      '2026-08-07T11:00:00.000Z',
    );

    expect(corrected?.premium).toBe(812.4);
    // Who corrected it and when, not just what it now says.
    expect(corrected?.fieldProvenance['premium']?.sourceId).toBe('emp_luis');
    expect(corrected?.fieldProvenance['premium']?.observedAt).toBe('2026-08-07T11:00:00.000Z');
  });

  it('returns null when correcting a policy that does not exist', async () => {
    migrate();
    const write = writer();
    const result = await write.updatePolicy(
      'pol_nope',
      {
        policyNumber: 'X',
        holderPartyId: 'party_nope',
        insurer: 'X',
        product: 'AUTO',
        productLabel: 'X',
        status: 'ACTIVE',
        inceptionDate: '2026-01-01',
        renewalDate: '2027-01-01',
        premium: 1,
      },
      ADVISER,
      '2026-08-06T09:00:00.000Z',
    );
    expect(result).toBeNull();
  });

  it('refuses to seed synthetic data over adviser-entered records', async () => {
    migrate();
    const write = writer();
    const party = await write.createParty({ type: 'PERSON', name: 'Real' }, ADVISER, '2026-08-06T09:00:00.000Z');
    await write.createPolicy(
      {
        policyNumber: 'AUT-2026-9004',
        holderPartyId: party.id,
        insurer: 'Allianz',
        product: 'AUTO',
        productLabel: 'Auto',
        status: 'ACTIVE',
        inceptionDate: '2026-03-01',
        renewalDate: '2027-03-01',
        premium: 700,
      },
      ADVISER,
      '2026-08-06T09:00:00.000Z',
    );

    // The mistake this exists to stop: seeding a demo into the database that holds
    // the family's own policies, and ending up unable to tell which is which.
    await expect(write.seedSyntheticDataset(getSyntheticDataset())).rejects.toThrow(
      /already holds adviser-entered policies/,
    );
  });

  it('makes an entered policy readable through the read port, within scope', async () => {
    migrate();
    const write = writer();
    const read = reader();
    const party = await write.createParty(
      { type: 'PERSON', name: 'Guillermo Rosillo' },
      ADVISER,
      '2026-08-06T09:00:00.000Z',
    );
    const policy = await write.createPolicy(
      {
        policyNumber: 'AUT-2026-9005',
        holderPartyId: party.id,
        insurer: 'Allianz',
        product: 'AUTO',
        productLabel: 'Auto — Todo Riesgo',
        status: 'ACTIVE',
        inceptionDate: '2026-03-01',
        renewalDate: '2027-03-01',
        premium: 812.4,
      },
      ADVISER,
      '2026-08-06T09:00:00.000Z',
    );

    // The whole loop: scope construction finds it, and the scoped read returns it.
    expect(await read.policyIdsForParty(party.id)).toEqual([policy.id]);

    const scope = {
      accountId: 'acc_guillermo',
      authenticatedPartyId: party.id,
      activeContext: { type: 'PERSON' as const, id: party.id, label: 'Guillermo' },
      partyIds: [party.id],
      policyIds: [policy.id],
      claimIds: [],
      documentIds: [],
      receiptIds: [],
      viaDelegation: false,
      authorityBasis: 'Titular',
      appliedGrants: [],
      includesSpecialCategory: false,
    };
    const found = await read.listPolicies(scope);
    expect(found).toHaveLength(1);
    expect(found[0]?.premium).toBe(812.4);
    expect(found[0]?.fieldProvenance['premium']?.sourceType).toBe('ADVISER_ENTERED');

    // And a scope that does not carry it sees nothing, same as any other record.
    expect(await read.getPolicy({ ...scope, policyIds: [] }, policy.id)).toBeNull();
  });
});
