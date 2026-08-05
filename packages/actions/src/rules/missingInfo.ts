import type { Intent, MissingItem } from '@rosillo/domain';
import { normalise } from '@rosillo/domain';

/**
 * Versioned deterministic missing-information rules (blueprint §14.4).
 *
 * These verdicts come from approved rules, never from the model. That distinction is
 * the whole point: a model that is persuaded a required document is unnecessary
 * cannot make it unnecessary, and an employee closing a task with items still
 * outstanding must record an override reason.
 *
 * Rules run over the client's message text and the conversation so far — both
 * untrusted, both treated as data.
 */

export const MISSING_INFO_RULES_VERSION = 'concierge-rules-v1';

export interface RuleContext {
  intent: Intent;
  /** Normalised client message plus prior client turns. */
  text: string;
  /** Whether the client has attached anything to this conversation. */
  hasAttachments: boolean;
  /** Policy ids the retrieval layer resolved, used to detect ambiguity. */
  resolvedPolicyIds: readonly string[];
}

interface Rule {
  id: string;
  intents: readonly Intent[];
  evaluate(ctx: RuleContext): MissingItem | null;
}

function item(
  ruleId: string,
  key: string,
  label: string,
  severity: 'REQUIRED' | 'RECOMMENDED',
): MissingItem {
  return { key, label, severity, ruleId };
}

const mentions = (ctx: RuleContext, pattern: RegExp) => pattern.test(ctx.text);

/** Looks for anything that reads like a date: "12/07", "12 de julio", "ayer". */
const MENTIONS_DATE =
  /\b(\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?|\d{1,2} de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)|ayer|anteayer|esta manana|esta tarde|anoche|el (lunes|martes|miercoles|jueves|viernes|sabado|domingo))\b/;
const MENTIONS_TIME = /\b(\d{1,2}[:.]\d{2}|\d{1,2} de la (manana|tarde|noche)|mediodia|medianoche)\b/;
const MENTIONS_PLACE = /\b(en |calle|avenida|plaza|carretera|autopista|aparcamiento|parking|garaje|kilometro)\b/;
const MENTIONS_PLATE = /\b\d{4}\s?[a-z]{3}\b/;

