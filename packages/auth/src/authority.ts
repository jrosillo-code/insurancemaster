import type { ActiveContext, AuthorisedScope, ContextType } from '@rosillo/domain';
import { emptyScope } from '@rosillo/domain';
import type { RelationshipGrant } from '@rosillo/customer-360';
import { SyntheticCustomer360 } from '@rosillo/customer-360';

/**
 * Authority and scope computation (blueprint §9.3 steps 1–2, §12.3).
 *
 * This is where "one customer, one authorised context" becomes code. The scope is
 * built once per request from the authenticated account and the *recorded* grants,
 * and everything downstream reads through it. Two rules do most of the work:
 *
 *   1. Sharing a surname, a household or a company grants nothing. Only a
 *      relationship carrying an explicit grant widens the scope.
 *   2. Switching into an organisation context replaces personal scope rather than
 *      adding to it, so a company session cannot quietly read personal policies.
 *
 * A failure to establish authority produces an empty scope, never a wide one.
 */

export interface ContextOption {
  type: ContextType;
  id: string;
  label: string;
}

/** The contexts an account may act in: itself, plus organisations that granted it access. */
export async function listAvailableContexts(
  c360: SyntheticCustomer360,
  accountId: string,
): Promise<ContextOption[]> {
  const account = await c360.getAccountById(accountId);
  if (!account) return [];
  const self = await c360.getPartyById(account.partyId);
  if (!self) return [];

  const options: ContextOption[] = [{ type: 'PERSON', id: self.id, label: self.name }];
  const relationships = await c360.getRelationshipsForParty(self.id);
  for (const relationship of relationships) {
    if (relationship.grants.length === 0) continue;
    const target = await c360.getPartyById(relationship.toPartyId);
    if (!target || target.type !== 'ORGANISATION') continue;
    if (options.some((o) => o.id === target.id)) continue;
    options.push({ type: 'ORGANISATION', id: target.id, label: target.name });
  }
  return options;
}

function isActive(relationship: { effectiveFrom: string; effectiveTo: string | null }, on: string): boolean {
  if (relationship.effectiveFrom > on) return false;
  if (relationship.effectiveTo && relationship.effectiveTo < on) return false;
  return true;
}

export interface ComputeScopeInput {
  accountId: string;
  /** The context the session asked to act in. Validated, never trusted. */
  requestedContext: { type: ContextType; id: string };
  /** Date used for relationship effectivity, injected to keep tests deterministic. */
  on: string;
}

/**
 * Computes the authorised scope, or an empty scope when authority cannot be
 * established. Never throws for an unauthorised context — an attacker must not be
 * able to tell a rejected context from an unknown one.
 */
