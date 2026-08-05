import { z } from 'zod';

/**
 * AI run metadata (blueprint §10.5, §21 Milestone A).
 *
 * Every model call is reproducible from this record: which provider and model ran,
 * which prompt versions were in force, what the policy layer decided, and what it
 * cost. Note what is deliberately absent — the prompt content, the raw completion
 * and any chain-of-thought (ADR-0009).
 */

export const POLICY_VERDICTS = ['ALLOWED', 'CONSTRAINED', 'REJECTED'] as const;
export type PolicyVerdict = (typeof POLICY_VERDICTS)[number];

export const aiRunSchema = z.object({
  runId: z.string().min(1).max(200),
  traceId: z.string().min(1).max(200),
  startedAt: z.string(),
  provider: z.string().max(100),
  model: z.string().max(200),
  /** Prompt name → version, e.g. { INTENT_CLASSIFIER: "v1" }. */
  promptVersions: z.record(z.string(), z.string().max(50)),
  stage: z.string().max(100),
  /** Hash of the structured input, so a run can be tied to its inputs without storing them. */
  inputHash: z.string().max(128),
  outputHash: z.string().max(128).nullable().default(null),
  policyVerdict: z.enum(POLICY_VERDICTS),
  /** Which server-side rule constrained or rejected the output, when one did. */
  policyReason: z.string().max(300).nullable().default(null),
  schemaValid: z.boolean(),
  /** How many controlled repair retries were needed (0 or 1; more is a failure). */
  repairs: z.number().int().min(0).max(2),
  latencyMs: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative().nullable().default(null),
  outputTokens: z.number().int().nonnegative().nullable().default(null),
  errorCode: z.string().max(100).nullable().default(null),
});
export type AIRun = z.infer<typeof aiRunSchema>;

export const AI_RUN_ERROR_CODES = [
  'SCHEMA_VALIDATION_FAILED',
  'PROVIDER_ERROR',
  'PROVIDER_TIMEOUT',
  'PROVIDER_UNAVAILABLE',
] as const;
export type AIRunErrorCode = (typeof AI_RUN_ERROR_CODES)[number];
