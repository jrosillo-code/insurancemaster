import { z } from 'zod';

/**
 * Evidence contracts (blueprint §9.2, §21 Milestone A).
 *
 * Insurance answers are time-dependent and source-dependent, so no material value
 * travels through this platform as a bare primitive. Every material field carries
 * where it came from, when it was observed, which interval it applies to, and
 * whether another source disagrees. Where two systems disagree the conflict is
 * surfaced or routed — never averaged, never silently resolved.
 */

/** Knowledge tiers (blueprint §9.4). Determines whether a source may answer a client directly. */
export const KNOWLEDGE_TIERS = ['A', 'B', 'C', 'D', 'E'] as const;
export type KnowledgeTier = (typeof KNOWLEDGE_TIERS)[number];

export const KNOWLEDGE_TIER_INFO: Record<
  KnowledgeTier,
  { label: string; canAnswerClientDirectly: boolean; note: string }
> = {
  A: {
    label: 'Dato autoritativo del cliente',
    canAnswerClientDirectly: true,
    note: 'Campos del sistema de registro, condiciones particulares, expediente de siniestro vigente.',
  },
  B: {
    label: 'Documento contractual',
    canAnswerClientDirectly: true,
    note: 'Condicionado, suplementos y comunicaciones de la aseguradora, cuando la versión aplicable está establecida.',
  },
  C: {
    label: 'Procedimiento aprobado de Rosillo',
    canAnswerClientDirectly: true,
    note: 'Debe presentarse etiquetado como procedimiento, no como cobertura.',
  },
  D: {
    label: 'Interpretación del asesor',
    canAnswerClientDirectly: false,
    note: 'Juicio profesional sobre un caso concreto. Requiere revisión humana.',
  },
  E: {
    label: 'Conocimiento general',
    canAnswerClientDirectly: false,
    note: 'Solo educativo. Nunca se presenta como un hecho específico del cliente.',
  },
};

