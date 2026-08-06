import { expect, it } from 'vitest';
import { emptyScope, type AuthorisedScope } from '@rosillo/domain';
import type { Customer360Port } from '../src/port';
import type { Customer360Dataset } from '../src/model';

/**
 * The contract every `Customer360Port` implementation must satisfy.
 *
 * One suite, run against each implementation over the *same* dataset. That is the
 * point: swapping the port is only safe if two implementations answer identically,
 * and the way to know is to ask them the same questions rather than to read both.
 *
 * What is asserted here is the property the platform's client isolation rests on —
 * **the scope is the only thing that decides what comes back**. An implementation
 * that returns a record outside the scope fails, and an implementation that throws
 * on an out-of-scope id also fails: an error is a signal, and a client must not be
 * able to tell "not yours" from "does not exist".
 *
 * It does not assert anything about the data itself. `dataset.test.ts` covers the
 * synthetic fixture's shape; this covers behaviour, so a Postgres implementation
 * loaded with two rows passes exactly as a fixture with sixty does.
 */

export interface ConformanceFixture {
  /** The implementation under test. */
  c360: Customer360Port;
  /** The data it was loaded with, used to derive scopes and expectations. */
  dataset: Customer360Dataset;
  /** Date used for effectivity, so relationship windows resolve the same way. */
  today: string;
}

/** A scope over exactly one party's records — the ordinary case. */
function scopeForParty(dataset: Customer360Dataset, partyId: string): AuthorisedScope {
  const policies = dataset.policies.filter((p) => p.holderPartyId === partyId);
  const policyIds = policies.map((p) => p.id);
  const claims = dataset.claims.filter((c) => c.holderPartyId === partyId);
  return {
    ...emptyScope('acc_conformance', partyId),
    partyIds: [partyId],
    policyIds,
    claimIds: claims.map((c) => c.id),
    documentIds: dataset.documents.filter((d) => d.ownerPartyId === partyId).map((d) => d.id),
    receiptIds: dataset.receipts.filter((r) => policyIds.includes(r.policyId)).map((r) => r.id),
    includesSpecialCategory: true,
  };
}

/**
 * Runs the suite. Call from inside a `describe`.
 *
 * `make` is a factory rather than an instance so an implementation that holds a
 * connection can be built lazily — a skipped Postgres run must not open one.
 */
