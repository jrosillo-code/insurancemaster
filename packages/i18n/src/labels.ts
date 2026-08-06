import type { EmployeeRole } from '@rosillo/auth';
import type { AnswerType, KnowledgeTier, Intent, RiskFlag, TaskState } from '@rosillo/domain';
import type { Locale } from './locale';

/**
 * Display labels for the domain's closed vocabularies.
 *
 * These live here rather than in `@rosillo/domain` because they are presentation, and
 * `@rosillo/domain` is the package that decides what is *true*. The Spanish strings
 * still exist there as the canonical single-language labels; the maps below supersede
 * them wherever a surface knows its locale, which is everywhere a person reads.
 *
 * Every map is `Record<Locale, Record<Key, string>>` keyed on the domain union, so
 * adding a member to `Intent` or `RiskFlag` fails to compile until both languages
 * have a label. A missing translation is a build error, never a blank in the
 * interface.
 */

export const ANSWER_TYPE_LABELS: Record<Locale, Record<AnswerType, string>> = {
  es: {
    FACT: 'Dato de tu póliza',
    EXPLANATION: 'Explicación basada en tu documentación',
    PROCEDURE: 'Procedimiento de Rosillo',
    PRELIMINARY: 'Valoración preliminar — la confirma un asesor',
    INSUFFICIENT: 'No puedo confirmarlo con la información disponible',
    EMERGENCY: 'Prioridad: seguridad',
    OUT_OF_SCOPE: 'Fuera del alcance de este servicio',
  },
  en: {
    FACT: 'A fact from your policy',
    EXPLANATION: 'Explanation based on your documents',
    PROCEDURE: "Rosillo's procedure",
    PRELIMINARY: 'Preliminary view — an adviser confirms it',
    INSUFFICIENT: 'I cannot confirm this from what I can see',
    EMERGENCY: 'Safety first',
    OUT_OF_SCOPE: 'Outside what this service covers',
  },
};

export const EVIDENCE_TIER_LABELS: Record<Locale, Record<KnowledgeTier, string>> = {
  es: {
    A: 'Tu ficha',
    B: 'Tu documentación',
    C: 'Procedimiento Rosillo',
    D: 'Interpretación',
    E: 'General',
  },
  en: {
    A: 'Your record',
    B: 'Your documents',
    C: 'Rosillo procedure',
    D: 'Interpretation',
    E: 'General',
  },
};

export const CLIENT_STATUS_LABELS: Record<Locale, Record<TaskState, string>> = {
  es: {
    OPEN: 'Tu consulta está en la cola de un asesor de Rosillo.',
    IN_REVIEW: 'Un asesor de Rosillo está revisando tu consulta.',
    APPROVED: 'Un asesor ha revisado tu consulta y la ha aceptado para tramitar.',
    EDITED_AND_APPROVED:
      'Un asesor ha revisado y corregido los datos, y la ha aceptado para tramitar.',
    REJECTED: 'Un asesor ha revisado tu consulta y necesita comentarla contigo.',
    ESCALATED: 'Tu consulta se ha derivado a un especialista de Rosillo.',
    CLOSED: 'Tu consulta se ha cerrado.',
  },
  en: {
    OPEN: 'Your request is in the queue for a Rosillo adviser.',
    IN_REVIEW: 'A Rosillo adviser is reviewing your request.',
    APPROVED: 'An adviser has reviewed your request and accepted it for processing.',
    EDITED_AND_APPROVED:
      'An adviser has reviewed and corrected the details, and accepted it for processing.',
    REJECTED: 'An adviser has reviewed your request and needs to talk it over with you.',
    ESCALATED: 'Your request has gone to a Rosillo specialist.',
    CLOSED: 'Your request has been closed.',
  },
};

export const INTENT_DISPLAY: Record<Locale, Record<Intent, string>> = {
  es: {
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
  },
  en: {
    PORTFOLIO_OVERVIEW: 'What insurance do I have?',
    POLICY_FACT: 'Premium, excess, insurer, renewal, receipt or status',
    COVERAGE_EXPLANATION: 'Does my policy appear to cover this?',
    DOCUMENT_REQUEST: 'Policy wording, certificate, receipt or duplicate',
    CLAIM_START: 'New claim or accident',
    CLAIM_STATUS: 'Status of an open claim',
    POLICY_CHANGE: 'Change of address, vehicle, driver, property or beneficiaries',
    CANCELLATION_REQUEST: 'Cancelling a policy, or selling the insured item',
    QUOTE_REQUEST: 'New risk or product',
    RENEWAL_REVIEW: 'Premium increase, or a request for alternatives',
    LIFE_EVENT: 'Moving, marriage, a child, travel, a purchase or a change of business',
    PAYMENT_QUESTION: 'Receipt, payment date or refund',
    HUMAN_REQUEST: 'Speak to an adviser or specialist',
    EMERGENCY: 'Injury, urgent assistance or serious loss',
    OUT_OF_SCOPE: 'Legal, tax or investment advice, or something unsupported',
    UNKNOWN: 'Cannot be classified with confidence',
  },
};

export const RISK_FLAG_DISPLAY: Record<Locale, Record<RiskFlag, string>> = {
  es: {
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
  },
  en: {
    POSSIBLE_INJURY: 'Possible personal injury',
    THIRD_PARTY_INVOLVED: 'A third party is involved',
    HIGH_VALUE: 'High-value amount or item',
    CONFLICTING_EVIDENCE: 'Sources contradict each other',
    STALE_EVIDENCE: 'Documents may be out of date',
    DELEGATED_AUTHORITY: 'Acting under delegated authority',
    SPECIAL_CATEGORY_DATA: 'May contain special-category data',
    PROHIBITED_ACTION_REQUESTED: 'A prohibited action was requested',
    POSSIBLE_PROMPT_INJECTION: 'Content carrying suspicious instructions',
    IDENTITY_AMBIGUITY: 'Identity or active context is ambiguous',
    REGULATED_ADVICE_REQUESTED: 'Regulated advice was requested',
  },
};

/** Task states as an employee sees them — short, unlike the client-facing sentences. */
export const TASK_STATE_DISPLAY: Record<Locale, Record<TaskState, string>> = {
  es: {
    OPEN: 'Abierta',
    IN_REVIEW: 'En revisión',
    APPROVED: 'Aprobada',
    EDITED_AND_APPROVED: 'Corregida y aprobada',
    REJECTED: 'Rechazada',
    ESCALATED: 'Escalada',
    CLOSED: 'Cerrada',
  },
  en: {
    OPEN: 'Open',
    IN_REVIEW: 'In review',
    APPROVED: 'Approved',
    EDITED_AND_APPROVED: 'Edited and approved',
    REJECTED: 'Rejected',
    ESCALATED: 'Escalated',
    CLOSED: 'Closed',
  },
};

/**
 * Employee roles, for the one place a person sees their own.
 *
 * The role was previously printed as its raw union member — `claims_specialist`, with
 * the underscore — in the toolbar beside somebody's name. That is a database value on
 * display, and it made the workspace look like an admin panel for the system rather
 * than a tool for the person using it.
 */
export const EMPLOYEE_ROLE_LABELS: Record<Locale, Record<EmployeeRole, string>> = {
  es: {
    operator: 'Operador',
    claims_specialist: 'Siniestros',
    supervisor: 'Supervisor',
    admin: 'Administración',
    dpo: 'Protección de datos',
  },
  en: {
    operator: 'Operator',
    claims_specialist: 'Claims',
    supervisor: 'Supervisor',
    admin: 'Administration',
    dpo: 'Data protection',
  },
};
