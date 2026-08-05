import type { AuthorisedScope } from '@rosillo/domain';
import { normalise } from '@rosillo/domain';
import type {
  ApprovedProcedure,
  Claim,
  ClientAccount,
  CoverageTerm,
  Customer360Dataset,
  InsuredObject,
  Party,
  Policy,
  PolicyDocument,
  Receipt,
  Relationship,
} from '../model';
import type { Customer360Port, DocumentFilter, PortfolioSnapshot } from '../port';
import { DATASET_TODAY } from './builders';
import { getSyntheticDataset } from './dataset';

/**
 * Synthetic Customer 360 adapter.
 *
 * Every scoped accessor filters against the caller's `AuthorisedScope` before it
 * returns anything. That filtering is the single choke point for client isolation:
 * there is no code path in this adapter that reads a record without consulting the
 * scope, and out-of-scope lookups return null rather than throwing so an attacker
 * cannot distinguish "does not exist" from "not yours".
 *
 * Results are defensively copied — a caller that mutates what it receives cannot
 * corrupt the shared dataset for the next request.
 */
export class SyntheticCustomer360 implements Customer360Port {
  constructor(private readonly data: Customer360Dataset = getSyntheticDataset()) {}

  // ── Identity (pre-scope; never returns portfolio data) ─────────────────────

  async getAccountByEmail(email: string): Promise<ClientAccount | null> {
    const normalised = email.trim().toLowerCase();
    return copy(this.data.accounts.find((a) => a.email.toLowerCase() === normalised) ?? null);
  }

  async getAccountById(accountId: string): Promise<ClientAccount | null> {
    return copy(this.data.accounts.find((a) => a.id === accountId) ?? null);
  }

  async getPartyById(partyId: string): Promise<Party | null> {
    return copy(this.data.parties.find((p) => p.id === partyId) ?? null);
  }

  async getRelationshipsForParty(partyId: string): Promise<Relationship[]> {
    return this.data.relationships.filter((r) => r.fromPartyId === partyId).map(clone);
  }

  // ── Scoped reads ───────────────────────────────────────────────────────────

  async listPolicies(scope: AuthorisedScope): Promise<Policy[]> {
    return this.data.policies.filter((p) => scope.policyIds.includes(p.id)).map(clone);
  }

  async getPolicy(scope: AuthorisedScope, policyId: string): Promise<Policy | null> {
    if (!scope.policyIds.includes(policyId)) return null;
    return copy(this.data.policies.find((p) => p.id === policyId) ?? null);
  }

  async listInsuredObjects(scope: AuthorisedScope, policyId: string): Promise<InsuredObject[]> {
    const policy = await this.getPolicy(scope, policyId);
    if (!policy) return [];
    return this.data.insuredObjects.filter((o) => policy.insuredObjectIds.includes(o.id)).map(clone);
  }

  async listCoverageTerms(scope: AuthorisedScope, policyId: string): Promise<CoverageTerm[]> {
    if (!scope.policyIds.includes(policyId)) return [];
    return this.data.coverageTerms.filter((t) => t.policyId === policyId).map(clone);
  }

  async listClaims(scope: AuthorisedScope): Promise<Claim[]> {
    return this.data.claims
      .filter((c) => scope.claimIds.includes(c.id))
      // Special-category records need an explicit grant, not merely a claim id in scope.
      .filter((c) => !c.specialCategory || scope.includesSpecialCategory)
      .map(clone);
  }

  async getClaim(scope: AuthorisedScope, claimId: string): Promise<Claim | null> {
    if (!scope.claimIds.includes(claimId)) return null;
    const found = this.data.claims.find((c) => c.id === claimId);
    if (!found) return null;
    if (found.specialCategory && !scope.includesSpecialCategory) return null;
    return copy(found);
  }

  async listReceipts(scope: AuthorisedScope, policyId?: string): Promise<Receipt[]> {
    return this.data.receipts
      .filter((r) => scope.receiptIds.includes(r.id))
      .filter((r) => (policyId ? r.policyId === policyId : true))
      .map(clone);
  }

