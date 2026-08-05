import { createHash } from 'node:crypto';
import type { SourceType } from '@rosillo/domain';
import type {
  Claim,
  ClaimEvent,
  ClientAccount,
  CoverageTerm,
  FieldProvenance,
  InsuredObject,
  Party,
  Policy,
  PolicyDocument,
  DocumentPassage,
  ProductLine,
  Receipt,
  Relationship,
  RelationshipGrant,
  RelationshipKind,
} from '../model';

/**
 * Fixture builders for the synthetic dataset.
 *
 * Two properties matter here. First, everything is deterministic — no clock, no
 * randomness that is not seeded — so the evaluation suite scores the same result on
 * every run and in CI. Second, provenance is attached by the builders rather than by
 * hand, so it is impossible to add a material field to a fixture and forget where it
 * came from.
 */

/** The dataset's fixed "today". Keeping it a constant makes renewal windows stable. */
export const DATASET_TODAY = '2026-08-05';
/** When the read model last synchronised from the (synthetic) system of record. */
export const OBSERVED_AT = '2026-08-05T06:00:00.000Z';

export function checksum(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 32);
}

/** Deterministic PRNG (mulberry32) so generated filler data is reproducible. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length) % items.length];
  if (item === undefined) throw new Error('pick() called with an empty list');
  return item;
}

/** Builds provenance for a set of fields that all come from the same source record. */
export function provenanceFor(
  fields: readonly string[],
  source: {
    sourceType: SourceType;
    sourceId: string;
    pathPrefix?: string;
    effectiveFrom?: string;
    effectiveTo?: string;
    observedAt?: string;
    confidence?: number;
  },
): Record<string, FieldProvenance> {
  const out: Record<string, FieldProvenance> = {};
  for (const field of fields) {
    out[field] = {
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      sourcePath: source.pathPrefix ? `${source.pathPrefix}.${field}` : field,
      ...(source.effectiveFrom !== undefined ? { effectiveFrom: source.effectiveFrom } : {}),
      ...(source.effectiveTo !== undefined ? { effectiveTo: source.effectiveTo } : {}),
      observedAt: source.observedAt ?? OBSERVED_AT,
      confidence: source.confidence ?? 1,
    };
  }
  return out;
}

export interface PersonInput {
  id: string;
  name: string;
  surname: string;
  email: string | null;
  phone?: string | null;
  taxIdSynthetic?: string | null;
  city?: string | null;
}

const NIE_CHECK_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

/**
 * Forces a synthetic NIE to fail the official check-letter algorithm.
 *
 * A well-formed identifier that also happens to validate could, by construction, be
 * a real person's — which is the one thing a synthetic dataset must never produce.
 * The shape stays realistic so parsing and display code are exercised properly; the
 * check letter is deliberately the wrong one. Ids that already fail are left as
 * written, so the hand-authored anchor ids stay readable.
 */
export function invalidateCheckLetter(taxId: string | null | undefined): string | null {
  if (!taxId) return null;
  const match = /^([XYZ])(\d{7})([A-Z])$/.exec(taxId);
  if (!match) return taxId;
  const prefix = match[1] as 'X' | 'Y' | 'Z';
  const digits = match[2] ?? '';
  const numeric = Number.parseInt(`${{ X: '0', Y: '1', Z: '2' }[prefix]}${digits}`, 10);
  const index = numeric % 23;
  if (NIE_CHECK_LETTERS[index] !== match[3]) return taxId;
  // Shift one position along the official alphabet: same shape, never verifies.
  return `${prefix}${digits}${NIE_CHECK_LETTERS[(index + 1) % NIE_CHECK_LETTERS.length]}`;
}

export function person(input: PersonInput): Party {
  return {
    id: input.id,
    type: 'PERSON',
    name: input.name,
    surname: input.surname,
    email: input.email,
    phone: input.phone ?? null,
    taxIdSynthetic: invalidateCheckLetter(input.taxIdSynthetic),
    city: input.city ?? null,
    fieldProvenance: provenanceFor(['name', 'email', 'phone', 'taxIdSynthetic', 'city'], {
      sourceType: 'ERP',
      sourceId: `SEG-PARTY-${input.id}`,
      pathPrefix: 'cliente',
    }),
  };
}

export interface OrganisationInput {
  id: string;
  name: string;
  activity: string;
  employeeCount: number;
  email?: string | null;
  phone?: string | null;
  taxIdSynthetic?: string | null;
  city?: string | null;
}