const RULES: Rule[] = [
  // ── Claims ─────────────────────────────────────────────────────────────────
  {
    id: 'CL-001-incident-date',
    intents: ['CLAIM_START'],
    evaluate: (ctx) =>
      mentions(ctx, MENTIONS_DATE)
        ? null
        : item('CL-001-incident-date', 'incident_date', 'Fecha del siniestro', 'REQUIRED'),
  },
  {
    id: 'CL-002-incident-time',
    intents: ['CLAIM_START'],
    evaluate: (ctx) =>
      mentions(ctx, MENTIONS_TIME)
        ? null
        : item('CL-002-incident-time', 'incident_time', 'Hora aproximada del siniestro', 'REQUIRED'),
  },
  {
    id: 'CL-003-incident-place',
    intents: ['CLAIM_START'],
    evaluate: (ctx) =>
      mentions(ctx, MENTIONS_PLACE)
        ? null
        : item('CL-003-incident-place', 'incident_place', 'Lugar donde ocurrió', 'REQUIRED'),
  },
  {
    id: 'CL-004-photos',
    intents: ['CLAIM_START'],
    evaluate: (ctx) =>
      ctx.hasAttachments
        ? null
        : item('CL-004-photos', 'damage_photos', 'Fotografías de los daños', 'REQUIRED'),
  },
  {
    id: 'CL-005-third-party',
    intents: ['CLAIM_START'],
    evaluate: (ctx) =>
      mentions(ctx, /\b(tercero|otro (coche|vehiculo|conductor)|matricula del otro|parte amistoso|nadie mas|sin terceros)\b/)
        ? null
        : item('CL-005-third-party', 'third_party', 'Si hay un tercero implicado y sus datos', 'REQUIRED'),
  },
  {
    id: 'CL-006-injuries',
    intents: ['CLAIM_START'],
    evaluate: (ctx) =>
      mentions(ctx, /\b(herid|lesion|nadie ha resultado|sin danos personales|solo danos materiales|ileso)/)
        ? null
        : item('CL-006-injuries', 'injuries', 'Si ha habido daños personales', 'REQUIRED'),
  },
  {
    id: 'CL-007-police',
    intents: ['CLAIM_START'],
    evaluate: (ctx) =>
      mentions(ctx, /\b(policia|guardia civil|atestado|denuncia|sin parte policial)\b/)
        ? null
        : item('CL-007-police', 'police_report', 'Si existe atestado o denuncia', 'RECOMMENDED'),
  },

  // ── Cancellation ───────────────────────────────────────────────────────────
  {
    id: 'CA-001-effective-date',
    intents: ['CANCELLATION_REQUEST'],
    evaluate: (ctx) =>
      mentions(ctx, MENTIONS_DATE)
        ? null
        : item('CA-001-effective-date', 'cancellation_effective_date', 'Fecha de efecto deseada para la baja', 'REQUIRED'),
  },
  {
    id: 'CA-002-reason',
    intents: ['CANCELLATION_REQUEST'],
    evaluate: (ctx) =>
      mentions(ctx, /\b(porque|motivo|he vendido|ya no|me cambio|duplicad|demasiado car)/)
        ? null
        : item('CA-002-reason', 'cancellation_reason', 'Motivo de la baja', 'REQUIRED'),
  },
  {
    id: 'CA-003-signed-request',
    intents: ['CANCELLATION_REQUEST'],
    evaluate: () =>
      // Always outstanding: a signed request cannot be gathered through chat.
      item('CA-003-signed-request', 'signed_cancellation', 'Solicitud de baja firmada', 'REQUIRED'),
  },
  {
    id: 'CA-004-sale-document',
    intents: ['CANCELLATION_REQUEST'],
    evaluate: (ctx) =>
      mentions(ctx, /\b(he vendido|vendi|venta|transferencia|baja en trafico)\b/)
        ? item('CA-004-sale-document', 'sale_document', 'Contrato de compraventa o baja en tráfico', 'REQUIRED')
        : null,
  },

  // ── Policy change ──────────────────────────────────────────────────────────
  {
    id: 'PC-001-what-changes',
    intents: ['POLICY_CHANGE'],
    evaluate: (ctx) =>
      mentions(ctx, /\b(direccion|domicilio|conductor|beneficiari|cuenta|iban|vehiculo|matricula|capital|cobertura)/)
        ? null
        : item('PC-001-what-changes', 'change_detail', 'Qué dato concreto hay que modificar', 'REQUIRED'),
  },
  {
    id: 'PC-002-effective-date',
    intents: ['POLICY_CHANGE'],
    evaluate: (ctx) =>
      mentions(ctx, MENTIONS_DATE)
        ? null
        : item('PC-002-effective-date', 'change_effective_date', 'Fecha de efecto deseada', 'REQUIRED'),
  },
  {
    id: 'PC-003-supporting-doc',
    intents: ['POLICY_CHANGE'],
    evaluate: (ctx) =>
      ctx.hasAttachments
        ? null
        : item('PC-003-supporting-doc', 'supporting_document', 'Documento que acredite el cambio', 'RECOMMENDED'),
  },

  // ── Quote ──────────────────────────────────────────────────────────────────
  {
    id: 'QR-001-risk-detail',
    intents: ['QUOTE_REQUEST'],
    evaluate: (ctx) =>
      mentions(ctx, MENTIONS_PLATE) || mentions(ctx, /\b(direccion|metros|actividad|modelo|marca|superficie)\b/)
        ? null
        : item('QR-001-risk-detail', 'risk_detail', 'Datos del riesgo que se quiere asegurar', 'REQUIRED'),
  },
  {
    id: 'QR-002-start-date',
    intents: ['QUOTE_REQUEST'],
    evaluate: (ctx) =>
      mentions(ctx, MENTIONS_DATE)
        ? null
        : item('QR-002-start-date', 'desired_start_date', 'Fecha de efecto deseada', 'RECOMMENDED'),
  },

  // ── Renewal ────────────────────────────────────────────────────────────────
  {
    id: 'RR-001-which-policy',
    intents: ['RENEWAL_REVIEW'],
    evaluate: (ctx) =>
      ctx.resolvedPolicyIds.length === 1
        ? null
        : item('RR-001-which-policy', 'target_policy', 'Sobre qué póliza quiere la revisión', 'REQUIRED'),
  },

  // ── Documents ──────────────────────────────────────────────────────────────
  {
    id: 'DR-001-recipient',
    intents: ['DOCUMENT_REQUEST'],
    evaluate: (ctx) =>
      mentions(ctx, /\b(para (el|la|mi)|a nombre de|casero|arrendador|propietario|banco|empresa|universidad)\b/)
        ? null
        : item('DR-001-recipient', 'certificate_recipient', 'Para quién se necesita el documento', 'RECOMMENDED'),
  },

  // ── Life events ────────────────────────────────────────────────────────────
  {
    id: 'LE-001-when',
    intents: ['LIFE_EVENT'],
    evaluate: (ctx) =>
      mentions(ctx, MENTIONS_DATE) || mentions(ctx, /\b(proxim|semana que viene|el mes que viene|en \w+)/)
        ? null
        : item('LE-001-when', 'event_date', 'Cuándo ocurre o ha ocurrido el cambio', 'REQUIRED'),
  },
  {
    id: 'LE-002-detail',
    intents: ['LIFE_EVENT'],
    evaluate: (ctx) =>
      ctx.text.length > 60
        ? null
        : item('LE-002-detail', 'event_detail', 'Algún detalle más sobre el cambio', 'RECOMMENDED'),
  },

  // ── Human handoff ──────────────────────────────────────────────────────────
  {
    id: 'HR-001-channel',
    intents: ['HUMAN_REQUEST', 'UNKNOWN'],
    evaluate: (ctx) =>
      mentions(ctx, /\b(llamad|telefono|movil|correo|email|por aqui|por chat|whatsapp)/)
        ? null
        : item('HR-001-channel', 'preferred_channel', 'Cómo prefiere que le contactemos', 'RECOMMENDED'),
  },
];

export interface EvaluateMissingInfoInput {
  intent: Intent;
  /** The client's message plus prior client turns, joined. */
  clientText: string;
  hasAttachments: boolean;
  resolvedPolicyIds: readonly string[];
}

/** Runs the approved rules for an intent. Deterministic and order-stable. */
export function evaluateMissingInformation(input: EvaluateMissingInfoInput): MissingItem[] {
  const ctx: RuleContext = {
    intent: input.intent,
    text: normalise(input.clientText),
    hasAttachments: input.hasAttachments,
    resolvedPolicyIds: input.resolvedPolicyIds,
  };
  const items: MissingItem[] = [];
  for (const rule of RULES) {
    if (!rule.intents.includes(input.intent)) continue;
    const result = rule.evaluate(ctx);
    if (result) items.push(result);
  }
  return items;
}

/** True when a task still has REQUIRED items outstanding — closing it needs an override reason. */
export function hasOutstandingRequired(items: readonly MissingItem[]): boolean {
  return items.some((i) => i.severity === 'REQUIRED');
}
