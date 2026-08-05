import type { AuthorisedScope, EvidenceReference } from '@rosillo/domain';
import { formatEur, formatSpanishDate, normalise, summariseFreshness } from '@rosillo/domain';
import type {
  ApprovedProcedure,
  Claim,
  CoverageTerm,
  InsuredObject,
  Policy,
  PolicyDocument,
  Receipt,
  SyntheticCustomer360,
} from '@rosillo/customer-360';
import { asEvidenceReference, PROCEDURE_FOR_INTENT } from '@rosillo/customer-360';
import type { RetrievalPlan } from './plan';

/**
 * Evidence retrieval (blueprint §9.3 steps 4–7, §10.2 stage 5).
 *
 * Structured facts are fetched first and documents are used for clauses and
 * explanation (ADR-0004: authoritative facts must not depend on semantic
 * similarity). Everything is filtered by effective date and source status, and the
 * result is a set of *evidence objects* — never unlabelled text.
 *
 * When evidence is insufficient or two sources disagree, this layer says so. It does
 * not choose a winner, and it does not let the direct-answer path continue.
 */

export interface EvidenceCandidate {
  reference: EvidenceReference;
  /** The text the model may quote. Always drawn from an authorised record. */
  content: string;
  /** Set when this candidate is outside its effective interval for `asOf`. */
  stale: boolean;
  /** Set when another source disagrees with this value. */
  conflict: string | null;
}

export interface RetrievalResult {
  candidates: EvidenceCandidate[];
  policies: Policy[];
  claims: Claim[];
  receipts: Receipt[];
  documents: PolicyDocument[];
  insuredObjects: InsuredObject[];
  coverageTerms: CoverageTerm[];
  procedures: ApprovedProcedure[];
  /** True when nothing in scope could support a material answer. */
  insufficient: boolean;
  /** Human-readable reasons, surfaced as `uncertainty` on the response. */
  insufficiencyReasons: string[];
  conflicts: string[];
  staleSources: string[];
  /** Source ids actually read, recorded in the audit event. */
  readSourceIds: string[];
}

export interface RetrieveInput {
  c360: SyntheticCustomer360;
  scope: AuthorisedScope;
  plan: RetrievalPlan;
  message: string;
  /** Date used for effectivity filtering; injected so tests stay deterministic. */
  asOf: string;
}

