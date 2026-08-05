/**
 * Authorised scope (blueprint §9.3 step 2, §12.3).
 *
 * The scope is computed once per request from the authenticated session and the
 * recorded relationships, then every retrieval is filtered through it. It is an
 * allow-list of concrete ids, not a predicate — which is what makes cross-client
 * leakage a structural impossibility rather than a query-authoring discipline.
 *
 * A shared surname, a shared household or a shared company confers nothing here;
 * only an explicit grant does.
 */

export type ContextType = 'PERSON' | 'ORGANISATION';

export interface ActiveContext {
  type: ContextType;
  /** Party id of the person or organisation the session is currently acting as. */
  id: string;
  label: string;
}

export interface AuthorisedScope {
  /** The authenticated account. */
  accountId: string;
  /** The party the account belongs to. Never widened by delegation. */
  authenticatedPartyId: string;
  activeContext: ActiveContext;
  /** Every party whose data is in scope, including the authenticated party. */
  partyIds: readonly string[];
  policyIds: readonly string[];
  claimIds: readonly string[];
  documentIds: readonly string[];
  receiptIds: readonly string[];
  /** True when the session is acting through delegated authority rather than its own. */
  viaDelegation: boolean;
  /** Human-readable authority basis, surfaced on every handoff to an employee. */
  authorityBasis: string;
  /** Grants that were applied, for audit. */
  appliedGrants: readonly string[];
  /** Whether special-category records (e.g. health claims) are in scope. */
  includesSpecialCategory: boolean;
}

/** An empty scope. Denies everything — the safe default when authority cannot be established. */
export function emptyScope(accountId: string, partyId: string, label = 'Sin contexto'): AuthorisedScope {
  return {
    accountId,
    authenticatedPartyId: partyId,
    activeContext: { type: 'PERSON', id: partyId, label },
    partyIds: [],
    policyIds: [],
    claimIds: [],
    documentIds: [],
    receiptIds: [],
    viaDelegation: false,
    authorityBasis: 'Sin autorización establecida',
    appliedGrants: [],
    includesSpecialCategory: false,
  };
}

export function scopeAllowsPolicy(scope: AuthorisedScope, policyId: string): boolean {
  return scope.policyIds.includes(policyId);
}

export function scopeAllowsClaim(scope: AuthorisedScope, claimId: string): boolean {
  return scope.claimIds.includes(claimId);
}

export function scopeAllowsDocument(scope: AuthorisedScope, documentId: string): boolean {
  return scope.documentIds.includes(documentId);
}

export function scopeAllowsReceipt(scope: AuthorisedScope, receiptId: string): boolean {
  return scope.receiptIds.includes(receiptId);
}

export function scopeAllowsParty(scope: AuthorisedScope, partyId: string): boolean {
  return scope.partyIds.includes(partyId);
}

/** Raised when a caller reaches for a resource outside its scope. Always audited. */
export class AuthorisationError extends Error {
  constructor(
    readonly resourceType: string,
    readonly resourceId: string,
  ) {
    super(`Access denied to ${resourceType} ${resourceId}`);
    this.name = 'AuthorisationError';
  }
}
