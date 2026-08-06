import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import type { AuthorisedScope } from '@rosillo/domain';
import type {
  ApprovedProcedure,
  Claim,
  ClientAccount,
  CoverageTerm,
  Customer360Dataset,
  InsuredObject,
  Party,
  Policy,
  PolicyDocument,
  Receipt,
  Relationship,
} from './model';
import type { Customer360Port, DocumentFilter, PortfolioSnapshot } from './port';
import { buildPortfolioSnapshot, rankProcedures } from './ranking';
import {
  PARTY_MATERIAL_FIELDS,
  POLICY_MATERIAL_FIELDS,
  adviserProvenanceFor,
  type AdviserIdentity,
  type Customer360Writer,
  type PartyEntry,
  type PolicyEntry,
} from './writer';

/**
 * Customer 360 over PostgreSQL — the implementation that lets a real póliza exist.
 *
 * Everything the platform could answer until now came from a hand-written TypeScript
 * fixture. Not because anything refused real data, but because there was nowhere to
 * put it: `SyntheticCustomer360` was the only implementation of the read port. This
 * is the second one, and it passes the same conformance suite over the same data —
 * which is what makes swapping them a configuration change rather than a leap.
 *
 * Two properties carried over from the synthetic adapter, both load-bearing:
 *
 *   - **the scope is the only thing that decides what comes back.** Every scoped read
 *     below filters on an id list computed before the request reached here. An empty
 *     scope produces empty results without touching the database at all;
 *   - **an out-of-scope id returns null, never an error.** A client must not be able
 *     to tell "not yours" from "does not exist", and an exception is a signal.
 *
 * Rows keep the validated record as JSONB and promote to columns only what is
 * filtered on, exactly as `@rosillo/store` does. The Zod schemas in `@rosillo/domain`
 * remain the single source of truth for shape.
 */

type Sql = ReturnType<typeof postgres>;

export interface PostgresCustomer360Options {
  connectionString?: string;
  max?: number;
  prepare?: boolean;
}

export class MissingCustomer360ConnectionError extends Error {
  constructor() {
    super(
      'DATABASE_URL is not set, so the Postgres Customer 360 cannot start. ' +
        'Leave ROSILLO_C360 unset to use the synthetic dataset.',
    );
    this.name = 'MissingCustomer360ConnectionError';
  }
}