export function organisation(input: OrganisationInput): Party {
  return {
    id: input.id,
    type: 'ORGANISATION',
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    taxIdSynthetic: input.taxIdSynthetic ?? null,
    city: input.city ?? null,
    activity: input.activity,
    employeeCount: input.employeeCount,
    fieldProvenance: provenanceFor(
      ['name', 'email', 'phone', 'taxIdSynthetic', 'city', 'activity', 'employeeCount'],
      { sourceType: 'ERP', sourceId: `SEG-ORG-${input.id}`, pathPrefix: 'empresa' },
    ),
  };
}

export function account(input: {
  id: string;
  partyId: string;
  email: string;
  displayName: string;
  language?: 'es' | 'en';
  channel?: 'chat' | 'phone' | 'email';
  organisationIds?: string[];
  status?: 'ACTIVE' | 'SUSPENDED';
}): ClientAccount {
  return {
    id: input.id,
    partyId: input.partyId,
    email: input.email,
    displayName: input.displayName,
    preferredLanguage: input.language ?? 'es',
    preferredChannel: input.channel ?? 'chat',
    status: input.status ?? 'ACTIVE',
    organisationIds: input.organisationIds ?? [],
  };
}

export function relationship(input: {
  id: string;
  kind: RelationshipKind;
  fromPartyId: string;
  toPartyId: string;
  grants: RelationshipGrant[];
  basis: string;
  effectiveFrom?: string;
  effectiveTo?: string | null;
}): Relationship {
  return {
    id: input.id,
    kind: input.kind,
    fromPartyId: input.fromPartyId,
    toPartyId: input.toPartyId,
    grants: input.grants,
    effectiveFrom: input.effectiveFrom ?? '2020-01-01',
    effectiveTo: input.effectiveTo ?? null,
    basis: input.basis,
    fieldProvenance: provenanceFor(['grants', 'effectiveFrom', 'effectiveTo'], {
      sourceType: 'ERP',
      sourceId: `SEG-REL-${input.id}`,
      pathPrefix: 'autorizacion',
    }),
  };
}

export function policy(input: {
  id: string;
  policyNumber: string;
  holderPartyId: string;
  insurer: string;
  product: ProductLine;
  productLabel: string;
  status?: Policy['status'];
  inceptionDate: string;
  renewalDate: string;
  premium: number;
  previousPremium?: number | null;
  insuredObjectIds?: string[];
  documentIds?: string[];
  /** Attach a deliberate ERP-vs-document disagreement on the premium. */
  premiumConflict?: { otherSourceId: string; otherValue: string; detail: string };
}): Policy {
  const provenance = provenanceFor(
    ['premium', 'previousPremium', 'renewalDate', 'status', 'insurer', 'inceptionDate'],
    {
      sourceType: 'ERP',
      sourceId: `SEG-POL-${input.policyNumber}`,
      pathPrefix: 'poliza',
      effectiveFrom: input.inceptionDate,
      effectiveTo: input.renewalDate,
    },
  );
  if (input.premiumConflict) {
    const premiumProvenance = provenance['premium'];
    if (premiumProvenance) {
      premiumProvenance.conflict = {
        otherSourceType: 'POLICY_DOCUMENT',
        otherSourceId: input.premiumConflict.otherSourceId,
        otherValue: input.premiumConflict.otherValue,
        detail: input.premiumConflict.detail,
      };
      premiumProvenance.confidence = 0.55;
    }
  }
  return {
    id: input.id,
    policyNumber: input.policyNumber,
    holderPartyId: input.holderPartyId,
    insurer: input.insurer,
    product: input.product,
    productLabel: input.productLabel,
    status: input.status ?? 'ACTIVE',
    inceptionDate: input.inceptionDate,
    renewalDate: input.renewalDate,
    premium: input.premium,
    previousPremium: input.previousPremium ?? null,
    currency: 'EUR',
    insuredObjectIds: input.insuredObjectIds ?? [],
    documentIds: input.documentIds ?? [],
    fieldProvenance: provenance,
  };
}

export function insuredObject(input: {
  id: string;
  kind: InsuredObject['kind'];
  label: string;
  attributes: Record<string, string>;
}): InsuredObject {
  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    attributes: input.attributes,
    fieldProvenance: provenanceFor(['label', ...Object.keys(input.attributes)], {
      sourceType: 'ERP',
      sourceId: `SEG-OBJ-${input.id}`,
      pathPrefix: 'riesgo',
    }),
  };
}

