import type { FieldProvenance, Party, PartyType, Policy, PolicyStatus, ProductLine } from './model';

/**
 * The Customer 360 write side (blueprint §9.2; ADR-0001).
 *
 * A separate port, deliberately. The read port has no write method, so the Concierge
 * pipeline — which only ever holds a `Customer360Port` — cannot reach any of this,
 * and the read model cannot quietly become a policy administration system. An
 * implementation may share a connection with the reader; it must not share a type.
 *
 * The other property this file exists to enforce: **the caller supplies values, the
 * writer supplies provenance.** A form posts a premium and a renewal date; it does
 * not get to say where they came from. Every field written here is stamped
 * `ADVISER_ENTERED` with the named adviser as its source, so no path through the
 * employee workspace can produce a record that claims to have come from the
 * management system.
 */

/** The person doing the entering. Their id becomes the provenance of every field. */
export interface AdviserIdentity {
  employeeId: string;
  displayName: string;
}

export interface PartyEntry {
  type: PartyType;
  name: string;
  surname?: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
}

export interface PolicyEntry {
  policyNumber: string;
  holderPartyId: string;
  insurer: string;
  product: ProductLine;
  productLabel: string;
  status: PolicyStatus;
  inceptionDate: string;
  renewalDate: string;
  /** Annual premium in EUR. */
  premium: number;
  previousPremium?: number | null;
  /**
   * How sure the adviser is, where the document was unclear. Defaults to 1.
   *
   * Worth having even though most entries will be 1: a figure read off a smudged
   * scan and a figure read off a clean schedule are not the same evidence, and the
   * conflict machinery downstream already knows what to do with the difference.
   */
  confidence?: number;
}

/**
 * Builds the provenance stamp for a hand-entered field.
 *
 * `sourceId` is the adviser, not "the employee workspace". Attribution to a person
 * is the whole reason this source type can be tier A: somebody read the document and
 * put their name to what it says.
 */
export function adviserProvenance(
  by: AdviserIdentity,
  at: string,
  field: string,
  confidence = 1,
): FieldProvenance {
  return {
    sourceType: 'ADVISER_ENTERED',
    sourceId: by.employeeId,
    sourcePath: field,
    observedAt: at,
    confidence,
  };
}

/** Stamps every named field of a record with the same adviser provenance. */
export function adviserProvenanceFor(
  fields: readonly string[],
  by: AdviserIdentity,
  at: string,
  confidence = 1,
): Record<string, FieldProvenance> {
  const out: Record<string, FieldProvenance> = {};
  for (const field of fields) out[field] = adviserProvenance(by, at, field, confidence);
  return out;
}

/** The fields of a policy a client may be told about, so each one carries provenance. */
export const POLICY_MATERIAL_FIELDS = [
  'policyNumber',
  'insurer',
  'product',
  'productLabel',
  'status',
  'inceptionDate',
  'renewalDate',
  'premium',
  'previousPremium',
] as const;

export const PARTY_MATERIAL_FIELDS = ['name', 'surname', 'email', 'phone', 'city'] as const;

export interface Customer360Writer {
  createParty(entry: PartyEntry, by: AdviserIdentity, at: string): Promise<Party>;
  createPolicy(entry: PolicyEntry, by: AdviserIdentity, at: string): Promise<Policy>;
  /**
   * Replaces a policy's material fields and re-stamps their provenance.
   *
   * A correction is a new observation by a named person at a known time, not an
   * edit that erases the previous one — which is why `observedAt` moves forward
   * rather than the old value being silently overwritten with no trace of when it
   * changed. Returns null when the policy does not exist.
   */
  updatePolicy(policyId: string, entry: PolicyEntry, by: AdviserIdentity, at: string): Promise<Policy | null>;

  /*
   * Employee-side reads, unscoped.
   *
   * An adviser entering a policy needs to see the parties and policies already on
   * file, and no `AuthorisedScope` exists for an employee — their authority comes
   * from their role, checked at the surface. These are on the *writer* precisely so
   * that holding a read port never grants them.
   */
  listParties(): Promise<Party[]>;
  listPoliciesForParty(partyId: string): Promise<Policy[]>;
}
