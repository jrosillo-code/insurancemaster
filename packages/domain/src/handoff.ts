import { z } from 'zod';
import { evidenceBackedFieldSchema, evidenceReferenceSchema } from './evidence';
import { intentSchema } from './intents';
import { actionCodeSchema } from './actionCatalogue';

/**
 * The client→employee handoff contract (blueprint §7.6, §21 Milestone E).
 *
 * A handoff is never a raw transcript dump. The employee receives structured,
 * source-linked work: what was asked, who asked it and under what authority, which
 * policies are involved, which facts are verified versus merely stated by the client,
 * what is missing, and what is being proposed. Every field opens its source.
 */

export const TASK_STATES = [
  'OPEN',
  'IN_REVIEW',
  'APPROVED',
  'EDITED_AND_APPROVED',
  'REJECTED',
  'ESCALATED',
  'CLOSED',
] as const;
export type TaskState = (typeof TASK_STATES)[number];
export const taskStateSchema = z.enum(TASK_STATES);

/** Legal transitions. Anything else is refused by the state machine, not just hidden in the UI. */
export const TASK_TRANSITIONS: Record<TaskState, readonly TaskState[]> = {
  OPEN: ['IN_REVIEW', 'ESCALATED'],
  IN_REVIEW: ['APPROVED', 'EDITED_AND_APPROVED', 'REJECTED', 'ESCALATED'],
  APPROVED: ['CLOSED'],
  EDITED_AND_APPROVED: ['CLOSED'],
  REJECTED: ['CLOSED'],
  ESCALATED: ['IN_REVIEW', 'APPROVED', 'EDITED_AND_APPROVED', 'REJECTED', 'CLOSED'],
  CLOSED: [],
};

export function canTransition(from: TaskState, to: TaskState): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

/** Terminal states, used to decide whether a client-visible status is still moving. */
export function isTerminalState(state: TaskState): boolean {
  return TASK_TRANSITIONS[state].length === 0;
}

export const RISK_FLAGS = [
  'POSSIBLE_INJURY',
  'THIRD_PARTY_INVOLVED',
  'HIGH_VALUE',
  'CONFLICTING_EVIDENCE',
  'STALE_EVIDENCE',
  'DELEGATED_AUTHORITY',
  'SPECIAL_CATEGORY_DATA',
  'PROHIBITED_ACTION_REQUESTED',
  'POSSIBLE_PROMPT_INJECTION',
  'IDENTITY_AMBIGUITY',
  'REGULATED_ADVICE_REQUESTED',
] as const;
export type RiskFlag = (typeof RISK_FLAGS)[number];
export const riskFlagSchema = z.enum(RISK_FLAGS);

export const RISK_FLAG_LABELS: Record<RiskFlag, string> = {
  POSSIBLE_INJURY: 'Posibles daños personales',
  THIRD_PARTY_INVOLVED: 'Hay un tercero implicado',
  HIGH_VALUE: 'Importe o bien de valor elevado',
  CONFLICTING_EVIDENCE: 'Fuentes contradictorias',
  STALE_EVIDENCE: 'Documentación posiblemente desactualizada',
  DELEGATED_AUTHORITY: 'Actúa mediante autorización delegada',
  SPECIAL_CATEGORY_DATA: 'Puede contener datos de categoría especial',
  PROHIBITED_ACTION_REQUESTED: 'Se ha solicitado una acción no permitida',
  POSSIBLE_PROMPT_INJECTION: 'Contenido con instrucciones sospechosas',
  IDENTITY_AMBIGUITY: 'Identidad o contexto activo ambiguo',
  REGULATED_ADVICE_REQUESTED: 'Se ha solicitado asesoramiento regulado',
};

export const missingItemSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().max(300),
  severity: z.enum(['REQUIRED', 'RECOMMENDED']),
  /** Which deterministic rule produced this verdict — never the model. */
  ruleId: z.string().max(100),
});
export type MissingItem = z.infer<typeof missingItemSchema>;

/**
 * Something the client asserted. Held separately from verified facts on purpose:
 * a client statement is an input to be checked, not a record to be trusted
 * (blueprint §12.5).
 */
