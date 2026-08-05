import { describe, expect, it } from 'vitest';
import { DATASET_TODAY, SyntheticCustomer360 } from '@rosillo/customer-360';
import { computeScope, listAvailableContexts } from '../src/authority';

/**
 * Authorisation is the control the whole platform rests on, so these tests are
 * written as negative assertions wherever possible: not "Ana can see her policies"
 * but "Ana cannot see anyone else's", including the people she is related to.
 */

const c360 = new SyntheticCustomer360();
const on = DATASET_TODAY;

async function scopeFor(accountId: string, context: { type: 'PERSON' | 'ORGANISATION'; id: string }) {
  return computeScope(c360, { accountId, requestedContext: context, on });
}

describe('scope: own records', () => {
  it('includes every resource family for the authenticated party', async () => {
    const scope = await scopeFor('acc_ana', { type: 'PERSON', id: 'party_ana' });
    expect(scope.policyIds).toContain('pol_ana_auto');
    expect(scope.policyIds).toContain('pol_ana_hogar');
    expect(scope.claimIds).toContain('clm_ana_agua');
    expect(scope.documentIds).toContain('doc_ana_auto_cp');
    expect(scope.receiptIds).toContain('rec_ana_auto_1');
  });

  it('refuses a person context that is not the account holder', async () => {
    // Ana asking to act *as* Carlos, not merely to read his data.
    const scope = await scopeFor('acc_ana', { type: 'PERSON', id: 'party_carlos' });
    expect(scope.policyIds).toHaveLength(0);
    expect(scope.partyIds).toHaveLength(0);
  });
});

describe('scope: same surname, unrelated client (anchor B)', () => {
  it('never leaks Carlos García into Ana García’s scope', async () => {
    const scope = await scopeFor('acc_ana', { type: 'PERSON', id: 'party_ana' });
    expect(scope.partyIds).not.toContain('party_carlos');
    expect(scope.policyIds).not.toContain('pol_carlos_auto');
    expect(scope.policyIds).not.toContain('pol_carlos_hogar');
    expect(scope.claimIds).not.toContain('clm_carlos_auto');
  });

  it('is symmetric — Carlos cannot see Ana either', async () => {
    const scope = await scopeFor('acc_carlos', { type: 'PERSON', id: 'party_carlos' });
    expect(scope.policyIds).not.toContain('pol_ana_auto');
    expect(scope.documentIds).not.toContain('doc_ana_hogar_cp');
  });
});

describe('scope: partial delegation (anchor A)', () => {
  it('grants Ana exactly the one thing Luis authorised — policies', async () => {
    const scope = await scopeFor('acc_ana', { type: 'PERSON', id: 'party_ana' });
    expect(scope.policyIds).toContain('pol_luis_auto');
    expect(scope.policyIds).toContain('pol_luis_vida');
    expect(scope.viaDelegation).toBe(true);
  });

  it('withholds everything Luis did not authorise', async () => {
    const scope = await scopeFor('acc_ana', { type: 'PERSON', id: 'party_ana' });
    // The delegation carries VIEW_POLICIES only.
    const luisDocuments = c360.documentIdsForParty('party_luis');
    for (const documentId of luisDocuments) expect(scope.documentIds).not.toContain(documentId);
    const luisReceipts = c360.receiptIdsForPolicies(['pol_luis_auto', 'pol_luis_vida']);
    for (const receiptId of luisReceipts) expect(scope.receiptIds).not.toContain(receiptId);
  });

  it('is one-directional — Luis has no reciprocal access to Ana', async () => {
    const scope = await scopeFor('acc_luis', { type: 'PERSON', id: 'party_luis' });
    expect(scope.policyIds).not.toContain('pol_ana_auto');
    expect(scope.viaDelegation).toBe(false);
  });

  it('grants nothing for an adult household member with no explicit grant', async () => {
    const scope = await scopeFor('acc_ana', { type: 'PERSON', id: 'party_ana' });
    // Marta shares the household. That is context, not authority.
    expect(scope.partyIds).not.toContain('party_marta');
    expect(scope.policyIds).not.toContain('pol_marta_viaje');
  });
});

