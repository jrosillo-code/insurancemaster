import type { Intent } from '@rosillo/domain';
import { normalise } from '@rosillo/domain';

/**
 * Retrieval planning (blueprint §9.3 steps 3–4, §10.2 stage 4).
 *
 * The plan is derived from the classified intent by this table — not chosen by the
 * model. That is deliberate: an intent classifier that is wrong produces the wrong
 * *plan*, which is recoverable and visible in the audit trail. A model that can name
 * its own data sources produces an open-ended read, which is neither.
 */

export const RETRIEVAL_SOURCES = [
  'POLICIES',
  'COVERAGE_TERMS',
  'CLAIMS',
  'RECEIPTS',
  'DOCUMENTS',
  'INSURED_OBJECTS',
  'PROCEDURES',
] as const;
export type RetrievalSource = (typeof RETRIEVAL_SOURCES)[number];

export interface RetrievalPlan {
  intent: Intent;
  sources: readonly RetrievalSource[];
  /** Maximum records fetched per source — context minimisation (blueprint §12.5). */
  maxPerSource: number;
  /** Whether superseded documents are fetched so conflicts can be surfaced. */
  includeSuperseded: boolean;
  /** Free-text terms extracted deterministically from the message, used for matching. */
  terms: string[];
}

const PLANS: Record<Intent, { sources: readonly RetrievalSource[]; includeSuperseded?: boolean }> = {
  PORTFOLIO_OVERVIEW: { sources: ['POLICIES', 'INSURED_OBJECTS', 'CLAIMS', 'RECEIPTS'] },
  POLICY_FACT: { sources: ['POLICIES', 'COVERAGE_TERMS', 'RECEIPTS', 'INSURED_OBJECTS'], includeSuperseded: true },
  COVERAGE_EXPLANATION: {
    sources: ['POLICIES', 'COVERAGE_TERMS', 'DOCUMENTS', 'PROCEDURES'],
    includeSuperseded: true,
  },
  DOCUMENT_REQUEST: { sources: ['DOCUMENTS', 'POLICIES', 'PROCEDURES'] },
  CLAIM_START: { sources: ['POLICIES', 'INSURED_OBJECTS', 'PROCEDURES'] },
  CLAIM_STATUS: { sources: ['CLAIMS', 'POLICIES', 'DOCUMENTS'] },
  POLICY_CHANGE: { sources: ['POLICIES', 'INSURED_OBJECTS', 'PROCEDURES'] },
  CANCELLATION_REQUEST: { sources: ['POLICIES', 'PROCEDURES'] },
  QUOTE_REQUEST: { sources: ['POLICIES', 'PROCEDURES'] },
  RENEWAL_REVIEW: { sources: ['POLICIES', 'RECEIPTS', 'PROCEDURES'] },
  LIFE_EVENT: { sources: ['POLICIES', 'INSURED_OBJECTS', 'PROCEDURES'] },
  PAYMENT_QUESTION: { sources: ['RECEIPTS', 'POLICIES', 'PROCEDURES'] },
  HUMAN_REQUEST: { sources: ['POLICIES', 'PROCEDURES'] },
  EMERGENCY: { sources: ['PROCEDURES', 'POLICIES'] },
  // Nothing client-specific is retrieved for an out-of-scope question.
  OUT_OF_SCOPE: { sources: [] },
  UNKNOWN: { sources: ['POLICIES', 'PROCEDURES'] },
};

/** Words too common to discriminate between records. */
const STOP_WORDS = new Set([
  'para', 'como', 'cuando', 'donde', 'porque', 'sobre', 'esta', 'este', 'esto', 'tengo',
  'tiene', 'puedo', 'quiero', 'estoy', 'seguro', 'seguros', 'poliza', 'polizas', 'rosillo',
  'hola', 'gracias', 'favor', 'necesito', 'saber', 'decir', 'hacer', 'with', 'what', 'have',
  'that', 'this', 'from', 'about', 'would', 'could', 'please', 'thanks',
]);

/** Ceiling on a plan's terms, whether they came from this message or the thread. */
const MAX_TERMS = 12;

/** Extracts candidate matching terms. Deterministic, and never sent to a model. */
export function extractTerms(message: string): string[] {
  const words = normalise(message)
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
  return [...new Set(words)].slice(0, MAX_TERMS);
}

export interface PlanOptions {
  maxPerSource?: number;
  /**
   * Earlier client turns in the same conversation, oldest first.
   *
   * A real conversation does not repeat its subject. "¿Y la del coche?" after two
   * turns about the home policy is a complete question to a person and an empty one
   * to a term extractor, so the thread's earlier words are carried forward — after
   * the current message's, never displacing them.
   *
   * This cannot widen what is readable. Retrieval runs inside an `AuthorisedScope`
   * computed before any of this, so terms only reorder and match within records the
   * client may already see. The worst a hostile term can do is fail to match.
   */
  priorClientTurns?: readonly string[];
}

export function planRetrieval(
  intent: Intent,
  message: string,
  options: PlanOptions | number = {},
): RetrievalPlan {
  // The third argument used to be `maxPerSource`. Accepted still, so a caller that
  // passes a number keeps working rather than silently planning with the default.
  const settings: PlanOptions = typeof options === 'number' ? { maxPerSource: options } : options;
  const entry = PLANS[intent];
  const current = extractTerms(message);

  // Only as many carried terms as the current message left room for, and only from
  // the last few turns — a long conversation must not end up retrieving on the union
  // of everything ever said in it.
  const carried = extractTerms((settings.priorClientTurns ?? []).slice(-3).join(' '));
  const terms = [...current];
  for (const term of carried) {
    if (terms.length >= MAX_TERMS) break;
    if (!terms.includes(term)) terms.push(term);
  }

  return {
    intent,
    sources: entry.sources,
    maxPerSource: settings.maxPerSource ?? 20,
    includeSuperseded: entry.includeSuperseded ?? false,
    terms,
  };
}
