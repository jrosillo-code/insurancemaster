import type { SourceType } from '@rosillo/domain';

/**
 * Canonical Customer 360 entities (blueprint §9.1).
 *
 * This is a read model and an evidence index — not a policy administration system.
 * Every cached field maps back to an authoritative source, because in production the
 * ERP (segElevia) remains the system of record (ADR-0001).
 */

/** Where a field came from and when, for a single record field (blueprint §9.2). */
export interface FieldProvenance {
  sourceType: SourceType;
  /** Identifier in the originating system, e.g. "SEG-POL-000123". */
  sourceId: string;
  /** Path inside that source, e.g. "poliza.prima.anual". */
  sourcePath?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  observedAt: string;
  confidence: number;
  /** Set when another source disagrees on this field. Never silently resolved. */
  conflict?: {
    otherSourceType: SourceType;
    otherSourceId: string;
    otherValue: string;
    detail: string;
  };
}

/** Common shape for every record that carries per-field provenance. */
export interface Provenanced {
  /** field name → provenance. Fields absent from this map are not material. */
  fieldProvenance: Record<string, FieldProvenance>;
}

export type PartyType = 'PERSON' | 'ORGANISATION';

export interface Party extends Provenanced {
  id: string;
  type: PartyType;
  /** Full legal name for a person, trading name for an organisation. */
  name: string;
  /** Family name, used to construct deliberate same-surname access-control cases. */
  surname?: string;
  email: string | null;
  phone: string | null;
  /** Synthetic, structurally-valid-looking but fake identifier. Never a real NIF/CIF. */
  taxIdSynthetic: string | null;
  /** Free-text city, used for context only. */
  city: string | null;
  /** Present for organisations. */
  activity?: string;
  employeeCount?: number;
}

export const RELATIONSHIP_KINDS = [
  'HOUSEHOLD_MEMBER',
  'SPOUSE',
  'PARENT_OF',
  'COMPANY_ADMIN',
  'COMPANY_EMPLOYEE',
  'FLEET_MANAGER',
  'DELEGATED_ACCESS',
  'ADVISER_ASSIGNMENT',
] as const;
export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number];

/**
 * How one party may act for another. Authority is explicit and scoped — sharing a
 * household or a surname grants nothing on its own (blueprint §3 "one customer,
 * one authorised context").
 */
export interface Relationship extends Provenanced {
  id: string;
  kind: RelationshipKind;
  /** The party who holds the authority. */
  fromPartyId: string;
  /** The party the authority is over. */
  toPartyId: string;
  /**
   * What the holder may actually see. An empty array means the relationship is
   * recorded for context but confers no data access.
   */
  grants: RelationshipGrant[];
  effectiveFrom: string;
  effectiveTo: string | null;
  /** How the authority was established, shown to employees on every handoff. */
  basis: string;
}

export const RELATIONSHIP_GRANTS = [
  'VIEW_POLICIES',
  'VIEW_CLAIMS',
  'VIEW_DOCUMENTS',
  'VIEW_RECEIPTS',
  'CREATE_TASKS',
] as const;
export type RelationshipGrant = (typeof RELATIONSHIP_GRANTS)[number];

export interface ClientAccount {
  id: string;
  partyId: string;
  email: string;
  displayName: string;
  preferredLanguage: 'es' | 'en';
  preferredChannel: 'chat' | 'phone' | 'email';
  status: 'ACTIVE' | 'SUSPENDED';
  /** Organisations this account may switch into, subject to relationship grants. */
  organisationIds: string[];
}

export type PolicyStatus = 'ACTIVE' | 'PENDING_RENEWAL' | 'CANCELLED' | 'LAPSED';
export type ProductLine =
  | 'AUTO'
  | 'HOGAR'
  | 'SALUD'
  | 'VIDA'
  | 'VIAJE'
  | 'RC_GENERAL'
  | 'COMERCIO'
  | 'FLOTA'
  | 'CIBER'
  | 'MERCANCIAS';

export interface Policy extends Provenanced {
  id: string;
  policyNumber: string;
  /** The party the policy belongs to — person or organisation. */
  holderPartyId: string;
  insurer: string;
  product: ProductLine;
  productLabel: string;
  status: PolicyStatus;
  inceptionDate: string;
  renewalDate: string;
  /** Annual premium in EUR. */
  premium: number;
  /** Previous term's premium, when a renewal has already happened. */
  previousPremium: number | null;
  currency: 'EUR';
  insuredObjectIds: string[];
  /** Ids of documents that evidence this policy's terms. */
  documentIds: string[];
}