export async function retrieveEvidence(input: RetrieveInput): Promise<RetrievalResult> {
  const { c360, scope, plan, asOf } = input;
  const sources = new Set(plan.sources);
  const candidates: EvidenceCandidate[] = [];
  const conflicts: string[] = [];
  const staleSources: string[] = [];
  const insufficiencyReasons: string[] = [];

  const policies = sources.has('POLICIES') ? await c360.listPolicies(scope) : [];
  const relevantPolicies = rankPolicies(policies, plan.terms, input.message).slice(0, plan.maxPerSource);

  // ── Structured facts first ─────────────────────────────────────────────────
  for (const policy of relevantPolicies) {
    const label = `${policy.productLabel} — ${policy.insurer} (${policy.policyNumber})`;
    for (const [field, value] of policyFacts(policy)) {
      const reference = asEvidenceReference(policy, field, label, value);
      if (!reference) continue;
      const provenance = policy.fieldProvenance[field];
      const conflictDetail = provenance?.conflict?.detail ?? null;
      if (conflictDetail) conflicts.push(`${label}: ${conflictDetail}`);
      candidates.push({
        reference,
        content: `${fieldLabel(field)}: ${value}`,
        stale: false,
        conflict: conflictDetail,
      });
    }
  }

  const insuredObjects: InsuredObject[] = [];
  if (sources.has('INSURED_OBJECTS')) {
    for (const policy of relevantPolicies) {
      const objects = await c360.listInsuredObjects(scope, policy.id);
      insuredObjects.push(...objects);
      for (const object of objects) {
        const reference = asEvidenceReference(object, 'label', `Riesgo asegurado — ${object.label}`, object.label);
        if (reference) {
          candidates.push({ reference, content: `Riesgo asegurado: ${object.label}`, stale: false, conflict: null });
        }
      }
    }
  }

  // ── Coverage terms, filtered by effective interval ─────────────────────────
  const coverageTerms: CoverageTerm[] = [];
  if (sources.has('COVERAGE_TERMS')) {
    for (const policy of relevantPolicies) {
      const terms = await c360.listCoverageTerms(scope, policy.id);
      for (const term of terms) {
        const isCurrent = term.effectiveFrom <= asOf && (!term.effectiveTo || term.effectiveTo >= asOf);
        if (!isCurrent && !plan.includeSuperseded) continue;
        coverageTerms.push(term);
        const reference = asEvidenceReference(
          term,
          'value',
          `${term.label} — ${policy.productLabel} (${policy.insurer})`,
          term.value,
        );
        if (!reference) continue;
        if (!isCurrent) staleSources.push(`${term.label}: vigente hasta ${formatSpanishDate(term.effectiveTo ?? '')}`);
        candidates.push({
          reference: { ...reference, passageId: term.passageId },
          content: `${term.label}: ${term.value}`,
          stale: !isCurrent,
          conflict: null,
        });
      }
    }
  }

  // ── Documents and their passages ───────────────────────────────────────────
  const documents: PolicyDocument[] = [];
  if (sources.has('DOCUMENTS')) {
    const fetched = await c360.listDocuments(scope, { includeSuperseded: plan.includeSuperseded });
    const scopedToPolicies = new Set(relevantPolicies.map((p) => p.id));
    const relevant = fetched
      .filter((d) => (scopedToPolicies.size === 0 ? true : d.policyId === null || scopedToPolicies.has(d.policyId)))
      .slice(0, plan.maxPerSource);
    documents.push(...relevant);

    for (const document of relevant) {
      const superseded = document.supersededByDocumentId !== null;
      if (superseded) staleSources.push(`${document.title} (sustituido)`);
      for (const passage of rankPassages(document, plan.terms)) {
        candidates.push({
          reference: {
            id: `${document.id}#${passage.id}`,
            sourceType: 'POLICY_DOCUMENT',
            sourceId: document.id,
            label: document.title,
            passageId: passage.id,
            quote: passage.text,
            effectiveFrom: document.effectiveFrom,
            ...(document.effectiveTo ? { effectiveTo: document.effectiveTo } : {}),
            observedAt: document.fieldProvenance['title']?.observedAt ?? `${asOf}T00:00:00.000Z`,
            tier: 'B',
          },
          content: `${passage.heading}: ${passage.text}`,
          stale: superseded,
          conflict: null,
        });
      }
    }
  }

  // ── Claims ─────────────────────────────────────────────────────────────────
  const claims = sources.has('CLAIMS') ? await c360.listClaims(scope) : [];
  for (const claim of claims.slice(0, plan.maxPerSource)) {
    const reference = asEvidenceReference(claim, 'status', `Siniestro ${claim.claimNumber}`, claim.status);
    if (!reference) continue;
    const timeline = claim.chronology
      .map((event) => `${formatSpanishDate(event.at)} · ${event.description}`)
      .join(' | ');
    candidates.push({
      reference,
      content: `Siniestro ${claim.claimNumber} (${claim.description}). Estado: ${claimStatusLabel(claim.status)}. Cronología: ${timeline}`,
      stale: false,
      conflict: null,
    });
  }

  // ── Receipts ───────────────────────────────────────────────────────────────
  const receipts = sources.has('RECEIPTS') ? await c360.listReceipts(scope) : [];
  for (const receipt of receipts.slice(0, plan.maxPerSource)) {
    const reference = asEvidenceReference(
      receipt,
      'amount',
      `Recibo ${receipt.receiptNumber}`,
      formatEur(receipt.amount),
    );
    if (!reference) continue;
    candidates.push({
      reference,
      content: `Recibo ${receipt.receiptNumber}: ${formatEur(receipt.amount)}, vencimiento ${formatSpanishDate(receipt.dueDate)}, estado ${receiptStatusLabel(receipt.status)}`,
      stale: false,
      conflict: null,
    });
  }

  // ── Approved procedures (tier C) ───────────────────────────────────────────
  // The intent map runs first so a human-routed answer is always grounded in an
  // approved procedure; keyword matches then add anything else that is relevant.
  const procedures: ApprovedProcedure[] = [];
  if (sources.has('PROCEDURES')) {
    const mappedId = PROCEDURE_FOR_INTENT[plan.intent];
    if (mappedId) {
      const mapped = await c360.getProcedure(mappedId);
      if (mapped) procedures.push(mapped);
    }
    for (const found of await c360.findProcedures(input.message)) {
      if (!procedures.some((p) => p.id === found.id)) procedures.push(found);
    }
  }
  for (const procedure of procedures) {
    candidates.push({
      reference: {
        id: `${procedure.id}#${procedure.version}`,
        sourceType: 'APPROVED_KNOWLEDGE',
        sourceId: procedure.id,
        label: `Procedimiento Rosillo — ${procedure.title}`,
        observedAt: `${procedure.approvedAt}T00:00:00.000Z`,
        effectiveFrom: procedure.approvedAt,
        tier: 'C',
      },
      content: `${procedure.title}. Pasos: ${procedure.steps.join(' ')} Documentos necesarios: ${procedure.requiredDocuments.join(', ') || 'ninguno'}. Equipo responsable: ${procedure.responsibleTeam}. ${procedure.serviceExpectation}`,
      stale: false,
      conflict: null,
    });
  }

  // ── Sufficiency verdict ────────────────────────────────────────────────────
  const currentCandidates = candidates.filter((c) => !c.stale);
  if (plan.sources.length > 0 && candidates.length === 0) {
    insufficiencyReasons.push('No hay registros ni documentos autorizados que respondan a esta consulta.');
  }
  if (candidates.length > 0 && currentCandidates.length === 0) {
    insufficiencyReasons.push('La única documentación disponible está fuera de su periodo de vigencia.');
  }
  if (conflicts.length > 0) {
    insufficiencyReasons.push(
      `Dos fuentes no coinciden y la diferencia no está resuelta: ${conflicts.join('; ')}`,
    );
  }

  return {
    candidates: candidates.slice(0, 40),
    policies: relevantPolicies,
    claims,
    receipts,
    documents,
    insuredObjects,
    coverageTerms,
    procedures,
    insufficient: insufficiencyReasons.length > 0,
    insufficiencyReasons,
    conflicts,
    staleSources: [...new Set(staleSources)],
    readSourceIds: [...new Set(candidates.map((c) => c.reference.sourceId))],
  };
}