export function coverageTerm(input: {
  id: string;
  policyId: string;
  kind: CoverageTerm['kind'];
  key: string;
  label: string;
  value: string;
  documentId: string;
  passageId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
}): CoverageTerm {
  return {
    id: input.id,
    policyId: input.policyId,
    kind: input.kind,
    key: input.key,
    label: input.label,
    value: input.value,
    documentId: input.documentId,
    passageId: input.passageId,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo ?? null,
    fieldProvenance: provenanceFor(['value'], {
      sourceType: 'POLICY_DOCUMENT',
      sourceId: input.documentId,
      pathPrefix: input.passageId,
      effectiveFrom: input.effectiveFrom,
      ...(input.effectiveTo ? { effectiveTo: input.effectiveTo } : {}),
    }),
  };
}

export function claim(input: {
  id: string;
  claimNumber: string;
  policyId: string;
  holderPartyId: string;
  status: Claim['status'];
  lossDate: string;
  reportedDate: string;
  description: string;
  chronology: ClaimEvent[];
  outstandingItems?: Claim['outstandingItems'];
  reserveAmount?: number | null;
  documentIds?: string[];
  specialCategory?: boolean;
}): Claim {
  return {
    id: input.id,
    claimNumber: input.claimNumber,
    policyId: input.policyId,
    holderPartyId: input.holderPartyId,
    status: input.status,
    lossDate: input.lossDate,
    reportedDate: input.reportedDate,
    description: input.description,
    chronology: input.chronology,
    outstandingItems: input.outstandingItems ?? [],
    reserveAmount: input.reserveAmount ?? null,
    documentIds: input.documentIds ?? [],
    specialCategory: input.specialCategory ?? false,
    fieldProvenance: provenanceFor(['status', 'lossDate', 'reportedDate', 'reserveAmount'], {
      sourceType: 'CLAIM_RECORD',
      sourceId: `SEG-CLM-${input.claimNumber}`,
      pathPrefix: 'siniestro',
    }),
  };
}

export function receipt(input: {
  id: string;
  receiptNumber: string;
  policyId: string;
  amount: number;
  dueDate: string;
  status: Receipt['status'];
  paidAt?: string | null;
  periodFrom: string;
  periodTo: string;
}): Receipt {
  return {
    id: input.id,
    receiptNumber: input.receiptNumber,
    policyId: input.policyId,
    amount: input.amount,
    dueDate: input.dueDate,
    status: input.status,
    paidAt: input.paidAt ?? null,
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    fieldProvenance: provenanceFor(['amount', 'dueDate', 'status', 'paidAt'], {
      sourceType: 'ERP',
      sourceId: `SEG-REC-${input.receiptNumber}`,
      pathPrefix: 'recibo',
      effectiveFrom: input.periodFrom,
      effectiveTo: input.periodTo,
    }),
  };
}

export function passages(entries: { heading: string; text: string }[], prefix: string): DocumentPassage[] {
  return entries.map((entry, index) => ({
    id: `${prefix}_p${index + 1}`,
    ordinal: index + 1,
    heading: entry.heading,
    text: entry.text,
  }));
}

export function document(input: {
  id: string;
  kind: PolicyDocument['kind'];
  title: string;
  ownerPartyId: string;
  policyId?: string | null;
  claimId?: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  supersededByDocumentId?: string | null;
  classification?: PolicyDocument['classification'];
  passages: DocumentPassage[];
  clientDownloadable?: boolean;
}): PolicyDocument {
  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    ownerPartyId: input.ownerPartyId,
    policyId: input.policyId ?? null,
    claimId: input.claimId ?? null,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo ?? null,
    supersededByDocumentId: input.supersededByDocumentId ?? null,
    classification: input.classification ?? 'CONFIDENTIAL_CLIENT',
    checksum: checksum(input.id + input.passages.map((p) => p.text).join('')),
    passages: input.passages,
    clientDownloadable: input.clientDownloadable ?? true,
    fieldProvenance: provenanceFor(['title', 'effectiveFrom', 'effectiveTo'], {
      sourceType: 'POLICY_DOCUMENT',
      sourceId: input.id,
      pathPrefix: 'documento',
      effectiveFrom: input.effectiveFrom,
      ...(input.effectiveTo ? { effectiveTo: input.effectiveTo } : {}),
    }),
  };
}
