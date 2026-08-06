import { z } from 'zod';
import type { ConciergeDraft, Intent } from '@rosillo/domain';
import { intentSchema, lifeEventTypeSchema } from '@rosillo/domain';

/**
 * Provider-neutral AI interface (blueprint §10.1, ADR-0005).
 *
 * Provider abstraction is mandatory, and every provider is untrusted. The two calls
 * below are the *only* things a model does in this platform: it classifies an intent
 * from a fixed list, and it drafts language over evidence it was handed. It does not
 * choose data sources, resolve identities, decide permissions, or select record ids.
 *
 * Note that neither input carries a policy, claim or document id the model could
 * echo back as a citation — evidence is referenced by array index, and orchestration
 * substitutes the real ids afterwards.
 */

export const intentClassificationSchema = z.object({
  intent: intentSchema,
  confidence: z.number().min(0).max(1),
  /** At most two alternatives, used to detect ambiguity rather than to act. */
  secondaryIntents: z.array(intentSchema).max(2).default([]),
  lifeEventType: lifeEventTypeSchema.nullable().default(null),
  /** Short operational note. Never chain-of-thought (ADR-0009). */
  note: z.string().max(300).default(''),
});
export type IntentClassification = z.infer<typeof intentClassificationSchema>;

export interface ClassifyIntentInput {
  /** The client message, already wrapped as untrusted content. */
  wrappedMessage: string;
  allowedIntents: readonly Intent[];
  /** Prior turns, oldest first, already wrapped. Bounded by the caller. */
  wrappedHistory: string[];
  language: 'es' | 'en';
}

export interface EvidenceCandidateView {
  /** Stable index the model must use to cite this candidate. */
  index: number;
  label: string;
  /** Knowledge tier, so the drafter can respect what a source may support. */
  tier: 'A' | 'B' | 'C' | 'D' | 'E';
  content: string;
  stale: boolean;
  conflict: string | null;
  /**
   * True when the record belongs to somebody else and the client can see it through
   * a delegated authorisation. A reply must not present it as the client's own.
   */
  viaDelegation: boolean;
}

export interface DraftAnswerInput {
  intent: Intent;
  wrappedMessage: string;
  /**
   * Earlier turns, oldest first, already wrapped. Bounded by the caller.
   *
   * The drafter used to see only the current message, so every reply started the
   * conversation over: someone who asked "¿y el del coche?" after two turns about
   * their home policy got an answer that had never heard of the home policy. The
   * thread is what makes this a conversation rather than a series of unrelated
   * lookups.
   *
   * It changes what a reply may *refer back to*. It does not change what a reply may
   * *assert*: every material statement still needs a cited candidate from this turn's
   * retrieval, and something said two turns ago is not evidence for this one.
   */
  wrappedHistory: string[];
  language: 'es' | 'en';
  candidates: EvidenceCandidateView[];
  /** Deterministic verdict from the retrieval layer. The model may not overrule it. */
  evidenceInsufficient: boolean;
  insufficiencyReasons: string[];
  conflicts: string[];
  staleSources: string[];
  /** Action codes the policy layer would permit for this intent. */
  permittedActionCodes: readonly string[];
  /** True when the client is acting for an organisation. */
  organisationContext: boolean;
  contextLabel: string;
}

export interface ProviderHealth {
  ok: boolean;
  provider: string;
  model: string;
  detail?: string;
}

export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  requests: number;
}

export interface ConciergeAIProvider {
  readonly name: string;
  readonly model: string;
  readonly promptVersions: Record<string, string>;
  /** Returns unknown — the caller schema-validates. A provider is never trusted to be well-formed. */
  classifyIntent(input: ClassifyIntentInput): Promise<unknown>;
  draftAnswer(input: DraftAnswerInput): Promise<unknown>;
  healthCheck(): Promise<ProviderHealth>;
  getUsage?(): ProviderUsage;
}

export type { ConciergeDraft };
