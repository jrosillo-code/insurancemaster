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

/** Extracts candidate matching terms. Deterministic, and never sent to a model. */
export function extractTerms(message: string): string[] {
  const words = normalise(message)
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
  return [...new Set(words)].slice(0, 12);
}

export function planRetrieval(intent: Intent, message: string, maxPerSource = 20): RetrievalPlan {
  const entry = PLANS[intent];
  return {
    intent,
    sources: entry.sources,
    maxPerSource,
    includeSuperseded: entry.includeSuperseded ?? false,
    terms: extractTerms(message),
  };
}