/** Builds the freshness block shown beside the answer. */
export function freshnessFor(result: RetrievalResult, cited: EvidenceReference[], asOf: string) {
  return summariseFreshness(cited, asOf, { conflicts: result.conflicts.length > 0 });
}

// ── Ranking helpers ──────────────────────────────────────────────────────────

/**
 * Orders policies by how well they match the message. Purely lexical and
 * deterministic — the model never picks which policy a question is about.
 */
function rankPolicies(policies: Policy[], terms: string[], message: string): Policy[] {
  const haystackTerms = new Set(terms);
  const normalisedMessage = normalise(message);
  const productHints: [RegExp, string][] = [
    [/\b(coche|carro|vehiculo|auto|moto|matricula|conducir|car|vehicle)\b/, 'AUTO'],
    [/\b(casa|hogar|vivienda|piso|inmueble|home|house)\b/, 'HOGAR'],
    [/\b(salud|medico|dentista|health|medical)\b/, 'SALUD'],
    [/\b(vida|life)\b/, 'VIDA'],
    [/\b(viaje|viajar|esqui|travel|trip|abroad)/, 'VIAJE'],
    [/\b(negocio|empresa|comercio|local|nave|business)\b/, 'COMERCIO'],
    [/\b(flota|camion|furgoneta|fleet)\b/, 'FLOTA'],
    [/\b(ciber|cyber|informatic|hackeo)/, 'CIBER'],
    [/\b(mercancia|transporte|carga|cargo)/, 'MERCANCIAS'],
    [/\b(responsabilidad civil|rc\b|liability)\b/, 'RC_GENERAL'],
  ];
  const hintedProducts = productHints.filter(([re]) => re.test(normalisedMessage)).map(([, p]) => p);

  return [...policies]
    .map((policy) => {
      let score = 0;
      if (hintedProducts.includes(policy.product)) score += 10;
      const text = normalise(`${policy.productLabel} ${policy.insurer} ${policy.policyNumber}`);
      for (const term of haystackTerms) if (text.includes(term)) score += 3;
      if (normalisedMessage.includes(normalise(policy.policyNumber))) score += 20;
      if (policy.status === 'ACTIVE') score += 1;
      return { policy, score };
    })
    // A question with no product hint should still see the whole portfolio, so a zero
    // score keeps the policy in the list rather than dropping it.
    .sort((a, b) => b.score - a.score || a.policy.id.localeCompare(b.policy.id))
    .map((entry) => entry.policy);
}