describe('scope: organisation context (anchor C)', () => {
  it('gives the administrator the full company portfolio', async () => {
    const scope = await scopeFor('acc_elena', { type: 'ORGANISATION', id: 'org_serrano' });
    expect(scope.policyIds).toEqual(
      expect.arrayContaining(['pol_serrano_rc', 'pol_serrano_comercio', 'pol_serrano_flota', 'pol_serrano_ciber']),
    );
    expect(scope.claimIds).toContain('clm_serrano_rc');
    expect(scope.receiptIds).toContain('rec_serrano_rc_1');
  });

  it('restricts an employee to the single grant they hold', async () => {
    const scope = await scopeFor('acc_javier', { type: 'ORGANISATION', id: 'org_serrano' });
    expect(scope.policyIds).toContain('pol_serrano_rc');
    // VIEW_POLICIES only: no claims, no receipts, no documents.
    expect(scope.claimIds).toHaveLength(0);
    expect(scope.receiptIds).toHaveLength(0);
    expect(scope.documentIds).toHaveLength(0);
  });

  it('replaces personal scope rather than adding to it', async () => {
    const personal = await scopeFor('acc_elena', { type: 'PERSON', id: 'party_elena' });
    const company = await scopeFor('acc_elena', { type: 'ORGANISATION', id: 'org_serrano' });
    // A company session cannot quietly read personal policies.
    for (const policyId of company.policyIds) expect(personal.policyIds).not.toContain(policyId);
    expect(company.partyIds).toEqual(['org_serrano']);
  });

  it('denies an organisation the account was never granted', async () => {
    const scope = await scopeFor('acc_ana', { type: 'ORGANISATION', id: 'org_serrano' });
    expect(scope.policyIds).toHaveLength(0);
    expect(scope.authorityBasis).toBe('Sin autorización establecida');
  });
});

describe('scope: special-category data', () => {
  it('is in scope for the party who owns it', async () => {
    const scope = await scopeFor('acc_pilar', { type: 'PERSON', id: 'party_pilar' });
    expect(scope.includesSpecialCategory).toBe(true);
    const claim = await c360.getClaim(scope, 'clm_pilar_salud');
    expect(claim).not.toBeNull();
  });

  it('is never reachable through delegation', async () => {
    const scope = await scopeFor('acc_ana', { type: 'PERSON', id: 'party_ana' });
    expect(scope.claimIds).not.toContain('clm_pilar_salud');
    expect(await c360.getClaim(scope, 'clm_pilar_salud')).toBeNull();
  });
});

describe('scope: inactive and unknown accounts', () => {
  it('returns an empty scope for an unknown account', async () => {
    const scope = await scopeFor('acc_does_not_exist', { type: 'PERSON', id: 'party_ana' });
    expect(scope.policyIds).toHaveLength(0);
  });

  it('returns null rather than throwing for out-of-scope reads', async () => {
    const scope = await scopeFor('acc_ana', { type: 'PERSON', id: 'party_ana' });
    // An attacker must not be able to tell "not yours" from "does not exist".
    expect(await c360.getPolicy(scope, 'pol_carlos_auto')).toBeNull();
    expect(await c360.getPolicy(scope, 'pol_does_not_exist')).toBeNull();
  });
});

describe('available contexts', () => {
  it('lists the account itself plus organisations that granted access', async () => {
    const contexts = await listAvailableContexts(c360, 'acc_elena');
    expect(contexts.map((c) => c.id)).toEqual(['party_elena', 'org_serrano']);
  });

  it('lists only the account itself when no organisation granted access', async () => {
    const contexts = await listAvailableContexts(c360, 'acc_ana');
    expect(contexts.map((c) => c.id)).toEqual(['party_ana']);
  });
});