export function assertCustomer360Contract(make: () => Promise<ConformanceFixture>): void {
  it('finds an account by email, case-insensitively', async () => {
    const { c360, dataset } = await make();
    const expected = dataset.accounts[0];
    if (!expected) throw new Error('fixture has no accounts');
    const found = await c360.getAccountByEmail(expected.email.toUpperCase());
    expect(found?.id).toBe(expected.id);
  });

  it('returns null for an unknown account rather than throwing', async () => {
    const { c360 } = await make();
    expect(await c360.getAccountByEmail('nobody@nowhere.test')).toBeNull();
    expect(await c360.getAccountById('acc_does_not_exist')).toBeNull();
    expect(await c360.getPartyById('party_does_not_exist')).toBeNull();
  });

  it('returns only relationships held BY the party, never over it', async () => {
    const { c360, dataset } = await make();
    const withRelationships = dataset.relationships[0];
    if (!withRelationships) throw new Error('fixture has no relationships');
    const held = await c360.getRelationshipsForParty(withRelationships.fromPartyId);
    expect(held.length).toBeGreaterThan(0);
    for (const relationship of held) {
      expect(relationship.fromPartyId).toBe(withRelationships.fromPartyId);
    }
  });

  it('lists exactly the policies in scope', async () => {
    const { c360, dataset } = await make();
    const holder = dataset.policies[0]?.holderPartyId;
    if (!holder) throw new Error('fixture has no policies');
    const scope = scopeForParty(dataset, holder);
    const policies = await c360.listPolicies(scope);
    expect(policies.map((p) => p.id).sort()).toEqual([...scope.policyIds].sort());
  });

  it('returns null for a policy that exists but is out of scope', async () => {
    const { c360, dataset } = await make();
    const mine = dataset.policies[0];
    const theirs = dataset.policies.find((p) => p.holderPartyId !== mine?.holderPartyId);
    if (!mine || !theirs) throw new Error('fixture needs two parties with policies');
    const scope = scopeForParty(dataset, mine.holderPartyId);
    // Exists in the store, is not in the scope. Indistinguishable from absent.
    expect(await c360.getPolicy(scope, theirs.id)).toBeNull();
    expect(await c360.getPolicy(scope, 'pol_does_not_exist_at_all')).toBeNull();
  });

  /*
   * The child records deserve their own note.
   *
   * The first version of this test picked "any other party's policy" and asserted the
   * result was empty. It passed against an implementation with the scope check
   * deleted, because the policy it happened to pick had no coverage terms — an
   * assertion that could only ever succeed. The fixture is now searched for a policy
   * that actually *has* the records being denied, and the test fails loudly if there
   * is not one, because a vacuous pass here is worse than no test at all.
   */
  it('refuses the coverage terms of an out-of-scope policy', async () => {
    const { c360, dataset } = await make();
    const mine = dataset.policies[0];
    if (!mine) throw new Error('fixture has no policies');
    const withTerms = new Set(dataset.coverageTerms.map((t) => t.policyId));
    const theirs = dataset.policies.find((p) => p.holderPartyId !== mine.holderPartyId && withTerms.has(p.id));
    if (!theirs) throw new Error('fixture needs another party’s policy that has coverage terms');

    const scope = scopeForParty(dataset, mine.holderPartyId);
    expect(await c360.listCoverageTerms(scope, theirs.id)).toEqual([]);
    // Proof the assertion above is not vacuous: with the policy in scope, the same
    // call returns something.
    expect(
      (await c360.listCoverageTerms({ ...scope, policyIds: [theirs.id] }, theirs.id)).length,
    ).toBeGreaterThan(0);
  });

  it('refuses the insured objects of an out-of-scope policy', async () => {
    const { c360, dataset } = await make();
    const mine = dataset.policies[0];
    if (!mine) throw new Error('fixture has no policies');
    const theirs = dataset.policies.find(
      (p) => p.holderPartyId !== mine.holderPartyId && p.insuredObjectIds.length > 0,
    );
    if (!theirs) throw new Error('fixture needs another party’s policy that has insured objects');

    const scope = scopeForParty(dataset, mine.holderPartyId);
    expect(await c360.listInsuredObjects(scope, theirs.id)).toEqual([]);
    expect(
      (await c360.listInsuredObjects({ ...scope, policyIds: [theirs.id] }, theirs.id)).length,
    ).toBeGreaterThan(0);
  });

  it('returns nothing at all for an empty scope', async () => {
    const { c360 } = await make();
    const nothing = emptyScope('acc_conformance', 'party_conformance');
    expect(await c360.listPolicies(nothing)).toEqual([]);
    expect(await c360.listClaims(nothing)).toEqual([]);
    expect(await c360.listReceipts(nothing)).toEqual([]);
    expect(await c360.listDocuments(nothing)).toEqual([]);
    const snapshot = await c360.getPortfolioSnapshot(nothing);
    expect(snapshot.policies).toEqual([]);
    expect(snapshot.claims).toEqual([]);
    expect(snapshot.documents).toEqual([]);
  });

  it('filters receipts by policy within the scope', async () => {
    const { c360, dataset } = await make();
    const receipt = dataset.receipts[0];
    if (!receipt) throw new Error('fixture has no receipts');
    const policy = dataset.policies.find((p) => p.id === receipt.policyId);
    if (!policy) throw new Error('receipt has no policy');
    const scope = scopeForParty(dataset, policy.holderPartyId);
    const forPolicy = await c360.listReceipts(scope, policy.id);
    expect(forPolicy.length).toBeGreaterThan(0);
    for (const each of forPolicy) expect(each.policyId).toBe(policy.id);
  });

  it('hides superseded documents unless they are asked for', async () => {
    const { c360, dataset } = await make();
    const superseded = dataset.documents.find((d) => d.supersededByDocumentId !== null);
    if (!superseded) return; // A fixture without a superseded document proves nothing here.
    const scope = scopeForParty(dataset, superseded.ownerPartyId);
    const withoutStale = await c360.listDocuments(scope, {});
    expect(withoutStale.map((d) => d.id)).not.toContain(superseded.id);
    const withStale = await c360.listDocuments(scope, { includeSuperseded: true });
    expect(withStale.map((d) => d.id)).toContain(superseded.id);
  });

  it('serves procedures without a scope, because they belong to nobody', async () => {
    const { c360, dataset } = await make();
    const procedure = dataset.procedures[0];
    if (!procedure) throw new Error('fixture has no procedures');
    expect((await c360.getProcedure(procedure.id))?.id).toBe(procedure.id);
    const topic = procedure.topics[0];
    if (topic) {
      const found = await c360.findProcedures(topic);
      expect(found.map((p) => p.id)).toContain(procedure.id);
    }
  });

  it('builds a portfolio snapshot from the scope and nothing else', async () => {
    const { c360, dataset } = await make();
    const holder = dataset.policies[0]?.holderPartyId;
    if (!holder) throw new Error('fixture has no policies');
    const scope = scopeForParty(dataset, holder);
    const snapshot = await c360.getPortfolioSnapshot(scope);
    for (const policy of snapshot.policies) expect(scope.policyIds).toContain(policy.id);
    for (const claim of snapshot.claims) expect(scope.claimIds).toContain(claim.id);
    for (const receipt of snapshot.receipts) expect(scope.receiptIds).toContain(receipt.id);
    for (const document of snapshot.documents) expect(scope.documentIds).toContain(document.id);
    // The derived lists are subsets of what was already returned, never extra reads.
    for (const each of snapshot.outstandingReceipts) expect(each.status).not.toBe('PAID');
    for (const each of snapshot.openClaims) {
      expect(['CLOSED', 'SETTLED', 'REJECTED']).not.toContain(each.status);
    }
  });

  /*
   * Scope construction. These run before a scope exists, so they take a party id
   * directly — which is why they return ids and never records.
   */
  it('resolves a party’s own ids for scope construction', async () => {
    const { c360, dataset } = await make();
    const holder = dataset.policies[0]?.holderPartyId;
    if (!holder) throw new Error('fixture has no policies');
    const expected = dataset.policies.filter((p) => p.holderPartyId === holder).map((p) => p.id);
    expect((await c360.policyIdsForParty(holder)).sort()).toEqual(expected.sort());

    const claims = dataset.claims.filter((c) => c.holderPartyId === holder).map((c) => c.id);
    expect((await c360.claimIdsForParty(holder)).sort()).toEqual(claims.sort());

    const documents = dataset.documents.filter((d) => d.ownerPartyId === holder).map((d) => d.id);
    expect((await c360.documentIdsForParty(holder)).sort()).toEqual(documents.sort());

    const receipts = dataset.receipts.filter((r) => expected.includes(r.policyId)).map((r) => r.id);
    expect((await c360.receiptIdsForPolicies(expected)).sort()).toEqual(receipts.sort());
  });

  it('reports special-category data only for the parties that hold it', async () => {
    const { c360, dataset } = await make();
    const special = dataset.claims.find((c) => c.specialCategory);
    if (special) {
      expect(await c360.hasSpecialCategoryFor([special.holderPartyId])).toBe(true);
    }
    expect(await c360.hasSpecialCategoryFor([])).toBe(false);
    expect(await c360.hasSpecialCategoryFor(['party_does_not_exist'])).toBe(false);
  });

  it('hands back copies, so a caller cannot corrupt the store', async () => {
    const { c360, dataset } = await make();
    const holder = dataset.policies[0]?.holderPartyId;
    if (!holder) throw new Error('fixture has no policies');
    const scope = scopeForParty(dataset, holder);
    const first = await c360.listPolicies(scope);
    const target = first[0];
    if (!target) throw new Error('scope returned no policies');
    const original = target.premium;
    target.premium = -1;
    const second = await c360.listPolicies(scope);
    expect(second.find((p) => p.id === target.id)?.premium).toBe(original);
  });
}
