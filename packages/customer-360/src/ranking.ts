import { normalise } from '@rosillo/domain';
import type { ApprovedProcedure, Claim, InsuredObject, Policy, PolicyDocument, Receipt } from './model';
import type { PortfolioSnapshot } from './port';

/**
 * Behaviour shared by every `Customer360Port` implementation.
 *
 * Procedure ranking and the portfolio's derived lists are decisions about *meaning*,
 * not about storage: "renewing soon" is the same sixty days whether the row came
 * from a fixture or from Postgres. Reimplementing them per adapter — once in
 * TypeScript and once in SQL — is how two implementations start answering the same
 * question differently, which is exactly what the conformance suite exists to catch.
 * Sharing them means there is nothing to catch.
 */

/** Days ahead of `asOf` that count as an upcoming renewal. */
export const RENEWAL_HORIZON_DAYS = 60;

/**
 * Ranks approved procedures against a topic.
 *
 * Procedures are tier C and there are a few dozen of them, so this runs over the
 * whole set in memory rather than as a query. A Postgres implementation loads them
 * and calls this, which keeps the ranking identical instead of approximately so.
 */
export function rankProcedures(procedures: readonly ApprovedProcedure[], topic: string): ApprovedProcedure[] {
  const query = normalise(topic);
  if (query.length === 0) return [];
  const words = query.split(/\s+/).filter((w) => w.length > 3);
  return procedures
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
    .map((entry) => structuredClone(entry.procedure));
}

export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/**
 * Assembles the snapshot's derived lists from records already read within scope.
 *
 * Every list here is a filter over its arguments, so the snapshot cannot contain
 * anything the scoped reads did not already return. That is deliberate: a snapshot
 * assembled by its own queries is a second place for a scope check to be forgotten.
 */
export function buildPortfolioSnapshot(input: {
  policies: Policy[];
  claims: Claim[];
  receipts: Receipt[];
  documents: PolicyDocument[];
  insuredObjects: InsuredObject[];
  asOf: string;
}): PortfolioSnapshot {
  const horizon = addDays(input.asOf, RENEWAL_HORIZON_DAYS);
  return {
    policies: input.policies,
    claims: input.claims,
    receipts: input.receipts,
    documents: input.documents,
    insuredObjects: input.insuredObjects,
    outstandingReceipts: input.receipts.filter((r) => r.status !== 'PAID'),
    upcomingRenewals: input.policies.filter(
      (p) => p.status !== 'CANCELLED' && p.renewalDate >= input.asOf && p.renewalDate <= horizon,
    ),
    openClaims: input.claims.filter(
      (c) => c.status !== 'CLOSED' && c.status !== 'SETTLED' && c.status !== 'REJECTED',
    ),
  };
}