  async listDocuments(scope: AuthorisedScope, filter: DocumentFilter = {}): Promise<PolicyDocument[]> {
    return this.data.documents
      .filter((d) => scope.documentIds.includes(d.id))
      .filter((d) => (filter.policyId ? d.policyId === filter.policyId : true))
      .filter((d) => (filter.claimId ? d.claimId === filter.claimId : true))
      .filter((d) => (filter.kind ? d.kind === filter.kind : true))
      .filter((d) => (filter.includeSuperseded ? true : d.supersededByDocumentId === null))
      .filter((d) => d.classification !== 'SPECIAL_CATEGORY' || scope.includesSpecialCategory)
      .map(clone);
  }

  async getDocument(scope: AuthorisedScope, documentId: string): Promise<PolicyDocument | null> {
    if (!scope.documentIds.includes(documentId)) return null;
    const found = this.data.documents.find((d) => d.id === documentId);
    if (!found) return null;
    if (found.classification === 'SPECIAL_CATEGORY' && !scope.includesSpecialCategory) return null;
    return copy(found);
  }

  async findProcedures(topic: string): Promise<ApprovedProcedure[]> {
    const query = normalise(topic);
    if (query.length === 0) return [];
    const words = query.split(/\s+/).filter((w) => w.length > 3);
    return this.data.procedures
      .map((procedure) => {
        const haystack = normalise([procedure.title, ...procedure.topics].join(' '));
        const score = procedure.topics.reduce(
          (sum, t) => sum + (query.includes(normalise(t)) ? 2 : 0),
          words.filter((w) => haystack.includes(w)).length,
        );
        return { procedure, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((entry) => clone(entry.procedure));
  }

  async getProcedure(procedureId: string): Promise<ApprovedProcedure | null> {
    return copy(this.data.procedures.find((p) => p.id === procedureId) ?? null);
  }

  async getPortfolioSnapshot(scope: AuthorisedScope): Promise<PortfolioSnapshot> {
    const policies = await this.listPolicies(scope);
    const claims = await this.listClaims(scope);
    const receipts = await this.listReceipts(scope);
    const documents = await this.listDocuments(scope);
    const policyIds = new Set(policies.map((p) => p.id));
    const insuredObjectIds = new Set(policies.flatMap((p) => p.insuredObjectIds));
    const insuredObjects = this.data.insuredObjects.filter((o) => insuredObjectIds.has(o.id)).map(clone);

    const renewalHorizon = addDays(DATASET_TODAY, 60);
    return {
      policies,
      claims,
      receipts,
      documents,
      insuredObjects,
      outstandingReceipts: receipts.filter((r) => r.status !== 'PAID'),
      upcomingRenewals: policies.filter(
        (p) => p.status !== 'CANCELLED' && p.renewalDate >= DATASET_TODAY && p.renewalDate <= renewalHorizon,
      ),
      openClaims: claims.filter(
        (c) => c.status !== 'CLOSED' && c.status !== 'SETTLED' && c.status !== 'REJECTED',
      ),
    };
  }

  /**
   * Unscoped access to the raw dataset. Exposed only for scope computation and
   * fixture-driven tests — never call it from a request path.
   */
  get raw(): Customer360Dataset {
    return this.data;
  }

  /** Policy ids held by a party, used by scope computation before a scope exists. */
  policyIdsForParty(partyId: string): string[] {
    return this.data.policies.filter((p) => p.holderPartyId === partyId).map((p) => p.id);
  }

  claimIdsForParty(partyId: string): string[] {
    return this.data.claims.filter((c) => c.holderPartyId === partyId).map((c) => c.id);
  }

  documentIdsForParty(partyId: string): string[] {
    return this.data.documents.filter((d) => d.ownerPartyId === partyId).map((d) => d.id);
  }

  receiptIdsForPolicies(policyIds: readonly string[]): string[] {
    const set = new Set(policyIds);
    return this.data.receipts.filter((r) => set.has(r.policyId)).map((r) => r.id);
  }

  hasSpecialCategoryFor(partyIds: readonly string[]): boolean {
    const set = new Set(partyIds);
    return this.data.claims.some((c) => c.specialCategory && set.has(c.holderPartyId));
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function copy<T>(value: T | null): T | null {
  return value === null ? null : structuredClone(value);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
