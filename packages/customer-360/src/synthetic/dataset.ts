import type { Customer360Dataset } from '../model';
import { buildAnchors } from './anchors';
import { buildGeneratedClients } from './generated';
import { APPROVED_PROCEDURES } from './procedures';

/**
 * Assembles the complete synthetic dataset and checks its referential integrity.
 *
 * The integrity check runs at load time rather than in a test, because a dangling
 * policy id in a fixture is exactly the kind of defect that makes an evaluation
 * quietly measure the wrong thing.
 */

let cached: Customer360Dataset | null = null;

export function buildSyntheticDataset(): Customer360Dataset {
  const anchors = buildAnchors();
  const generated = buildGeneratedClients();

  const dataset: Customer360Dataset = {
    parties: [...anchors.parties, ...generated.parties],
    relationships: [...anchors.relationships, ...generated.relationships],
    accounts: [...anchors.accounts, ...generated.accounts],
    policies: [...anchors.policies, ...generated.policies],
    insuredObjects: [...anchors.insuredObjects, ...generated.insuredObjects],
    coverageTerms: [...anchors.coverageTerms, ...generated.coverageTerms],
    claims: [...anchors.claims, ...generated.claims],
    receipts: [...anchors.receipts, ...generated.receipts],
    documents: [...anchors.documents, ...generated.documents],
    procedures: APPROVED_PROCEDURES,
  };

  assertIntegrity(dataset);
  return dataset;
}

/** Memoised loader — the dataset is immutable, so building it once is safe. */
export function getSyntheticDataset(): Customer360Dataset {
  cached ??= buildSyntheticDataset();
  return cached;
}

export class DatasetIntegrityError extends Error {}

export function assertIntegrity(dataset: Customer360Dataset): void {
  const problems: string[] = [];
  const ids = <T extends { id: string }>(items: T[]) => new Set(items.map((i) => i.id));

  const partyIds = ids(dataset.parties);
  const policyIds = ids(dataset.policies);
  const documentIds = ids(dataset.documents);
  const claimIds = ids(dataset.claims);
  const objectIds = ids(dataset.insuredObjects);

  const duplicates = (label: string, items: { id: string }[]) => {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.id)) problems.push(`duplicate ${label} id: ${item.id}`);
      seen.add(item.id);
    }
  };
  duplicates('party', dataset.parties);
  duplicates('policy', dataset.policies);
  duplicates('document', dataset.documents);
  duplicates('claim', dataset.claims);
  duplicates('account', dataset.accounts);
  duplicates('receipt', dataset.receipts);

  for (const acc of dataset.accounts) {
    if (!partyIds.has(acc.partyId)) problems.push(`account ${acc.id} → unknown party ${acc.partyId}`);
    for (const orgId of acc.organisationIds) {
      if (!partyIds.has(orgId)) problems.push(`account ${acc.id} → unknown organisation ${orgId}`);
    }
  }
  for (const rel of dataset.relationships) {
    if (!partyIds.has(rel.fromPartyId)) problems.push(`relationship ${rel.id} → unknown from ${rel.fromPartyId}`);
    if (!partyIds.has(rel.toPartyId)) problems.push(`relationship ${rel.id} → unknown to ${rel.toPartyId}`);
  }
  for (const pol of dataset.policies) {
    if (!partyIds.has(pol.holderPartyId)) problems.push(`policy ${pol.id} → unknown holder ${pol.holderPartyId}`);
    for (const objId of pol.insuredObjectIds) {
      if (!objectIds.has(objId)) problems.push(`policy ${pol.id} → unknown insured object ${objId}`);
    }
    for (const docId of pol.documentIds) {
      if (!documentIds.has(docId)) problems.push(`policy ${pol.id} → unknown document ${docId}`);
    }
  }
  for (const term of dataset.coverageTerms) {
    if (!policyIds.has(term.policyId)) problems.push(`coverage term ${term.id} → unknown policy ${term.policyId}`);
    const doc = dataset.documents.find((d) => d.id === term.documentId);
    if (!doc) {
      problems.push(`coverage term ${term.id} → unknown document ${term.documentId}`);
    } else if (!doc.passages.some((p) => p.id === term.passageId)) {
      problems.push(`coverage term ${term.id} → unknown passage ${term.passageId}`);
    }
  }
  for (const clm of dataset.claims) {
    if (!policyIds.has(clm.policyId)) problems.push(`claim ${clm.id} → unknown policy ${clm.policyId}`);
    if (!partyIds.has(clm.holderPartyId)) problems.push(`claim ${clm.id} → unknown holder ${clm.holderPartyId}`);
    for (const docId of clm.documentIds) {
      if (!documentIds.has(docId)) problems.push(`claim ${clm.id} → unknown document ${docId}`);
    }
  }
  for (const rec of dataset.receipts) {
    if (!policyIds.has(rec.policyId)) problems.push(`receipt ${rec.id} → unknown policy ${rec.policyId}`);
  }
  for (const doc of dataset.documents) {
    if (!partyIds.has(doc.ownerPartyId)) problems.push(`document ${doc.id} → unknown owner ${doc.ownerPartyId}`);
    if (doc.policyId && !policyIds.has(doc.policyId)) {
      problems.push(`document ${doc.id} → unknown policy ${doc.policyId}`);
    }
    if (doc.claimId && !claimIds.has(doc.claimId)) {
      problems.push(`document ${doc.id} → unknown claim ${doc.claimId}`);
    }
    if (doc.supersededByDocumentId && !documentIds.has(doc.supersededByDocumentId)) {
      problems.push(`document ${doc.id} → unknown superseding document ${doc.supersededByDocumentId}`);
    }
  }

  if (problems.length > 0) {
    throw new DatasetIntegrityError(
      `Synthetic dataset failed integrity checks:\n  - ${problems.join('\n  - ')}`,
    );
  }
}

/** Summary used by the prototype banner and the docs, so the numbers never drift. */
export function datasetSummary(dataset: Customer360Dataset = getSyntheticDataset()) {
  return {
    persons: dataset.parties.filter((p) => p.type === 'PERSON').length,
    organisations: dataset.parties.filter((p) => p.type === 'ORGANISATION').length,
    accounts: dataset.accounts.length,
    policies: dataset.policies.length,
    claims: dataset.claims.length,
    documents: dataset.documents.length,
    documentPassages: dataset.documents.reduce((sum, d) => sum + d.passages.length, 0),
    receipts: dataset.receipts.length,
    coverageTerms: dataset.coverageTerms.length,
    procedures: dataset.procedures.length,
  };
}
