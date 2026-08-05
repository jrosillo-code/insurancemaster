import { z } from 'zod';

/**
 * Approved intent taxonomy (blueprint Appendix A).
 *
 * The classifier may only return one of these. An intent the platform cannot yet
 * serve safely is not an error — it routes to a human. `UNKNOWN` is a legitimate,
 * expected outcome, not a failure to be optimised away.
 */
export const INTENTS = [
  'PORTFOLIO_OVERVIEW',
  'POLICY_FACT',
  'COVERAGE_EXPLANATION',
  'DOCUMENT_REQUEST',
  'CLAIM_START',
  'CLAIM_STATUS',
  'POLICY_CHANGE',
  'CANCELLATION_REQUEST',
  'QUOTE_REQUEST',
  'RENEWAL_REVIEW',
  'LIFE_EVENT',
  'PAYMENT_QUESTION',
  'HUMAN_REQUEST',
  'EMERGENCY',
  'OUT_OF_SCOPE',
  'UNKNOWN',
] as const;
export type Intent = (typeof INTENTS)[number];
export const intentSchema = z.enum(INTENTS);

export const INTENT_LABELS: Record<Intent, string> = {
  PORTFOLIO_OVERVIEW: '¿Qué seguros tengo?',
  POLICY_FACT: 'Prima, franquicia, aseguradora, renovación, recibo o estado',
  COVERAGE_EXPLANATION: '¿Mi póliza parece cubrir este supuesto?',
  DOCUMENT_REQUEST: 'Condiciones, certificado, recibo o duplicado',
  CLAIM_START: 'Nuevo siniestro o accidente',
  CLAIM_STATUS: 'Estado de un siniestro abierto',
  POLICY_CHANGE: 'Cambio de dirección, vehículo, conductor, bien o beneficiarios',
  CANCELLATION_REQUEST: 'Baja de póliza o venta del bien asegurado',
  QUOTE_REQUEST: 'Nuevo riesgo o producto',
  RENEWAL_REVIEW: 'Subida de prima o petición de alternativa',
  LIFE_EVENT: 'Mudanza, matrimonio, hijo, viaje, compra o cambio de negocio',
  PAYMENT_QUESTION: 'Recibo, fecha de cargo o devolución',
  HUMAN_REQUEST: 'Hablar con un asesor o especialista',
  EMERGENCY: 'Lesión, asistencia urgente o pérdida grave',
  OUT_OF_SCOPE: 'Asesoramiento legal, fiscal, de inversión o no soportado',
  UNKNOWN: 'No se puede clasificar con seguridad',
};

/**
 * The five intents the Concierge MVP answers directly (blueprint §21 Milestone C).
 * Everything else is classified correctly and then routed to a human — the platform
 * never widens its own scope by guessing.
 */
export const MVP_DIRECT_INTENTS = [
  'PORTFOLIO_OVERVIEW',
  'POLICY_FACT',
  'COVERAGE_EXPLANATION',
  'DOCUMENT_REQUEST',
  'HUMAN_REQUEST',
] as const satisfies readonly Intent[];
export type MvpDirectIntent = (typeof MVP_DIRECT_INTENTS)[number];

export function isMvpDirectIntent(intent: Intent): intent is MvpDirectIntent {
  return (MVP_DIRECT_INTENTS as readonly Intent[]).includes(intent);
}

/**
 * Intents that must always produce a human task rather than a direct answer,
 * because acting on them touches an operational or regulated boundary.
 */
export const HUMAN_ROUTED_INTENTS: readonly Intent[] = [
  'CLAIM_START',
  'POLICY_CHANGE',
  'CANCELLATION_REQUEST',
  'QUOTE_REQUEST',
  'RENEWAL_REVIEW',
  'LIFE_EVENT',
  'HUMAN_REQUEST',
];

/** Intents where safety guidance precedes everything else (blueprint §5.3). */
export const SAFETY_FIRST_INTENTS: readonly Intent[] = ['EMERGENCY'];

export const LIFE_EVENT_TYPES = [
  'MOVE_HOME',
  'BUY_VEHICLE',
  'SELL_VEHICLE',
  'BUY_PROPERTY',
  'MARRIAGE',
  'NEW_CHILD',
  'FAMILY_ABROAD',
  'TRAVEL',
  'NEW_VALUABLE',
  'BUSINESS_EXPANSION',
  'NEW_EMPLOYEES',
  'RETIREMENT',
  'OTHER',
] as const;
export type LifeEventType = (typeof LIFE_EVENT_TYPES)[number];
export const lifeEventTypeSchema = z.enum(LIFE_EVENT_TYPES);
