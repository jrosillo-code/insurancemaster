import type { AuthorisedScope, EvidenceBackedField, EvidenceReference } from '@rosillo/domain';
import type {
  ApprovedProcedure,
  Claim,
  ClientAccount,
  CoverageTerm,
  InsuredObject,
  Party,
  Policy,
  PolicyDocument,
  Receipt,
  Relationship,
} from './model';

/**
 * The Customer 360 read port (blueprint §21 Milestone B).
 *
 * Read-only by construction: there is no write method on this interface, so no
 * amount of downstream code can turn the read model into a shadow policy
 * administration system (ADR-0001).
 *
 * Every accessor takes the caller's `AuthorisedScope` and filters by it. Passing an
 * id outside the scope returns null rather than throwing, so callers cannot use
 * timing or error shape to probe for the existence of another client's records.
 */
export interface Customer360Port {
  /** Identity lookups used before a scope exists — never return portfolio data. */
  getAccountByEmail(email: string): Promise<ClientAccount | null>;
  getAccountById(accountId: string): Promise<ClientAccount | null>;
  getPartyById(partyId: string): Promise<Party | null>;
  /** Relationships held BY this party. Used to compute scope. */
  getRelationshipsForParty(partyId: string): Promise<Relationship[]>;

  listPolicies(scope: AuthorisedScope): Promise<Policy[]>;
  getPolicy(scope: AuthorisedScope, policyId: string): Promise<Policy | null>;
  listInsuredObjects(scope: AuthorisedScope, policyId: string): Promise<InsuredObject[]>;
  listCoverageTerms(scope: AuthorisedScope, policyId: string): Promise<CoverageTerm[]>;

  listClaims(scope: AuthorisedScope): Promise<Claim[]>;
  getClaim(scope: AuthorisedScope, claimId: string): Promise<Claim | null>;

  listReceipts(scope: AuthorisedScope, policyId?: string): Promise<Receipt[]>;

  listDocuments(scope: AuthorisedScope, filter?: DocumentFilter): Promise<PolicyDocument[]>;
  getDocument(scope: AuthorisedScope, documentId: string): Promise<PolicyDocument | null>;

  /** Approved procedures are tier C: not client-specific, so no scope filtering. */
  findProcedures(topic: string): Promise<ApprovedProcedure[]>;
  getProcedure(procedureId: string): Promise<ApprovedProcedure | null>;

  /** Everything the scope can see, for the portfolio overview intent. */
  getPortfolioSnapshot(scope: AuthorisedScope): Promise<PortfolioSnapshot>;
}

export interface DocumentFilter {
  policyId?: string;
  claimId?: string;
  kind?: PolicyDocument['kind'];
  /** When false (default), superseded documents are excluded from results. */
  includeSuperseded?: boolean;
}

export interface PortfolioSnapshot {
  policies: Policy[];
  claims: Claim[];
  receipts: Receipt[];
  documents: PolicyDocument[];
  insuredObjects: InsuredObject[];
  /** Receipts that are pending or returned — the client's live obligations. */
  outstandingReceipts: Receipt[];
  /** Policies renewing within the next 60 days. */
  upcomingRenewals: Policy[];
  /** Claims not in a terminal state. */
  openClaims: Claim[];
}

/**
 * Turns a record field into an evidence-backed field using the record's provenance.
 * Returns null when the field carries no provenance, which is the signal that it is
 * not material and must not be used to ground a client-facing statement.
 */
export function asEvidenceField(
  record: { fieldProvenance: Record<string, import('./model').FieldProvenance> },
  field: string,
  value: string | null,
): EvidenceBackedField | null {
  const provenance = record.fieldProvenance[field];
  if (!provenance) return null;
  return {
    value,
    sourceType: provenance.sourceType,
    sourceId: provenance.sourceId,
    ...(provenance.sourcePath !== undefined ? { sourcePath: provenance.sourcePath } : {}),
    ...(provenance.effectiveFrom !== undefined ? { effectiveFrom: provenance.effectiveFrom } : {}),
    ...(provenance.effectiveTo !== undefined ? { effectiveTo: provenance.effectiveTo } : {}),
    observedAt: provenance.observedAt,
    confidence: provenance.confidence,
    ...(provenance.conflict !== undefined ? { conflict: provenance.conflict } : {}),
  };
}

/** Builds the citation shown on an evidence card for a structured record field. */
export function asEvidenceReference(
  record: { id: string; fieldProvenance: Record<string, import('./model').FieldProvenance> },
  field: string,
  label: string,
  quote?: string,
): EvidenceReference | null {
  const provenance = record.fieldProvenance[field];
  if (!provenance) return null;
  const tier = provenance.sourceType === 'POLICY_DOCUMENT' ? 'B' : 'A';
  return {
    id: `${record.id}#${field}`,
    sourceType: provenance.sourceType,
    sourceId: provenance.sourceId,
    label,
    fieldPath: provenance.sourcePath ?? field,
    ...(quote !== undefined ? { quote } : {}),
    ...(provenance.effectiveFrom !== undefined ? { effectiveFrom: provenance.effectiveFrom } : {}),
    ...(provenance.effectiveTo !== undefined ? { effectiveTo: provenance.effectiveTo } : {}),
    observedAt: provenance.observedAt,
    tier,
  };
}
