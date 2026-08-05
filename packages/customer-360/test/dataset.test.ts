import { describe, expect, it } from 'vitest';
import { emptyScope, type AuthorisedScope } from '@rosillo/domain';
import {
  APPROVED_PROCEDURES,
  DATASET_TODAY,
  SyntheticCustomer360,
  assertIntegrity,
  buildSyntheticDataset,
  datasetSummary,
  getSyntheticDataset,
} from '../src/index';

const dataset = getSyntheticDataset();
const c360 = new SyntheticCustomer360();

/** A scope that can see everything — used only to exercise the adapter's shape. */
function fullScope(): AuthorisedScope {
  return {
    ...emptyScope('acc_test', 'party_test'),
    partyIds: dataset.parties.map((p) => p.id),
    policyIds: dataset.policies.map((p) => p.id),
    claimIds: dataset.claims.map((c) => c.id),
    documentIds: dataset.documents.map((d) => d.id),
    receiptIds: dataset.receipts.map((r) => r.id),
    includesSpecialCategory: true,
  };
}

describe('dataset scale (blueprint Milestone B)', () => {
  it('has at least 30 synthetic clients', () => {
    const summary = datasetSummary();
    expect(summary.persons).toBeGreaterThanOrEqual(30);
  });

  it('includes organisations, multi-policy households and commercial lines', () => {
    const summary = datasetSummary();
    expect(summary.organisations).toBeGreaterThanOrEqual(2);
    expect(summary.policies).toBeGreaterThan(40);
    expect(summary.documentPassages).toBeGreaterThan(30);
    const products = new Set(dataset.policies.map((p) => p.product));
    expect(products).toContain('FLOTA');
    expect(products).toContain('CIBER');
    expect(products).toContain('MERCANCIAS');
  });

  it('is reproducible — two builds are identical', () => {
    expect(JSON.stringify(buildSyntheticDataset())).toEqual(JSON.stringify(buildSyntheticDataset()));
  });
});

describe('referential integrity', () => {
  it('passes its own integrity check', () => {
    expect(() => assertIntegrity(dataset)).not.toThrow();
  });

  it('fails loudly on a dangling reference', () => {
    const broken = structuredClone(dataset);
    broken.policies[0]!.holderPartyId = 'party_does_not_exist';
    expect(() => assertIntegrity(broken)).toThrow(/unknown holder/);
  });
});

describe('provenance', () => {
  it('attaches provenance to every material policy field', () => {
    for (const policy of dataset.policies) {
      for (const field of ['premium', 'renewalDate', 'status', 'insurer']) {
        expect(policy.fieldProvenance[field]).toBeDefined();
        expect(policy.fieldProvenance[field]?.observedAt).toBeTruthy();
      }
    }
  });

  it('records the unresolved conflict rather than picking a winner (anchor D)', () => {
    const policy = dataset.policies.find((p) => p.id === 'pol_rosa_hogar');
    const conflict = policy?.fieldProvenance['premium']?.conflict;
    expect(conflict).toBeDefined();
    expect(conflict?.otherValue).toBe('512,40 €');
    // Low confidence is the signal that this value cannot ground an answer alone.
    expect(policy?.fieldProvenance['premium']?.confidence).toBeLessThan(0.7);
  });

  it('marks the superseded schedule and keeps the replacement current (anchor E)', () => {
    const old = dataset.documents.find((d) => d.id === 'doc_miguel_auto_cp_v1');
    expect(old?.supersededByDocumentId).toBe('doc_miguel_auto_supl');
    const terms = dataset.coverageTerms.filter((t) => t.key === 'franquicia_danos_propios' && t.policyId === 'pol_miguel_auto');
    const current = terms.find((t) => !t.effectiveTo || t.effectiveTo >= DATASET_TODAY);
    expect(current?.value).toBe('150 €');
  });
});

describe('adapter behaviour', () => {
  it('excludes superseded documents unless asked for them', () => {
    const scope = fullScope();
    return Promise.all([
      c360.listDocuments(scope),
      c360.listDocuments(scope, { includeSuperseded: true }),
    ]).then(([current, all]) => {
      expect(current.map((d) => d.id)).not.toContain('doc_miguel_auto_cp_v1');
      expect(all.map((d) => d.id)).toContain('doc_miguel_auto_cp_v1');
    });
  });

  it('returns defensive copies so a caller cannot corrupt the shared dataset', async () => {
    const scope = fullScope();
    const first = await c360.getPolicy(scope, 'pol_ana_auto');
    first!.premium = 1;
    const second = await c360.getPolicy(scope, 'pol_ana_auto');
    expect(second?.premium).toBe(742.3);
  });

  it('finds an approved procedure by topic', async () => {
    const found = await c360.findProcedures('me han dado un golpe, quiero declarar el siniestro');
    expect(found.map((p) => p.id)).toContain('proc_declarar_siniestro_auto');
  });

  it('returns nothing for an empty topic rather than everything', async () => {
    expect(await c360.findProcedures('')).toHaveLength(0);
  });
});

describe('approved procedures', () => {
  it('versions and dates every procedure', () => {
    for (const procedure of APPROVED_PROCEDURES) {
      expect(procedure.version).toBeTruthy();
      expect(procedure.approvedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(procedure.approvedBy).toBeTruthy();
      expect(procedure.steps.length).toBeGreaterThan(0);
    }
  });

  it('never states what a policy covers — only how Rosillo works', () => {
    for (const procedure of APPROVED_PROCEDURES) {
      const text = procedure.steps.join(' ').toLowerCase();
      expect(text).not.toMatch(/est[áa] cubierto|queda cubierto|tienes cobertura/);
    }
  });
});
