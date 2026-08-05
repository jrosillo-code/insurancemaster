import { z } from 'zod';
import type { Intent } from './intents';

/**
 * Server-side action catalogue (blueprint Appendix B, §5.6).
 *
 * This is the platform's hard boundary. The model proposes; this table decides.
 * An action that is not in `ALLOWED_ACTIONS` cannot be proposed, rendered or
 * executed — prohibited actions are absent from the interface, not merely
 * disabled by convention (blueprint §13.3).
 */

export const ALLOWED_ACTIONS = {
  VIEW_RECORD: {
    label: 'Consultar un registro autorizado',
    risk: 'LOW',
    /** Runs without a human in the loop, because it only reveals what the user may already see. */
    automation: 'AUTOMATIC',
    humanControl: 'Sin aprobación adicional',
  },
  DOWNLOAD_DOCUMENT: {
    label: 'Entregar un documento existente autorizado',
    risk: 'LOW',
    automation: 'AUTOMATIC',
    humanControl: 'Sin aprobación adicional',
  },
  CREATE_ADVISER_TASK: {
    label: 'Crear una tarea interna para un asesor',
    risk: 'LOW',
    automation: 'AUTOMATIC',
    humanControl: 'El asesor responde',
  },
  REQUEST_INFORMATION: {
    label: 'Pedir al cliente los datos que faltan',
    risk: 'LOW',
    automation: 'AUTOMATIC',
    humanControl: 'Campos aprobados únicamente',
  },
  UPLOAD_DOCUMENT: {
    label: 'Recibir y clasificar un archivo de forma segura',
    risk: 'MEDIUM',
    automation: 'COLLECT_AND_DRAFT',
    humanControl: 'Revisión humana antes de usarlo como prueba',
  },
  PREPARE_CLAIM_INTAKE: {
    label: 'Preparar el parte estructurado del siniestro para revisión',
    risk: 'MEDIUM',
    automation: 'COLLECT_AND_DRAFT',
    humanControl: 'El equipo de siniestros valida y presenta',
  },
  PREPARE_AMENDMENT: {
    label: 'Redactar la solicitud de modificación',
    risk: 'MEDIUM',
    automation: 'COLLECT_AND_DRAFT',
    humanControl: 'El empleado ejecuta',
  },
  PREPARE_CANCELLATION: {
    label: 'Recopilar requisitos y redactar la solicitud de baja',
    risk: 'HIGH',
    automation: 'COLLECT_AND_DRAFT',
    humanControl: 'El empleado verifica requisitos y ejecuta',
  },
  PREPARE_RENEWAL_REVIEW: {
    label: 'Crear una revisión de renovación con datos aprobados',
    risk: 'MEDIUM',
    automation: 'COLLECT_AND_DRAFT',
    humanControl: 'El equipo comercial decide la recomendación',
  },
} as const;

export type ActionCode = keyof typeof ALLOWED_ACTIONS;
export const ACTION_CODES = Object.keys(ALLOWED_ACTIONS) as ActionCode[];
export const actionCodeSchema = z.enum(ACTION_CODES as [ActionCode, ...ActionCode[]]);

/**
 * Actions the platform must never perform. These are not "disabled features" —
 * there is no code path that executes them, and any attempt is an audited
 * security event (blueprint §16.4 stop conditions).
 */
export const PROHIBITED_ACTIONS = {
  SEND_EXTERNAL_MESSAGE: 'Prohibido en el prototipo: envío externo al cliente o a la aseguradora',
  BIND_OR_ISSUE: 'Prohibido: contratación o emisión de póliza',
  EXECUTE_CANCELLATION: 'Prohibido: ejecución de la baja (solo se prepara)',
  EXECUTE_AMENDMENT: 'Prohibido: ejecución de la modificación (solo se prepara)',
  APPROVE_OR_DENY_CLAIM: 'Prohibido: aprobación o rechazo de un siniestro',
  PRICE_LIFE_OR_HEALTH_RISK: 'Prohibido / alto riesgo AI Act: tarificación de vida o salud',
  SWITCH_INSURER: 'Prohibido: cambio autónomo de aseguradora',
  MODIFY_SYSTEM_OF_RECORD: 'Prohibido: escritura en el sistema de registro',
} as const;
export type ProhibitedActionCode = keyof typeof PROHIBITED_ACTIONS;
export const PROHIBITED_ACTION_CODES = Object.keys(PROHIBITED_ACTIONS) as ProhibitedActionCode[];

export function isAllowedAction(code: string): code is ActionCode {
  return Object.prototype.hasOwnProperty.call(ALLOWED_ACTIONS, code);
}

export function isProhibitedAction(code: string): code is ProhibitedActionCode {
  return Object.prototype.hasOwnProperty.call(PROHIBITED_ACTIONS, code);
}

/**
 * Which actions are plausible for each intent. An action outside its intent's list
 * is dropped by the policy stage even when the code itself is in the catalogue —
 * a coverage question must not be able to propose a cancellation.
 */
export const INTENT_ACTIONS: Record<Intent, readonly ActionCode[]> = {
  PORTFOLIO_OVERVIEW: ['VIEW_RECORD', 'CREATE_ADVISER_TASK'],
  POLICY_FACT: ['VIEW_RECORD', 'DOWNLOAD_DOCUMENT', 'CREATE_ADVISER_TASK'],
  COVERAGE_EXPLANATION: ['VIEW_RECORD', 'CREATE_ADVISER_TASK', 'REQUEST_INFORMATION'],
  DOCUMENT_REQUEST: ['DOWNLOAD_DOCUMENT', 'CREATE_ADVISER_TASK'],
  CLAIM_START: ['PREPARE_CLAIM_INTAKE', 'REQUEST_INFORMATION', 'UPLOAD_DOCUMENT'],
  CLAIM_STATUS: ['VIEW_RECORD', 'CREATE_ADVISER_TASK'],
  POLICY_CHANGE: ['PREPARE_AMENDMENT', 'REQUEST_INFORMATION'],
  CANCELLATION_REQUEST: ['PREPARE_CANCELLATION', 'REQUEST_INFORMATION'],
  QUOTE_REQUEST: ['CREATE_ADVISER_TASK', 'REQUEST_INFORMATION'],
  RENEWAL_REVIEW: ['PREPARE_RENEWAL_REVIEW', 'VIEW_RECORD'],
  LIFE_EVENT: ['CREATE_ADVISER_TASK', 'REQUEST_INFORMATION'],
  PAYMENT_QUESTION: ['VIEW_RECORD', 'CREATE_ADVISER_TASK'],
  HUMAN_REQUEST: ['CREATE_ADVISER_TASK'],
  EMERGENCY: ['CREATE_ADVISER_TASK'],
  OUT_OF_SCOPE: [],
  UNKNOWN: ['CREATE_ADVISER_TASK'],
};

/** Actions that always require an employee to approve before anything leaves the platform. */
export function requiresHumanApproval(code: ActionCode): boolean {
  return ALLOWED_ACTIONS[code].automation === 'COLLECT_AND_DRAFT';
}

export const proposedActionSchema = z.object({
  code: actionCodeSchema,
  label: z.string().max(200),
  /** What the client is told will happen — shown before anything is created (§5.4). */
  description: z.string().max(500),
  /** Ids of the policies/claims this action concerns. Must come from authorised services. */
  relatedPolicyIds: z.array(z.string().max(200)).max(10).default([]),
  requiresHumanApproval: z.boolean(),
  /** Hard invariant. Nothing in this prototype may act outside Rosillo. */
  externalActionAllowed: z.literal(false),
});
export type ProposedAction = z.infer<typeof proposedActionSchema>;
