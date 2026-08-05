import type { AnswerType, ContextType, Intent } from '@rosillo/domain';

/**
 * The labelled evaluation contract (blueprint §16, §21 EVALUATION).
 *
 * A case is a claim about how the platform *should* behave, written by a person, and
 * the runner's job is to disagree with it loudly when it does not. Labels describe
 * observable properties — what was said, what was cited, what was refused — never the
 * model's internal reasoning, which the platform deliberately does not store (ADR-0009).
 */

export const EVAL_CATEGORIES = [
  'DIRECT_POLICY_FACT',
  'MULTI_POLICY_AMBIGUITY',
  'EFFECTIVE_DATE_CONFLICT',
  'MISSING_DOCUMENT',
  'PROMPT_INJECTION',
  'FALSE_POLICY_ID',
  'OTHER_CLIENT_DATA',
  'HUMAN_TASK_REQUIRED',
  'BROAD_UNCERTAIN',
  'ENGLISH',
] as const;
export type EvalCategory = (typeof EVAL_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<EvalCategory, string> = {
  DIRECT_POLICY_FACT: 'Direct policy facts',
  MULTI_POLICY_AMBIGUITY: 'Multi-policy ambiguity',
  EFFECTIVE_DATE_CONFLICT: 'Effective-date conflicts',
  MISSING_DOCUMENT: 'Missing documents',
  PROMPT_INJECTION: 'Hostile prompt injection',
  FALSE_POLICY_ID: 'False policy identifiers',
  OTHER_CLIENT_DATA: "Another client's data",
  HUMAN_TASK_REQUIRED: 'Claims, cancellations and binding — must become human tasks',
  BROAD_UNCERTAIN: 'Broad questions where uncertainty is the correct answer',
  ENGLISH: 'English-language set',
};

export interface EvalAttachment {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface EvalCase {
  /** Stable id. Referenced by regression tests and by the report. */
  id: string;
  category: EvalCategory;
  language: 'es' | 'en';
  /** Who is asking. Authority follows from the account, never from the message. */
  accountId: string;
  context: { type: ContextType; id: string };
  message: string;
  attachments?: EvalAttachment[];

  /** The intent a trained Rosillo adviser would assign to this message. */
  expectedIntent: Intent;
  /**
   * Answer types a reviewer would accept. More than one can be right: a coverage
   * question answered as PRELIMINARY or as INSUFFICIENT are both defensible; a
   * coverage question answered as FACT is not.
   */
  acceptableAnswerTypes: AnswerType[];
  /** The answer asserts something material and therefore must cite tier A/B evidence. */
  expectEvidence: boolean;
  /** A person must end up holding this request. */
  expectHumanTask: boolean;
  /** The answer must say what it cannot confirm. */
  expectUncertainty?: boolean;

  /** Resource ids that must not appear anywhere in the response or its evidence. */
  forbiddenIds?: string[];
  /** Fragments the answer must contain — the fact the client actually asked for. */
  mustMention?: string[];
  /** Fragments the answer must never contain. */
  mustNotMention?: string[];
  /** Action codes that must be proposed. */
  expectedActionCodes?: string[];

  /** The message tries to steer the system rather than ask it something. */
  hostile?: boolean;
  /** Why this case exists, in one line. Printed next to failures. */
  notes: string;
}

export const VERDICTS = ['PASS', 'FAIL', 'ERROR'] as const;
export type Verdict = (typeof VERDICTS)[number];

export interface EvalCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface EvalOutcome {
  caseId: string;
  category: EvalCategory;
  language: 'es' | 'en';
  verdict: Verdict;
  checks: EvalCheck[];
  /** null when the pipeline refused the request before producing a response. */
  observedIntent: Intent | null;
  observedAnswerType: AnswerType | null;
  evidenceCount: number;
  materialEvidenceCount: number;
  proposedActionCodes: string[];
  blockedActionCodes: string[];
  taskCreated: boolean;
  schemaValid: boolean;
  repairs: number;
  failSafe: boolean;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  errorCode: string | null;
  traceId: string;
}

export interface CategoryScore {
  category: EvalCategory;
  total: number;
  passed: number;
}

export interface EvalMetrics {
  cases: number;
  passed: number;
  failed: number;
  errored: number;

  /** Share of cases where the classifier agreed with the human label. */
  intentAccuracy: number;
  /** Share of runs whose provider output validated against the contract. */
  schemaValidity: number;
  /** Share of material answers carrying at least one tier A/B citation. */
  evidenceCoverage: number;
  /** Share of material answers with no tier A/B citation. Must be zero. */
  unsupportedMaterialStatementRate: number;
  /** Share of cases labelled "uncertainty is correct" that answered accordingly. */
  correctInsufficiencyRate: number;
  /** Share of cases requiring a person that produced one. */
  correctEscalationRate: number;
  /** Number of responses exposing a resource outside the caller's scope. Must be zero. */
  crossClientLeakage: number;
  /** Share of cases whose proposed actions were all within the approved catalogue. */
  prohibitedActionCompliance: number;
  /** Number of prohibited or out-of-intent action attempts the platform blocked. */
  blockedActionAttempts: number;
  /** Share of runs that needed a controlled repair of provider output. */
  repairRate: number;
  /** Share of refusals that returned the safe client message rather than an error. */
  failSafeRate: number;

  latencyMsP50: number;
  latencyMsP95: number;
  latencyMsMax: number;

  /** Populated only when a live provider is explicitly enabled. */
  inputTokens: number | null;
  outputTokens: number | null;
  approximateCostUsd: number | null;

  byCategory: CategoryScore[];
}

export interface EvalReport {
  generatedAt: string;
  provider: string;
  model: string;
  promptVersions: Record<string, string>;
  datasetSummary: Record<string, number>;
  metrics: EvalMetrics;
  outcomes: EvalOutcome[];
  gateFailures: string[];
}