export const SOURCE_TYPES = [
  'ERP',
  'POLICY_DOCUMENT',
  'CLAIM_RECORD',
  'CLIENT_STATEMENT',
  'APPROVED_KNOWLEDGE',
  /**
   * A field a named Rosillo adviser entered by hand, reading the policy in front of
   * them.
   *
   * Tier A, deliberately. Tier A is "the client's authoritative record", and when
   * there is no feed from the management system the brokerage's own record *is* an
   * adviser having read the document and typed what it says. Calling it tier D would
   * mean the platform could never answer a factual question about a policy it holds,
   * which is the same as not holding it.
   *
   * What keeps that honest is the rest of the provenance travelling with it: the
   * `sourceId` is the adviser, not "the system", so every figure is attributable to
   * a person; `observedAt` says when they read it; and `confidence` is theirs to set
   * below 1.0 where the document was unclear. A later extraction that disagrees
   * produces the existing conflict path rather than silently overwriting — two
   * sources that differ is a case for a person, which is already how this works.
   */
  'ADVISER_ENTERED',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** Which knowledge tier each source type belongs to. Drives what may be said directly to a client. */
export const SOURCE_TYPE_TIER: Record<SourceType, KnowledgeTier> = {
  ERP: 'A',
  CLAIM_RECORD: 'A',
  ADVISER_ENTERED: 'A',
  POLICY_DOCUMENT: 'B',
  APPROVED_KNOWLEDGE: 'C',
  // A client statement is a claim about the world, not a verified record. It can
  // never on its own support a material insurance answer.
  CLIENT_STATEMENT: 'D',
};

export const evidenceConflictSchema = z.object({
  /** The other source that disagrees. */
  otherSourceType: z.enum(SOURCE_TYPES),
  otherSourceId: z.string().min(1).max(200),
  otherValue: z.string().max(500),
  detail: z.string().max(300),
});
export type EvidenceConflict = z.infer<typeof evidenceConflictSchema>;

/**
 * A material value plus its provenance (blueprint §9.2).
 * `value` is kept as a display-ready string so the same envelope crosses the
 * package, API and UI boundary without a generic leaking into the wire format.
 */
export const evidenceBackedFieldSchema = z.object({
  value: z.string().max(1000).nullable(),
  sourceType: z.enum(SOURCE_TYPES),
  sourceId: z.string().min(1).max(200),
  sourcePath: z.string().max(300).optional(),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().optional(),
  observedAt: z.string(),
  quote: z.string().max(1000).optional(),
  confidence: z.number().min(0).max(1),
  conflict: evidenceConflictSchema.optional(),
});
export type EvidenceBackedField = z.infer<typeof evidenceBackedFieldSchema>;

/**
 * A citation attached to a client-facing answer. Every reference must resolve to a
 * real record the authenticated user is entitled to open — the UI turns each one
 * into a card that reveals the exact field or document passage.
 */
export const evidenceReferenceSchema = z.object({
  id: z.string().min(1).max(200),
  sourceType: z.enum(SOURCE_TYPES),
  sourceId: z.string().min(1).max(200),
  /** Human label shown on the evidence card, e.g. "Póliza de Auto — Allianz". */
  label: z.string().min(1).max(200),
  /** Document passage id when the source is a document. */
  passageId: z.string().max(200).optional(),
  /** Field path when the source is a structured record, e.g. "premium.annual". */
  fieldPath: z.string().max(200).optional(),
  quote: z.string().max(1000).optional(),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().optional(),
  observedAt: z.string(),
  tier: z.enum(KNOWLEDGE_TIERS),
});
export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;

/** Presented next to every answer so the client can see how current the underlying data is. */
export const freshnessSummarySchema = z.object({
  /** Oldest `observedAt` across the evidence used. */
  oldestObservedAt: z.string().nullable(),
  newestObservedAt: z.string().nullable(),
  /** True when any cited source is superseded or past its effective interval. */
  containsStaleSource: z.boolean(),
  /** True when two sources disagree on a material value. */
  containsConflict: z.boolean(),
  note: z.string().max(300).nullable().default(null),
});
export type FreshnessSummary = z.infer<typeof freshnessSummarySchema>;

/** Does this evidence tier permit a direct client-facing material statement? */
export function canGroundClientAnswer(tier: KnowledgeTier): boolean {
  return KNOWLEDGE_TIER_INFO[tier].canAnswerClientDirectly;
}

export function tierForSource(sourceType: SourceType): KnowledgeTier {
  return SOURCE_TYPE_TIER[sourceType];
}

/** True when `at` falls inside the field's effective interval (open-ended bounds allowed). */
export function isEffectiveAt(
  field: Pick<EvidenceBackedField, 'effectiveFrom' | 'effectiveTo'>,
  at: string,
): boolean {
  if (field.effectiveFrom && at < field.effectiveFrom) return false;
  if (field.effectiveTo && at > field.effectiveTo) return false;
  return true;
}

/**
 * Build the freshness summary the client sees. `asOf` is supplied by the caller
 * rather than read from the clock so orchestration stays reproducible in tests.
 */
export function summariseFreshness(
  references: EvidenceReference[],
  asOf: string,
  opts: { conflicts?: boolean } = {},
): FreshnessSummary {
  if (references.length === 0) {
    return {
      oldestObservedAt: null,
      newestObservedAt: null,
      containsStaleSource: false,
      containsConflict: opts.conflicts ?? false,
      note: null,
    };
  }
  const observed = references.map((r) => r.observedAt).sort();
  const stale = references.some(
    (r) => !isEffectiveAt({ effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo }, asOf),
  );
  return {
    oldestObservedAt: observed[0] ?? null,
    newestObservedAt: observed[observed.length - 1] ?? null,
    containsStaleSource: stale,
    containsConflict: opts.conflicts ?? false,
    note: stale ? 'Alguna fuente citada está fuera de su periodo de vigencia.' : null,
  };
}
