import { describe, expect, it } from 'vitest';
import { computeScope } from '@rosillo/auth';
import { DATASET_TODAY, SyntheticCustomer360 } from '@rosillo/customer-360';
import { emptyScope } from '@rosillo/domain';

/**
 * Server-side authorisation (blueprint §13.1, §15.1).
 *
 * The property under test is structural, not behavioural: an `AuthorisedScope` is a
 * concrete list of record ids computed before anything else runs, so a resource the
 * caller may not see is not "filtered out later" — it was never in the list. These
 * tests read the list directly rather than inspecting an answer, because an answer
 * can be right by accident.
 */

const c360 = new SyntheticCustomer360();

async function scopeFor(accountId: string, context: { type: 'PERSON' | 'ORGANISATION'; id: string }) {
  return computeScope(c360, { accountId, requestedContext: context, on: DATASET_TODAY });
}

describe('personal context', () => {
  it('grants a client their own records', async () => {
    const scope = await scopeFor('acc_ana', { type: 'PERSON', id: 'party_ana' });
    expect(scope.policyIds).toContain('pol_ana_auto');
    expect(scope.claimIds).toContain('clm_ana_agua');
    expect(scope.documentIds).toContain('doc_ana_auto_cp');
  });

  it('refuses a personal context belonging to somebody else', async () => {
    const scope = await scopeFor('acc_ana', { type: 'PERSON', id: 'party_carlos' });
    // The caller stays identified — the refusal has to be attributable in the audit
    // trail — but the scope grants nothing at all.
    expect(scope.partyIds).toEqual([]);
    expect(scope.policyIds).toEqual([]);
    expect(scope.claimIds).toEqual([]);
    expect(scope.documentIds).toEqual([]);
    expect(scope.receiptIds).toEqual([]);
    expect(scope.appliedGrants).toEqual([]);
    expect(scope.authorityBasis).toBe(emptyScope('acc_ana').authorityBasis);
  });

  it('refuses an unknown account outright', async () => {
    const scope = await scopeFor('acc_does_not_exist', { type: 'PERSON', id: 'party_ana' });
    expect(scope.partyIds).toEqual([]);
  });

  it('refuses a fabricated party id', async () => {
    const scope = await scopeFor('acc_ana', { type: 'PERSON', id: 'party_" OR 1=1 --' });
    expect(scope.partyIds).toEqual([]);
  });
});

describe('delegated authority', () => {
  it('expands only the grants that were actually given', async () => {
    const scope = await scopeFor('acc_ana', { type: 'PERSON', id: 'party_ana' });
    // Ana holds VIEW_POLICIES over Luis: his policies, and nothing else of his.
    expect(scope.policyIds).toContain('pol_luis_auto');
    expect(scope.policyIds).toContain('pol_luis_vida');
    expect(scope.viaDelegation).toBe(true);
  });

  it('does not reach a delegated party’s claims, documents or receipts', async () => {
    const scope = await scopeFor('acc_ana', { type: 'PERSON', id: 'party_ana' });
    const luisClaims = (await c360.listClaims(scope)).filter((claim) => claim.holderPartyId === 'party_luis');
    expect(luisClaims).toEqual([]);
    const luisDocuments = (await c360.listDocuments(scope, {})).filter((d) => d.ownerPartyId === 'party_luis');
    expect(luisDocuments).toEqual([]);
  });

  it('is one-directional — marriage is not authority', async () => {
    const scope = await scopeFor('acc_luis', { type: 'PERSON', id: 'party_luis' });
    expect(scope.policyIds).not.toContain('pol_ana_auto');
    expect(scope.policyIds).not.toContain('pol_ana_hogar');
  });

  it('gives an adult household member nothing', async () => {
    const scope = await scopeFor('acc_ana', { type: 'PERSON', id: 'party_ana' });
    expect(scope.policyIds).not.toContain('pol_marta_viaje');
  });

  it('never extends special-category data through a delegation', async () => {
    const ana = await scopeFor('acc_ana', { type: 'PERSON', id: 'party_ana' });
    expect(ana.includesSpecialCategory).toBe(false);
    const pilar = await scopeFor('acc_pilar', { type: 'PERSON', id: 'party_pilar' });
    // The subject of the data reaches it; nobody reaches it on their behalf.
    expect(pilar.claimIds).toContain('clm_pilar_salud');
  });
});

describe('organisation context', () => {
  it('replaces personal scope rather than adding to it', async () => {
    const scope = await scopeFor('acc_elena', { type: 'ORGANISATION', id: 'org_serrano' });
    expect(scope.policyIds).toContain('pol_serrano_rc');
    // Elena's own personal policies are not visible while acting for the company.
    expect(scope.policyIds.every((id) => !id.startsWith('pol_elena'))).toBe(true);
  });

  it('honours a narrower employee grant inside the same company', async () => {
    const admin = await scopeFor('acc_elena', { type: 'ORGANISATION', id: 'org_serrano' });
    const employee = await scopeFor('acc_javier', { type: 'ORGANISATION', id: 'org_serrano' });

    expect(employee.policyIds).toEqual(admin.policyIds);
    // Same company, same policies, different authority over everything else.
    expect(employee.claimIds).toEqual([]);
    expect(employee.documentIds).toEqual([]);
    expect(employee.receiptIds).toEqual([]);
    expect(admin.claimIds.length).toBeGreaterThan(0);
    expect(admin.documentIds.length).toBeGreaterThan(0);
  });

  it('refuses an organisation the caller has no role in', async () => {
    const scope = await scopeFor('acc_ana', { type: 'ORGANISATION', id: 'org_serrano' });
    expect(scope.policyIds).toEqual([]);
    expect(scope.partyIds).toEqual([]);
  });

  it('records the basis on which authority was granted', async () => {
    const scope = await scopeFor('acc_javier', { type: 'ORGANISATION', id: 'org_serrano' });
    expect(scope.authorityBasis).toContain('Empleado autorizado');
    expect(scope.appliedGrants).toContain('VIEW_POLICIES');
    expect(scope.appliedGrants).not.toContain('VIEW_CLAIMS');
  });
});

describe('the read model refuses to serve an unauthorised id', () => {
  it('will not return a policy outside the scope even when asked by id', async () => {
    const scope = await scopeFor('acc_ana', { type: 'PERSON', id: 'party_ana' });
    await expect(c360.getPolicy(scope, 'pol_carlos_auto')).resolves.toBeNull();
  });

  it('will not return a document outside the scope even when asked by id', async () => {
    const scope = await scopeFor('acc_marta', { type: 'PERSON', id: 'party_marta' });
    await expect(c360.getDocument(scope, 'doc_ana_hogar_cp')).resolves.toBeNull();
  });

  it('will not return coverage terms for a policy outside the scope', async () => {
    const scope = await scopeFor('acc_carlos', { type: 'PERSON', id: 'party_carlos' });
    await expect(c360.listCoverageTerms(scope, 'pol_ana_auto')).resolves.toEqual([]);
  });
});