function connect(options: PostgresCustomer360Options): Sql {
  const connectionString = options.connectionString ?? process.env['DATABASE_URL'];
  if (!connectionString) throw new MissingCustomer360ConnectionError();
  const pooled = /[:.]6543|pooler\./.test(connectionString);
  return postgres(connectionString, {
    max: options.max ?? 1,
    prepare: options.prepare ?? !pooled,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
}

/*
 * Rows store the record whole, and the driver hands them back untyped. These two
 * helpers are the only place that asserts the shape, which is where the assertion
 * belongs: the JSONB column is genuinely `unknown` at runtime, and pretending
 * otherwise at every call site would spread the same cast across thirty of them.
 */
function record<T>(row: unknown): T | null {
  if (!row) return null;
  return ((row as { data?: unknown }).data as T | undefined) ?? null;
}

function records<T>(rows: readonly unknown[]): T[] {
  return rows.map((row) => (row as { data: T }).data);
}

export class PostgresCustomer360 implements Customer360Port {
  protected readonly sql: Sql;

  constructor(options: PostgresCustomer360Options = {}) {
    this.sql = connect(options);
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  // ── Identity (pre-scope; never returns portfolio data) ─────────────────────

  async getAccountByEmail(email: string): Promise<ClientAccount | null> {
    const rows = await this.sql`
      select data from c360_accounts where lower(email) = lower(${email.trim()}) limit 1
    `;
    return record<ClientAccount>(rows[0]);
  }

  async getAccountById(accountId: string): Promise<ClientAccount | null> {
    const rows = await this.sql`select data from c360_accounts where id = ${accountId} limit 1`;
    return record<ClientAccount>(rows[0]);
  }

  async getPartyById(partyId: string): Promise<Party | null> {
    const rows = await this.sql`select data from c360_parties where id = ${partyId} limit 1`;
    return record<Party>(rows[0]);
  }

  async getRelationshipsForParty(partyId: string): Promise<Relationship[]> {
    const rows = await this.sql`
      select data from c360_relationships where from_party_id = ${partyId} order by id
    `;
    return records<Relationship>(rows);
  }

  // ── Scope construction (ids only, never records) ───────────────────────────

  async policyIdsForParty(partyId: string): Promise<string[]> {
    const rows = await this.sql<{ id: string }[]>`
      select id from c360_policies where holder_party_id = ${partyId}
    `;
    return rows.map((r) => r.id);
  }

  async claimIdsForParty(partyId: string): Promise<string[]> {
    const rows = await this.sql<{ id: string }[]>`
      select id from c360_claims where holder_party_id = ${partyId}
    `;
    return rows.map((r) => r.id);
  }

  async documentIdsForParty(partyId: string): Promise<string[]> {
    const rows = await this.sql<{ id: string }[]>`
      select id from c360_documents where owner_party_id = ${partyId}
    `;
    return rows.map((r) => r.id);
  }

  async receiptIdsForPolicies(policyIds: readonly string[]): Promise<string[]> {
    if (policyIds.length === 0) return [];
    const rows = await this.sql<{ id: string }[]>`
      select id from c360_receipts where policy_id in ${this.sql([...policyIds])}
    `;
    return rows.map((r) => r.id);
  }

  async hasSpecialCategoryFor(partyIds: readonly string[]): Promise<boolean> {
    if (partyIds.length === 0) return false;
    const rows = await this.sql<{ any: boolean }[]>`
      select exists (
        select 1 from c360_claims
        where special_category and holder_party_id in ${this.sql([...partyIds])}
      ) as any
    `;
    return rows[0]?.any ?? false;
  }

  // ── Scoped reads ───────────────────────────────────────────────────────────

  async listPolicies(scope: AuthorisedScope): Promise<Policy[]> {
    // An empty scope is answered without a query. Not an optimisation: `in ()` is a
    // syntax error, and the shape that produces it is the one that must return
    // nothing, so it is worth being explicit rather than clever.
    if (scope.policyIds.length === 0) return [];
    const rows = await this.sql`
      select data from c360_policies where id in ${this.sql([...scope.policyIds])} order by id
    `;
    return records<Policy>(rows);
  }

  async getPolicy(scope: AuthorisedScope, policyId: string): Promise<Policy | null> {
    if (!scope.policyIds.includes(policyId)) return null;
    const rows = await this.sql`select data from c360_policies where id = ${policyId} limit 1`;
    return record<Policy>(rows[0]);
  }

  async listInsuredObjects(scope: AuthorisedScope, policyId: string): Promise<InsuredObject[]> {
    // The gate is the parent policy, matching the synthetic adapter: no policy in
    // scope, no objects, whether or not the objects themselves exist.
    if (!scope.policyIds.includes(policyId)) return [];
    const rows = await this.sql`
      select data from c360_insured_objects where policy_id = ${policyId} order by id
    `;
    return records<InsuredObject>(rows);
  }

  async listCoverageTerms(scope: AuthorisedScope, policyId: string): Promise<CoverageTerm[]> {
    if (!scope.policyIds.includes(policyId)) return [];
    const rows = await this.sql`
      select data from c360_coverage_terms where policy_id = ${policyId} order by id
    `;
    return records<CoverageTerm>(rows);
  }

  async listClaims(scope: AuthorisedScope): Promise<Claim[]> {
    if (scope.claimIds.length === 0) return [];
    const rows = await this.sql`
      select data from c360_claims
      where id in ${this.sql([...scope.claimIds])}
        and (not special_category or ${scope.includesSpecialCategory})
      order by id
    `;
    return records<Claim>(rows);
  }

  async getClaim(scope: AuthorisedScope, claimId: string): Promise<Claim | null> {
    if (!scope.claimIds.includes(claimId)) return null;
    const rows = await this.sql`
      select data from c360_claims
      where id = ${claimId} and (not special_category or ${scope.includesSpecialCategory})
      limit 1
    `;
    return record<Claim>(rows[0]);
  }

  async listReceipts(scope: AuthorisedScope, policyId?: string): Promise<Receipt[]> {
    if (scope.receiptIds.length === 0) return [];
    const rows = policyId
      ? await this.sql`
          select data from c360_receipts
          where id in ${this.sql([...scope.receiptIds])} and policy_id = ${policyId}
          order by due_date
        `
      : await this.sql`
          select data from c360_receipts
          where id in ${this.sql([...scope.receiptIds])}
          order by due_date
        `;
    return records<Receipt>(rows);
  }

  async listDocuments(scope: AuthorisedScope, filter: DocumentFilter = {}): Promise<PolicyDocument[]> {
    if (scope.documentIds.length === 0) return [];
    const sql = this.sql;
    const rows = await sql`
      select data from c360_documents
      where id in ${sql([...scope.documentIds])}
        ${filter.policyId ? sql`and policy_id = ${filter.policyId}` : sql``}
        ${filter.claimId ? sql`and claim_id = ${filter.claimId}` : sql``}
        ${filter.kind ? sql`and kind = ${filter.kind}` : sql``}
        ${filter.includeSuperseded ? sql`` : sql`and superseded_by_document_id is null`}
        ${scope.includesSpecialCategory ? sql`` : sql`and classification <> 'SPECIAL_CATEGORY'`}
      order by id
    `;
    return records<PolicyDocument>(rows);
  }

  async getDocument(scope: AuthorisedScope, documentId: string): Promise<PolicyDocument | null> {
    if (!scope.documentIds.includes(documentId)) return null;
    const rows = await this.sql`
      select data from c360_documents
      where id = ${documentId}
        and (classification <> 'SPECIAL_CATEGORY' or ${scope.includesSpecialCategory})
      limit 1
    `;
    return record<PolicyDocument>(rows[0]);
  }

  // ── Procedures (tier C; no owner, so no scope) ─────────────────────────────

  async findProcedures(topic: string): Promise<ApprovedProcedure[]> {
    if (topic.trim().length === 0) return [];
    // Ranked in TypeScript by the same function the synthetic adapter calls. A `gin`
    // index and a `tsquery` would be faster and would rank differently, and "faster"
    // is not worth two implementations disagreeing about which procedure answers a
    // question. There are a few dozen rows.
    const rows = await this.sql`select data from c360_procedures`;
    return rankProcedures(records<ApprovedProcedure>(rows), topic);
  }

  async getProcedure(procedureId: string): Promise<ApprovedProcedure | null> {
    const rows = await this.sql`select data from c360_procedures where id = ${procedureId} limit 1`;
    return record<ApprovedProcedure>(rows[0]);
  }

  async getPortfolioSnapshot(scope: AuthorisedScope, asOf?: string): Promise<PortfolioSnapshot> {
    const policies = await this.listPolicies(scope);
    const claims = await this.listClaims(scope);
    const receipts = await this.listReceipts(scope);
    const documents = await this.listDocuments(scope);
    const objectIds = [...new Set(policies.flatMap((p) => p.insuredObjectIds))];
    const insuredObjects =
      objectIds.length === 0
        ? []
        : records<InsuredObject>(
            await this.sql`select data from c360_insured_objects where id in ${this.sql(objectIds)} order by id`,
          );
    // No fixture date to fall back on here — real records are not frozen to a day.
    const on = asOf ?? new Date().toISOString().slice(0, 10);
    return buildPortfolioSnapshot({ policies, claims, receipts, documents, insuredObjects, asOf: on });
  }
}

/**
 * The write side, over the same tables.
 *
 * A separate class, not a wider read class. The Concierge builds a
 * `PostgresCustomer360` and holds it as a `Customer360Port`; only the employee
 * workspace constructs this, and nothing it constructs is reachable from the
 * pipeline. The database cannot enforce that split — one role serves both apps — so
 * the type system does, and this comment says so rather than implying otherwise.
 */
export class PostgresCustomer360Writer implements Customer360Writer {
  private readonly sql: Sql;

  constructor(options: PostgresCustomer360Options = {}) {
    this.sql = connect(options);
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  async createParty(entry: PartyEntry, by: AdviserIdentity, at: string): Promise<Party> {
    const party: Party = {
      id: `party_${randomUUID().slice(0, 12)}`,
      type: entry.type,
      name: entry.name,
      ...(entry.surname !== undefined ? { surname: entry.surname } : {}),
      email: entry.email ?? null,
      phone: entry.phone ?? null,
      taxIdSynthetic: null,
      city: entry.city ?? null,
      fieldProvenance: adviserProvenanceFor(PARTY_MATERIAL_FIELDS, by, at),
    };
    await this.sql`
      insert into c360_parties (id, type, surname, email, data)
      values (${party.id}, ${party.type}, ${party.surname ?? null}, ${party.email}, ${this.sql.json(party as never)})
    `;
    return party;
  }

  async createPolicy(entry: PolicyEntry, by: AdviserIdentity, at: string): Promise<Policy> {
    const policy = this.buildPolicy(`pol_${randomUUID().slice(0, 12)}`, entry, by, at, [], []);
    await this.sql`
      insert into c360_policies (id, policy_number, holder_party_id, data)
      values (${policy.id}, ${policy.policyNumber}, ${policy.holderPartyId}, ${this.sql.json(policy as never)})
    `;
    return policy;
  }

  async updatePolicy(
    policyId: string,
    entry: PolicyEntry,
    by: AdviserIdentity,
    at: string,
  ): Promise<Policy | null> {
    const rows = await this.sql`select data from c360_policies where id = ${policyId} limit 1`;
    const existing = record<Policy>(rows[0]);
    if (!existing) return null;
    // Links to objects and documents survive a correction to the figures — the
    // adviser is fixing what the schedule says, not detaching the car from the policy.
    const updated = this.buildPolicy(
      policyId,
      entry,
      by,
      at,
      existing.insuredObjectIds,
      existing.documentIds,
    );
    await this.sql`
      update c360_policies
      set policy_number = ${updated.policyNumber},
          holder_party_id = ${updated.holderPartyId},
          data = ${this.sql.json(updated as never)}
      where id = ${policyId}
    `;
    return updated;
  }

  private buildPolicy(
    id: string,
    entry: PolicyEntry,
    by: AdviserIdentity,
    at: string,
    insuredObjectIds: string[],
    documentIds: string[],
  ): Policy {
    return {
      id,
      policyNumber: entry.policyNumber,
      holderPartyId: entry.holderPartyId,
      insurer: entry.insurer,
      product: entry.product,
      productLabel: entry.productLabel,
      status: entry.status,
      inceptionDate: entry.inceptionDate,
      renewalDate: entry.renewalDate,
      premium: entry.premium,
      previousPremium: entry.previousPremium ?? null,
      currency: 'EUR',
      insuredObjectIds,
      documentIds,
      fieldProvenance: adviserProvenanceFor(POLICY_MATERIAL_FIELDS, by, at, entry.confidence ?? 1),
    };
  }

  async listParties(): Promise<Party[]> {
    return records<Party>(await this.sql`select data from c360_parties order by id`);
  }

  async listPoliciesForParty(partyId: string): Promise<Policy[]> {
    return records<Policy>(
      await this.sql`select data from c360_policies where holder_party_id = ${partyId} order by id`,
    );
  }

  /**
   * Loads the synthetic fixture, for a demo database and for the conformance suite.
   *
   * It refuses to run against a database that already holds a hand-entered record.
   * The reason is not tidiness: a client's real policy sitting beside forty invented
   * ones is a dataset nobody can trust, and the way that happens is somebody seeding
   * a demo into the wrong `DATABASE_URL`. A guard cannot stop a determined mistake,
   * but this is the mistake that would otherwise be one command away.
   */
  async seedSyntheticDataset(dataset: Customer360Dataset): Promise<void> {
    const guard = await this.sql<{ count: string }[]>`
      select count(*) as count from c360_policies
      where data -> 'fieldProvenance' -> 'premium' ->> 'sourceType' = 'ADVISER_ENTERED'
    `;
    if (Number(guard[0]?.count ?? 0) > 0) {
      throw new Error(
        'Refusing to seed synthetic data: this database already holds adviser-entered policies.',
      );
    }

    const sql = this.sql;
    await sql.begin(async (tx) => {
      // Truncate rather than upsert: a partial fixture is a dataset with two versions
      // of the same client in it, which is worse than no fixture.
      await tx`truncate c360_parties, c360_relationships, c360_accounts, c360_policies,
               c360_insured_objects, c360_coverage_terms, c360_claims, c360_receipts,
               c360_documents, c360_procedures`;

      for (const party of dataset.parties) {
        await tx`insert into c360_parties (id, type, surname, email, data)
                 values (${party.id}, ${party.type}, ${party.surname ?? null}, ${party.email},
                         ${tx.json(party as never)})`;
      }
      for (const relationship of dataset.relationships) {
        await tx`insert into c360_relationships (id, kind, from_party_id, to_party_id, data)
                 values (${relationship.id}, ${relationship.kind}, ${relationship.fromPartyId},
                         ${relationship.toPartyId}, ${tx.json(relationship as never)})`;
      }
      for (const account of dataset.accounts) {
        await tx`insert into c360_accounts (id, party_id, email, data)
                 values (${account.id}, ${account.partyId}, ${account.email}, ${tx.json(account as never)})`;
      }
      // Insured objects reach their policy through the policy's id list, so the link
      // is denormalised on the way in rather than looked up on the way out.
      const objectToPolicy = new Map<string, string>();
      for (const policy of dataset.policies) {
        for (const objectId of policy.insuredObjectIds) objectToPolicy.set(objectId, policy.id);
        await tx`insert into c360_policies (id, policy_number, holder_party_id, data)
                 values (${policy.id}, ${policy.policyNumber}, ${policy.holderPartyId},
                         ${tx.json(policy as never)})`;
      }
      for (const object of dataset.insuredObjects) {
        const policyId = objectToPolicy.get(object.id);
        if (!policyId) continue; // An object no policy references is not reachable anyway.
        await tx`insert into c360_insured_objects (id, policy_id, kind, data)
                 values (${object.id}, ${policyId}, ${object.kind}, ${tx.json(object as never)})`;
      }
      for (const term of dataset.coverageTerms) {
        await tx`insert into c360_coverage_terms
                   (id, policy_id, kind, key, document_id, effective_from, effective_to, data)
                 values (${term.id}, ${term.policyId}, ${term.kind}, ${term.key}, ${term.documentId},
                         ${term.effectiveFrom}, ${term.effectiveTo}, ${tx.json(term as never)})`;
      }
      for (const claim of dataset.claims) {
        await tx`insert into c360_claims
                   (id, claim_number, policy_id, holder_party_id, status, special_category, data)
                 values (${claim.id}, ${claim.claimNumber}, ${claim.policyId}, ${claim.holderPartyId},
                         ${claim.status}, ${claim.specialCategory}, ${tx.json(claim as never)})`;
      }
      for (const receipt of dataset.receipts) {
        await tx`insert into c360_receipts (id, receipt_number, policy_id, status, due_date, data)
                 values (${receipt.id}, ${receipt.receiptNumber}, ${receipt.policyId}, ${receipt.status},
                         ${receipt.dueDate}, ${tx.json(receipt as never)})`;
      }
      for (const document of dataset.documents) {
        await tx`insert into c360_documents
                   (id, kind, owner_party_id, policy_id, claim_id, classification,
                    superseded_by_document_id, data)
                 values (${document.id}, ${document.kind}, ${document.ownerPartyId}, ${document.policyId},
                         ${document.claimId}, ${document.classification}, ${document.supersededByDocumentId},
                         ${tx.json(document as never)})`;
      }
      for (const procedure of dataset.procedures) {
        await tx`insert into c360_procedures (id, title, topics, data)
                 values (${procedure.id}, ${procedure.title}, ${procedure.topics},
                         ${tx.json(procedure as never)})`;
      }
    });
  }
}