export async function computeScope(
  c360: SyntheticCustomer360,
  input: ComputeScopeInput,
): Promise<AuthorisedScope> {
  const account = await c360.getAccountById(input.accountId);
  if (!account || account.status !== 'ACTIVE') {
    return emptyScope(input.accountId, '');
  }
  const self = await c360.getPartyById(account.partyId);
  if (!self) return emptyScope(account.id, account.partyId);

  const relationships = (await c360.getRelationshipsForParty(self.id)).filter((r) =>
    isActive(r, input.on),
  );

  // ── Organisation context ────────────────────────────────────────────────────
  if (input.requestedContext.type === 'ORGANISATION') {
    const grantingRelationship = relationships.find(
      (r) => r.toPartyId === input.requestedContext.id && r.grants.length > 0,
    );
    const organisation = await c360.getPartyById(input.requestedContext.id);
    if (!grantingRelationship || !organisation || organisation.type !== 'ORGANISATION') {
      // No grant, no scope. The client sees a generic "context unavailable".
      return emptyScope(account.id, self.id, self.name);
    }
    return buildScope({
      c360,
      account,
      authenticatedPartyId: self.id,
      activeContext: { type: 'ORGANISATION', id: organisation.id, label: organisation.name },
      // An organisation context sees the organisation's records only.
      subjects: [{ partyId: organisation.id, grants: grantingRelationship.grants }],
      viaDelegation: true,
      authorityBasis: grantingRelationship.basis,
      appliedGrants: grantingRelationship.grants,
    });
  }

  // ── Person context ──────────────────────────────────────────────────────────
  // The only person context an account may hold is its own party.
  if (input.requestedContext.id !== self.id) {
    return emptyScope(account.id, self.id, self.name);
  }

  const subjects: { partyId: string; grants: RelationshipGrant[] }[] = [
    // Full access to one's own records.
    {
      partyId: self.id,
      grants: ['VIEW_POLICIES', 'VIEW_CLAIMS', 'VIEW_DOCUMENTS', 'VIEW_RECEIPTS', 'CREATE_TASKS'],
    },
  ];
  const delegations: string[] = [];
  const appliedGrants = new Set<string>();

  for (const relationship of relationships) {
    if (relationship.grants.length === 0) continue;
    const target = await c360.getPartyById(relationship.toPartyId);
    // Person context never absorbs an organisation's records; that needs a switch.
    if (!target || target.type !== 'PERSON') continue;
    subjects.push({ partyId: target.id, grants: relationship.grants });
    delegations.push(relationship.basis);
    for (const grant of relationship.grants) appliedGrants.add(grant);
  }

  return buildScope({
    c360,
    account,
    authenticatedPartyId: self.id,
    activeContext: { type: 'PERSON', id: self.id, label: self.name },
    subjects,
    viaDelegation: delegations.length > 0,
    authorityBasis:
      delegations.length > 0
        ? `Titular de sus propios datos. Autorizaciones adicionales: ${delegations.join('; ')}`
        : 'Titular de sus propios datos',
    appliedGrants: [...appliedGrants],
  });
}

interface BuildScopeInput {
  c360: SyntheticCustomer360;
  account: { id: string };
  authenticatedPartyId: string;
  activeContext: ActiveContext;
  subjects: { partyId: string; grants: RelationshipGrant[] }[];
  viaDelegation: boolean;
  authorityBasis: string;
  appliedGrants: readonly string[];
}

/**
 * Expands subjects and their grants into a concrete id allow-list.
 * Each grant maps to exactly one resource family; a subject without
 * `VIEW_CLAIMS` contributes no claim ids at all, not merely hidden ones.
 */
function buildScope(input: BuildScopeInput): AuthorisedScope {
  const { c360 } = input;
  const partyIds: string[] = [];
  const policyIds: string[] = [];
  const claimIds: string[] = [];
  const documentIds: string[] = [];
  const receiptGrantedPolicyIds: string[] = [];

  for (const subject of input.subjects) {
    partyIds.push(subject.partyId);
    const grants = new Set(subject.grants);
    const subjectPolicyIds = c360.policyIdsForParty(subject.partyId);

    if (grants.has('VIEW_POLICIES')) policyIds.push(...subjectPolicyIds);
    if (grants.has('VIEW_CLAIMS')) claimIds.push(...c360.claimIdsForParty(subject.partyId));
    if (grants.has('VIEW_DOCUMENTS')) documentIds.push(...c360.documentIdsForParty(subject.partyId));
    if (grants.has('VIEW_RECEIPTS')) receiptGrantedPolicyIds.push(...subjectPolicyIds);
  }

  const receiptIds = c360.receiptIdsForPolicies(receiptGrantedPolicyIds);

  return {
    accountId: input.account.id,
    authenticatedPartyId: input.authenticatedPartyId,
    activeContext: input.activeContext,
    partyIds: unique(partyIds),
    policyIds: unique(policyIds),
    claimIds: unique(claimIds),
    documentIds: unique(documentIds),
    receiptIds: unique(receiptIds),
    viaDelegation: input.viaDelegation,
    authorityBasis: input.authorityBasis,
    appliedGrants: input.appliedGrants,
    // Special-category records stay with the party that owns them: they are in scope
    // only when the authenticated party is the subject, never through delegation.
    includesSpecialCategory: input.subjects.some(
      (s) => s.partyId === input.authenticatedPartyId && c360.hasSpecialCategoryFor([s.partyId]),
    ),
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
