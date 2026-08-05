import { z } from 'zod';
import { evidenceReferenceSchema, freshnessSummarySchema } from './evidence';
import { proposedActionSchema } from './actionCatalogue';
import { intentSchema } from './intents';

/**
 * The structured response contract (blueprint §10.4, §5.3).
 *
 * Every client-facing answer is one of seven types, and the type determines what the
 * interface is allowed to render. This is what stops eloquence from outrunning
 * evidence: an answer with no citations cannot be typed `FACT`, so it cannot be
 * presented as one.
 */

export const ANSWER_TYPES = [
  'FACT',
  'EXPLANATION',
  'PROCEDURE',
  'PRELIMINARY',
  'INSUFFICIENT',
  'EMERGENCY',
  'OUT_OF_SCOPE',
] as const;
export type AnswerType = (typeof ANSWER_TYPES)[number];
export const answerTypeSchema = z.enum(ANSWER_TYPES);

/** Answer types that assert something material about the client's cover. */
export const MATERIAL_ANSWER_TYPES: readonly AnswerType[] = ['FACT', 'EXPLANATION', 'PRELIMINARY'];

export function isMaterialAnswer(type: AnswerType): boolean {
  return MATERIAL_ANSWER_TYPES.includes(type);
}

export const ANSWER_TYPE_PRESENTATION: Record<AnswerType, { label: string; requiresEvidence: boolean }> = {
  FACT: { label: 'Dato de tu póliza', requiresEvidence: true },
  EXPLANATION: { label: 'Explicación basada en tu documentación', requiresEvidence: true },
  PROCEDURE: { label: 'Procedimiento de Rosillo', requiresEvidence: true },
  PRELIMINARY: { label: 'Valoración preliminar — la confirma un asesor', requiresEvidence: true },
  INSUFFICIENT: { label: 'No puedo confirmarlo con la información disponible', requiresEvidence: false },
  EMERGENCY: { label: 'Prioridad: seguridad', requiresEvidence: false },
  OUT_OF_SCOPE: { label: 'Fuera del alcance de este servicio', requiresEvidence: false },
};

export const followUpQuestionSchema = z.object({
  id: z.string().min(1).max(100),
  text: z.string().min(1).max(300),
  /** Why the platform needs it — shown so a question never feels arbitrary. */
  reason: z.string().max(300).optional(),
});
export type FollowUpQuestion = z.infer<typeof followUpQuestionSchema>;

/**
 * What the model is permitted to return. Note what is absent: no ids of any kind.
 * The model drafts language and proposes a shape; every id in the final response is
 * substituted by orchestration from authorised deterministic services
 * (blueprint §21 Milestone D).
 */
export const conciergeDraftSchema = z.object({
  answerType: answerTypeSchema,
  clientMessage: z.string().min(1).max(4000),
  /** Indexes into the evidence candidates supplied to the model — never free-form ids. */
  citedEvidenceIndexes: z.array(z.number().int().nonnegative()).max(20).default([]),
  uncertainty: z.array(z.string().max(400)).max(10).default([]),
  followUpQuestions: z.array(followUpQuestionSchema).max(5).default([]),
  /** Action codes only; orchestration attaches labels, policy ids and approval flags. */
  proposedActionCodes: z.array(z.string().max(100)).max(5).default([]),
  safetyNotice: z.string().max(600).nullable().default(null),
});
export type ConciergeDraft = z.infer<typeof conciergeDraftSchema>;

/** The validated, policy-enforced answer that actually reaches the client. */
export const conciergeResponseSchema = z.object({
  responseId: z.string().min(1).max(200),
  conversationId: z.string().min(1).max(200),
  intent: intentSchema,
  answerType: answerTypeSchema,
  clientMessage: z.string().min(1).max(4000),
  evidence: z.array(evidenceReferenceSchema).max(20),
  uncertainty: z.array(z.string().max(400)).max(10),
  followUpQuestions: z.array(followUpQuestionSchema).max(5),
  proposedActions: z.array(proposedActionSchema).max(5),
  humanReviewRequired: z.boolean(),
  safetyNotice: z.string().max(600).nullable(),
  dataFreshness: freshnessSummarySchema,
  /**
   * A short operational note describing which rule produced this outcome.
   * Deliberately not chain-of-thought (ADR-0009) — it records what the system did,
   * not how the model reasoned.
   */
  operationalNote: z.string().max(500),
  traceId: z.string().min(1).max(200),
});
export type ConciergeResponse = z.infer<typeof conciergeResponseSchema>;

/** The standard Spanish safe answer when evidence is missing, stale or contradictory. */
export const INSUFFICIENT_EVIDENCE_MESSAGE =
  'No puedo confirmarlo con la documentación que tengo disponible en este momento. ' +
  'Prefiero no darte una respuesta que pueda no ajustarse a tu póliza: he preparado ' +
  'una consulta para que un asesor de Rosillo lo revise y te confirme.';

export const OUT_OF_SCOPE_MESSAGE =
  'Esto queda fuera de lo que puedo resolver aquí. Puedo ayudarte con tus pólizas, ' +
  'coberturas, recibos, documentos y siniestros, y puedo pasar tu consulta a la persona adecuada.';