export type InsuredObjectKind =
  | 'VEHICLE'
  | 'PROPERTY'
  | 'BUSINESS_LOCATION'
  | 'VALUABLE'
  | 'PERSON'
  | 'GOODS';

export interface InsuredObject extends Provenanced {
  id: string;
  kind: InsuredObjectKind;
  /** Display label, e.g. "Audi Q5 45 TFSI · 4821 KLM". */
  label: string;
  /** Kind-specific attributes, all strings so the wire format stays flat. */
  attributes: Record<string, string>;
}

/** A structured clause, limit or exclusion with document provenance (blueprint §9.1). */
export interface CoverageTerm extends Provenanced {
  id: string;
  policyId: string;
  kind: 'LIMIT' | 'DEDUCTIBLE' | 'EXCLUSION' | 'COVERAGE' | 'SUBLIMIT';
  /** Machine key used by retrieval, e.g. "robo", "franquicia_danos". */
  key: string;
  label: string;
  /** Human-readable value, e.g. "300 €" or "Excluido en deportes de invierno". */
  value: string;
  /** The document passage this term was read from. */
  documentId: string;
  passageId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export type ClaimStatus =
  | 'REPORTED'
  | 'AWAITING_DOCUMENTS'
  | 'UNDER_REVIEW'
  | 'INSURER_ASSESSING'
  | 'SETTLED'
  | 'CLOSED'
  | 'REJECTED';

export interface ClaimEvent {
  at: string;
  /** Who moved the claim: Rosillo, the insurer or the client. */
  party: 'ROSILLO' | 'INSURER' | 'CLIENT';
  description: string;
}

export interface Claim extends Provenanced {
  id: string;
  claimNumber: string;
  policyId: string;
  holderPartyId: string;
  status: ClaimStatus;
  lossDate: string;
  reportedDate: string;
  description: string;
  /** Dated chronology shown to the client as a timeline (blueprint §5.2). */
  chronology: ClaimEvent[];
  /** What is still outstanding and who owes it. */
  outstandingItems: { label: string; responsible: 'CLIENT' | 'ROSILLO' | 'INSURER' }[];
  reserveAmount: number | null;
  documentIds: string[];
  /** True for claims that may include health data — stricter access (blueprint §12.2). */
  specialCategory: boolean;
}

export type ReceiptStatus = 'PAID' | 'PENDING' | 'RETURNED';

export interface Receipt extends Provenanced {
  id: string;
  receiptNumber: string;
  policyId: string;
  amount: number;
  dueDate: string;
  status: ReceiptStatus;
  paidAt: string | null;
  periodFrom: string;
  periodTo: string;
}

export type DocumentKind =
  | 'POLICY_SCHEDULE'
  | 'POLICY_WORDING'
  | 'ENDORSEMENT'
  | 'RECEIPT'
  | 'CERTIFICATE'
  | 'CLAIM_EVIDENCE'
  | 'INSURER_NOTICE'
  | 'PROCEDURE';

/** An extracted, citable passage of a document. Retrieval cites passages, never whole files. */
export interface DocumentPassage {
  id: string;
  /** Ordinal within the document, used for stable display order. */
  ordinal: number;
  heading: string;
  text: string;
}

export interface PolicyDocument extends Provenanced {
  id: string;
  kind: DocumentKind;
  title: string;
  /** Owning party — the authorisation anchor for this document. */
  ownerPartyId: string;
  policyId: string | null;
  claimId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  /** Set when a later document replaces this one; stale sources are flagged, not hidden. */
  supersededByDocumentId: string | null;
  /** Content classification driving handling rules (blueprint §12.2). */
  classification: 'CONFIDENTIAL_CLIENT' | 'SPECIAL_CATEGORY' | 'INTERNAL';
  checksum: string;
  passages: DocumentPassage[];
  /** True when the client may download it directly without an adviser preparing it. */
  clientDownloadable: boolean;
}

/** An approved Rosillo procedure — knowledge tier C (blueprint §9.4). */
export interface ApprovedProcedure {
  id: string;
  title: string;
  /** Topics this procedure answers, used for deterministic lookup. */
  topics: string[];
  steps: string[];
  requiredDocuments: string[];
  responsibleTeam: string;
  serviceExpectation: string;
  version: string;
  approvedAt: string;
  approvedBy: string;
}

/** The complete synthetic dataset, loaded once and treated as immutable. */
export interface Customer360Dataset {
  parties: Party[];
  relationships: Relationship[];
  accounts: ClientAccount[];
  policies: Policy[];
  insuredObjects: InsuredObject[];
  coverageTerms: CoverageTerm[];
  claims: Claim[];
  receipts: Receipt[];
  documents: PolicyDocument[];
  procedures: ApprovedProcedure[];
}