export const clientStatementSchema = z.object({
  text: z.string().max(1000),
  statedAt: z.string(),
  /** Always false at creation. Only an employee can promote a statement to verified. */
  verified: z.literal(false),
});
export type ClientStatement = z.infer<typeof clientStatementSchema>;

export const handoffTaskSchema = z.object({
  taskId: z.string().min(1).max(200),
  createdAt: z.string(),
  clientId: z.string().min(1).max(200),
  organisationId: z.string().max(200).nullable().default(null),
  conversationId: z.string().min(1).max(200),
  intent: intentSchema,
  actionCode: actionCodeSchema,
  /** The client's exact request, verbatim and unedited. */
  clientRequest: z.string().min(1).max(2000),
  requestedOutcome: z.string().max(500),
  /** Facts the platform verified against a system of record, each with provenance. */
  verifiedFacts: z.record(z.string(), evidenceBackedFieldSchema).default({}),
  /** What the client said. Visually and structurally distinct from verifiedFacts. */
  clientStatements: z.array(clientStatementSchema).max(20).default([]),
  missingInformation: z.array(missingItemSchema).max(20).default([]),
  relevantPolicyIds: z.array(z.string().max(200)).max(20).default([]),
  evidence: z.array(evidenceReferenceSchema).max(20).default([]),
  riskFlags: z.array(riskFlagSchema).max(10).default([]),
  preferredChannel: z.enum(['chat', 'phone', 'email']).default('chat'),
  employeeQueue: z.string().min(1).max(100),
  dueAt: z.string().nullable().default(null),
  conversationSummary: z.string().max(2000),
  /** How the authenticated user is entitled to act for this client. */
  authorityBasis: z.string().max(300),
  state: taskStateSchema.default('OPEN'),
  /** Hard invariant — a task can never send or execute anything outside Rosillo. */
  externalActionAllowed: z.literal(false),
});
export type HandoffTask = z.infer<typeof handoffTaskSchema>;

/** Which internal queue an action lands in. Queues are internal routing only. */
export const ACTION_QUEUES: Record<string, string> = {
  VIEW_RECORD: 'atencion-cliente',
  DOWNLOAD_DOCUMENT: 'atencion-cliente',
  CREATE_ADVISER_TASK: 'atencion-cliente',
  REQUEST_INFORMATION: 'atencion-cliente',
  UPLOAD_DOCUMENT: 'atencion-cliente',
  PREPARE_CLAIM_INTAKE: 'siniestros',
  PREPARE_AMENDMENT: 'suplementos',
  PREPARE_CANCELLATION: 'suplementos',
  PREPARE_RENEWAL_REVIEW: 'comercial',
};

export function queueForAction(code: string): string {
  return ACTION_QUEUES[code] ?? 'atencion-cliente';
}

/** The employee decision recorded against a task. */
export const employeeDecisionSchema = z.object({
  taskId: z.string().min(1).max(200),
  employeeId: z.string().min(1).max(200),
  decidedAt: z.string(),
  decision: z.enum(['APPROVE', 'APPROVE_WITH_EDITS', 'REJECT', 'ESCALATE']),
  /** Field-level corrections. Recorded as a new version; never overwrite history. */
  edits: z.record(z.string(), z.string().max(1000)).default({}),
  note: z.string().max(2000).default(''),
  /** Required when closing a task that still has REQUIRED missing information. */
  overrideReason: z.string().max(500).default(''),
  /** What the client is told after this decision. */
  clientVisibleStatus: z.string().max(600),
});
export type EmployeeDecision = z.infer<typeof employeeDecisionSchema>;

/** Client-facing status text per task state — never implies execution (blueprint §13.2). */
export const CLIENT_VISIBLE_STATUS: Record<TaskState, string> = {
  OPEN: 'Tu consulta está en la cola de un asesor de Rosillo.',
  IN_REVIEW: 'Un asesor de Rosillo está revisando tu consulta.',
  APPROVED: 'Un asesor ha revisado tu consulta y la ha aceptado para tramitar.',
  EDITED_AND_APPROVED: 'Un asesor ha revisado y corregido los datos, y la ha aceptado para tramitar.',
  REJECTED: 'Un asesor ha revisado tu consulta y necesita comentarla contigo.',
  ESCALATED: 'Tu consulta se ha derivado a un especialista de Rosillo.',
  CLOSED: 'Tu consulta se ha cerrado.',
};