/** Picks the passages most likely to answer the question; falls back to the first two. */
function rankPassages(document: PolicyDocument, terms: string[]) {
  const scored = document.passages
    .map((passage) => {
      const text = normalise(`${passage.heading} ${passage.text}`);
      const score = terms.filter((term) => text.includes(term)).length;
      return { passage, score };
    })
    .sort((a, b) => b.score - a.score || a.passage.ordinal - b.passage.ordinal);
  const matched = scored.filter((entry) => entry.score > 0);
  return (matched.length > 0 ? matched : scored.slice(0, 2)).slice(0, 4).map((entry) => entry.passage);
}

function policyFacts(policy: Policy): [string, string][] {
  const facts: [string, string][] = [
    ['premium', formatEur(policy.premium)],
    ['renewalDate', formatSpanishDate(policy.renewalDate)],
    ['status', policyStatusLabel(policy.status)],
    ['insurer', policy.insurer],
    ['inceptionDate', formatSpanishDate(policy.inceptionDate)],
  ];
  if (policy.previousPremium !== null) facts.push(['previousPremium', formatEur(policy.previousPremium)]);
  return facts;
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    premium: 'Prima anual',
    previousPremium: 'Prima del periodo anterior',
    renewalDate: 'Fecha de renovación',
    status: 'Estado',
    insurer: 'Aseguradora',
    inceptionDate: 'Fecha de efecto',
  };
  return labels[field] ?? field;
}

function policyStatusLabel(status: Policy['status']): string {
  const labels: Record<Policy['status'], string> = {
    ACTIVE: 'En vigor',
    PENDING_RENEWAL: 'Pendiente de renovación',
    CANCELLED: 'Anulada',
    LAPSED: 'Caducada',
  };
  return labels[status];
}

function claimStatusLabel(status: Claim['status']): string {
  const labels: Record<Claim['status'], string> = {
    REPORTED: 'Comunicado',
    AWAITING_DOCUMENTS: 'Pendiente de documentación',
    UNDER_REVIEW: 'En revisión',
    INSURER_ASSESSING: 'En peritación por la aseguradora',
    SETTLED: 'Indemnizado',
    CLOSED: 'Cerrado',
    REJECTED: 'Rechazado',
  };
  return labels[status];
}

function receiptStatusLabel(status: Receipt['status']): string {
  const labels: Record<Receipt['status'], string> = {
    PAID: 'Pagado',
    PENDING: 'Pendiente',
    RETURNED: 'Devuelto',
  };
  return labels[status];
}
