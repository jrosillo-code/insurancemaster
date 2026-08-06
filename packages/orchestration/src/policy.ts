import type {
  ActionCode,
  AnswerType,
  ConciergeDraft,
  EvidenceReference,
  Intent,
  ProposedAction,
  RiskFlag,
} from '@rosillo/domain';
import {
  ALLOWED_ACTIONS,
  INSUFFICIENT_EVIDENCE_MESSAGE,
  INTENT_ACTIONS,
  intentNeedsAPerson,
  isMaterialAnswer,
  isProhibitedAction,
  OUT_OF_SCOPE_MESSAGE,
  requiresHumanApproval,
} from '@rosillo/domain';

/**
 * Stage 7 — server-side policy enforcement (blueprint §10.2).
 *
 * This is the layer that makes the model's output safe rather than trusting it to
 * be. It applies four rules, in this order:
 *
 *   1. **Citations are resolved, not accepted.** The model returns indexes into the
 *      evidence it was given; real ids are substituted here. An out-of-range index
 *      is dropped, so a model cannot invent a source by naming one.
 *   2. **Material answers need qualifying evidence.** A FACT, EXPLANATION or
 *      PRELIMINARY answer with no tier A/B citation is downgraded to INSUFFICIENT —
 *      the eloquence is discarded, not published with a caveat.
 *   3. **Actions come from the catalogue, scoped to the intent.** Anything else is
 *      dropped; a prohibited code is a security event, not a validation warning.
 *   4. **Uncertainty is added, never removed.** Conflicts and stale sources found by
 *      retrieval are appended even if the model omitted them.
 */

export interface PolicyInput {
  draft: ConciergeDraft;
  intent: Intent;
  /** Evidence the model was shown, in the order it was shown. Index = position. */
  candidateReferences: readonly EvidenceReference[];
  /** Deterministic verdict from retrieval. Binding. */
  evidenceInsufficient: boolean;
  insufficiencyReasons: readonly string[];
  conflicts: readonly string[];
  staleSources: readonly string[];
  /** Policy ids in scope, used to attach actions to real records. */
  relevantPolicyIds: readonly string[];
  /** Set when the incoming message looked like an instruction to the system. */
  injectionDetected: boolean;
  /**
   * Set when the whole client message was a greeting or an acknowledgement.
   *
   * Read from the client's own text, never from the draft — it decides whether a
   * reply may be presented without an evidence caveat, so a model must not be able
   * to assert it.
   */
  smallTalk: boolean;
  language: 'es' | 'en';
}

export interface PolicyOutput {
  answerType: AnswerType;
  clientMessage: string;
  evidence: EvidenceReference[];
  uncertainty: string[];
  proposedActions: ProposedAction[];
  humanReviewRequired: boolean;
  safetyNotice: string | null;
  riskFlags: RiskFlag[];
  /** ALLOWED when nothing was changed, CONSTRAINED when it was, REJECTED when replaced. */
  verdict: 'ALLOWED' | 'CONSTRAINED' | 'REJECTED';
  reason: string | null;
  /** Prohibited codes the model attempted. Audited; always empty in a healthy run. */
  blockedActionCodes: string[];
  operationalNote: string;
}

export function enforcePolicy(input: PolicyInput): PolicyOutput {
  const riskFlags = new Set<RiskFlag>();
  const changes: string[] = [];
  let verdict: PolicyOutput['verdict'] = 'ALLOWED';

  if (input.injectionDetected) {
    riskFlags.add('POSSIBLE_PROMPT_INJECTION');
  }
  if (input.conflicts.length > 0) riskFlags.add('CONFLICTING_EVIDENCE');
  if (input.staleSources.length > 0) riskFlags.add('STALE_EVIDENCE');

  // ── 1. Resolve citations from indexes ──────────────────────────────────────
  const seen = new Set<string>();
  const evidence: EvidenceReference[] = [];
  let droppedCitations = 0;
  for (const index of input.draft.citedEvidenceIndexes) {
    const reference = input.candidateReferences[index];
    if (!reference) {
      droppedCitations += 1;
      continue;
    }
    if (seen.has(reference.id)) continue;
    seen.add(reference.id);
    evidence.push(reference);
  }
  if (droppedCitations > 0) {
    changes.push(`${droppedCitations} cita(s) fuera de rango descartada(s)`);
    verdict = 'CONSTRAINED';
  }

  // ── 2. Answer type must be supportable ─────────────────────────────────────
  let answerType = input.draft.answerType;
  let clientMessage = input.draft.clientMessage;
  const uncertainty = [...input.draft.uncertainty];

  const hasClientGrounding = evidence.some((e) => e.tier === 'A' || e.tier === 'B');
  const hasProcedureGrounding = evidence.some((e) => e.tier === 'C');

  if (input.evidenceInsufficient && answerType !== 'EMERGENCY' && answerType !== 'OUT_OF_SCOPE') {
    if (answerType !== 'INSUFFICIENT') {
      answerType = 'INSUFFICIENT';
      clientMessage = INSUFFICIENT_EVIDENCE_MESSAGE;
      changes.push('respuesta sustituida por estado de evidencia insuficiente');
      verdict = 'REJECTED';
    }
  } else if (isMaterialAnswer(answerType) && !hasClientGrounding) {
    // The most important rule in the platform: no citation, no claim.
    answerType = 'INSUFFICIENT';
    clientMessage = INSUFFICIENT_EVIDENCE_MESSAGE;
    changes.push('respuesta material sin evidencia de nivel A o B');
    verdict = 'REJECTED';
  } else if (answerType === 'PROCEDURE' && !hasProcedureGrounding) {
    answerType = 'INSUFFICIENT';
    clientMessage = INSUFFICIENT_EVIDENCE_MESSAGE;
    changes.push('respuesta de procedimiento sin procedimiento aprobado citado');
    verdict = 'REJECTED';
  }

  if (answerType === 'OUT_OF_SCOPE' && clientMessage.trim().length === 0) {
    clientMessage = OUT_OF_SCOPE_MESSAGE;
  }

  // An answer that was downgraded keeps no stale citations that no longer apply.
  const finalEvidence = answerType === 'INSUFFICIENT' ? evidence.filter((e) => e.tier === 'C') : evidence;

  // ── 3. Actions: catalogue ∩ intent ─────────────────────────────────────────
  const permitted = new Set<ActionCode>(INTENT_ACTIONS[input.intent]);
  const proposedActions: ProposedAction[] = [];
  const blockedActionCodes: string[] = [];
  const usedCodes = new Set<string>();

  for (const raw of input.draft.proposedActionCodes) {
    if (isProhibitedAction(raw)) {
      // Not a validation warning — an attempt to reach past the boundary.
      blockedActionCodes.push(raw);
      riskFlags.add('PROHIBITED_ACTION_REQUESTED');
      verdict = 'REJECTED';
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(ALLOWED_ACTIONS, raw)) {
      blockedActionCodes.push(raw);
      changes.push(`acción desconocida descartada (${raw})`);
      verdict = verdict === 'ALLOWED' ? 'CONSTRAINED' : verdict;
      continue;
    }
    const code = raw as ActionCode;
    if (!permitted.has(code)) {
      blockedActionCodes.push(raw);
      changes.push(`acción fuera del alcance de la intención descartada (${raw})`);
      verdict = verdict === 'ALLOWED' ? 'CONSTRAINED' : verdict;
      continue;
    }
    if (usedCodes.has(code)) continue;
    usedCodes.add(code);
    const definition = ALLOWED_ACTIONS[code];
    proposedActions.push({
      code,
      label: labelAction(code, input.language),
      description: describeAction(code, input.language),
      relatedPolicyIds: [...input.relevantPolicyIds].slice(0, 10),
      requiresHumanApproval: requiresHumanApproval(code),
      externalActionAllowed: false,
    });
  }

  /*
   * When a conversation reaches a person.
   *
   * This used to read "insufficient or unknown must still reach a person", which in
   * practice meant most of them: every "am I covered for X" quoted the wording,
   * answered usefully, and *also* put a task in somebody's queue. A queue where most
   * rows need nothing done is worse than no queue — the ones that do get lost in it,
   * and the client is told a person is coming when nobody had to come.
   *
   * A task now exists when a person actually has something to do:
   *
   *   - the client asked for something to be done rather than asked a question — a
   *     document, a claim, an amendment, a quote, a life event, a person. That list
   *     is `INTENTS_NEEDING_A_PERSON`, beside the intents themselves;
   *   - safety, where somebody follows up regardless of what was said here;
   *   - two sources disagree, which the assistant is forbidden to resolve and a
   *     person must;
   *   - a message carrying an instruction aimed at the system, which is a security
   *     event somebody at Rosillo should see rather than something to answer and
   *     forget;
   *   - or the draft proposed a real action, which is already in `proposedActions`
   *     by this point.
   *
   * A question answers, says plainly what it could not confirm, and leaves the route
   * to a person where it always is: on every screen, one line under the composer, one
   * message away. Offered rather than imposed.
   *
   * Nothing here loosens what may be *done*. Execution still requires a person, no
   * action leaves Rosillo, and `humanReviewRequired` still travels with the response.
   * The only thing being decided is whether somebody's queue gains a row.
   */
  const mustReachAPerson =
    intentNeedsAPerson(input.intent) ||
    answerType === 'EMERGENCY' ||
    input.conflicts.length > 0 ||
    input.injectionDetected;

  if (mustReachAPerson && proposedActions.length === 0 && permitted.has('CREATE_ADVISER_TASK')) {
    proposedActions.push({
      code: 'CREATE_ADVISER_TASK',
      label: labelAction('CREATE_ADVISER_TASK', input.language),
      description: describeAction('CREATE_ADVISER_TASK', input.language),
      relatedPolicyIds: [...input.relevantPolicyIds].slice(0, 10),
      requiresHumanApproval: false,
      externalActionAllowed: false,
    });
    changes.push('tarea de asesor añadida para garantizar seguimiento humano');
    verdict = verdict === 'ALLOWED' ? 'CONSTRAINED' : verdict;
  }

  // The same rule in the other direction: a drafter that reaches for an adviser task
  // on an answer that stood on its own is making the mistake above, so the action is
  // dropped rather than honoured. Only when it is the sole proposal — alongside a
  // real action it is the drafter saying "and have somebody look", which is fair.
  if (!mustReachAPerson && proposedActions.length === 1 && proposedActions[0]?.code === 'CREATE_ADVISER_TASK') {
    proposedActions.pop();
    changes.push('tarea de asesor descartada: la respuesta se sostiene por sí sola');
  }

  /*
   * A turn where nothing was asked.
   *
   * `INSUFFICIENT` was carrying two meanings. "I looked at your file and found
   * nothing that supports this" is a verdict, and the client should see it labelled.
   * "Hola" is not a verdict, and answering it with *No puedo confirmarlo con la
   * información disponible* made the assistant look broken on the first thing
   * anybody typed at it.
   *
   * The gate is `input.smallTalk`, computed from the *client's* words before any
   * model ran — the whole message is a greeting or an acknowledgement. A drafter
   * cannot ask for this type; it is absent from the schema the model answers with.
   * So the only thing a model can do here is write the greeting, which is what it
   * would have written anyway; it cannot decide that a question was small talk.
   *
   * Everything else that could not be answered keeps its caveat and its human
   * review. "Cuéntame cosas" and "¿me estoy dejando algo sin asegurar?" are real
   * questions this platform cannot answer, and they reach a person.
   */
  if (
    answerType === 'INSUFFICIENT' &&
    input.smallTalk &&
    finalEvidence.length === 0 &&
    proposedActions.length === 0 &&
    !input.injectionDetected &&
    input.conflicts.length === 0
  ) {
    answerType = 'CONVERSATIONAL';
  }

  // ── 4. Uncertainty is additive ─────────────────────────────────────────────
  // Except on a turn that asserted nothing: retrieval's "no relevant documentation
  // found" is true and irrelevant under a greeting, and listing it there turns hello
  // into a caveat.
  if (answerType !== 'CONVERSATIONAL') {
    for (const reason of input.insufficiencyReasons) {
      if (!uncertainty.includes(reason)) uncertainty.push(reason);
    }
  }
  if (input.injectionDetected) {
    uncertainty.push(
      input.language === 'es'
        ? 'El mensaje contenía instrucciones dirigidas al sistema. Las he ignorado y he pasado tu consulta a una persona.'
        : 'The message contained instructions aimed at the system. I ignored them and passed your query to a person.',
    );
  }

  // ── Human review ───────────────────────────────────────────────────────────
  const humanReviewRequired =
    answerType === 'INSUFFICIENT' ||
    answerType === 'PRELIMINARY' ||
    answerType === 'EMERGENCY' ||
    input.injectionDetected ||
    input.conflicts.length > 0 ||
    blockedActionCodes.length > 0 ||
    proposedActions.some((a) => a.requiresHumanApproval);

  if (input.intent === 'EMERGENCY') riskFlags.add('POSSIBLE_INJURY');
  if (input.intent === 'OUT_OF_SCOPE') riskFlags.add('REGULATED_ADVICE_REQUESTED');

  return {
    answerType,
    clientMessage,
    evidence: finalEvidence,
    uncertainty: uncertainty.slice(0, 10),
    proposedActions: proposedActions.slice(0, 5),
    humanReviewRequired,
    safetyNotice: input.draft.safetyNotice,
    riskFlags: [...riskFlags],
    verdict,
    reason: changes.length > 0 ? changes.join('; ').slice(0, 300) : null,
    blockedActionCodes,
    operationalNote: buildOperationalNote(input.intent, answerType, changes),
  };
}

/**
 * The short operational note stored with each response. Records what the *system*
 * did — never how the model reasoned (ADR-0009).
 */
function buildOperationalNote(intent: Intent, answerType: AnswerType, changes: string[]): string {
  const base = `intención=${intent}; tipo=${answerType}`;
  return (changes.length > 0 ? `${base}; ajustes: ${changes.join('; ')}` : base).slice(0, 500);
}

/**
 * The action's title, in the reader's language.
 *
 * `ALLOWED_ACTIONS[code].label` is Spanish only — it is the canonical name of the
 * action in the catalogue, not a display string — so using it directly produced cards
 * with a Spanish heading over an English body. The catalogue stays as it is; the
 * surface gets its own pair.
 */
export function labelAction(code: ActionCode, language: 'es' | 'en'): string {
  const labels: Record<ActionCode, [string, string]> = {
    VIEW_RECORD: ['Consultar un registro autorizado', 'Look up an authorised record'],
    DOWNLOAD_DOCUMENT: [
      'Entregar un documento existente autorizado',
      'Provide an existing authorised document',
    ],
    CREATE_ADVISER_TASK: [
      'Crear una tarea interna para un asesor',
      'Create an internal task for an adviser',
    ],
    REQUEST_INFORMATION: [
      'Pedir al cliente los datos que faltan',
      'Ask for the information still missing',
    ],
    UPLOAD_DOCUMENT: [
      'Recibir y clasificar un archivo de forma segura',
      'Receive and classify a file securely',
    ],
    PREPARE_CLAIM_INTAKE: [
      'Preparar el parte estructurado del siniestro para revisión',
      'Prepare the structured claim package for review',
    ],
    PREPARE_AMENDMENT: ['Redactar la solicitud de modificación', 'Draft the amendment request'],
    PREPARE_CANCELLATION: [
      'Recopilar requisitos y redactar la solicitud de baja',
      'Collect requirements and draft the cancellation request',
    ],
    PREPARE_RENEWAL_REVIEW: [
      'Preparar la revisión de renovación',
      'Prepare the renewal review',
    ],
  };
  const pair = labels[code];
  return language === 'es' ? pair[0] : pair[1];
}

function describeAction(code: ActionCode, language: 'es' | 'en'): string {
  const descriptions: Record<ActionCode, [string, string]> = {
    VIEW_RECORD: [
      'Abrir el registro correspondiente de tu cartera.',
      'Open the relevant record from your portfolio.',
    ],
    DOWNLOAD_DOCUMENT: [
      'Poner a tu disposición el documento que ya existe en tu expediente.',
      'Make available the document that already exists on your file.',
    ],
    CREATE_ADVISER_TASK: [
      'Crear una consulta interna para que un asesor de Rosillo la revise. No se envía nada fuera de Rosillo.',
      'Create an internal query for a Rosillo adviser to review. Nothing is sent outside Rosillo.',
    ],
    REQUEST_INFORMATION: [
      'Pedirte los datos que faltan para poder continuar.',
      'Ask you for the information still needed to continue.',
    ],
    UPLOAD_DOCUMENT: [
      'Recibir y clasificar el archivo que aportes. Lo revisa una persona antes de usarlo.',
      'Receive and classify the file you provide. A person reviews it before it is used.',
    ],
    PREPARE_CLAIM_INTAKE: [
      'Preparar el parte estructurado del siniestro. El equipo de siniestros lo valida antes de presentarlo.',
      'Prepare the structured claim package. The claims team validates it before submission.',
    ],
    PREPARE_AMENDMENT: [
      'Redactar la solicitud de modificación. La ejecuta un empleado, no este asistente.',
      'Draft the amendment request. An employee executes it, not this assistant.',
    ],
    PREPARE_CANCELLATION: [
      'Recopilar los requisitos y redactar la solicitud de baja. La verifica y tramita un empleado.',
      'Collect the requirements and draft the cancellation request. An employee verifies and processes it.',
    ],
    PREPARE_RENEWAL_REVIEW: [
      'Crear una revisión de renovación con los datos aprobados para el equipo comercial.',
      'Create a renewal review with approved data for the commercial team.',
    ],
  };
  const pair = descriptions[code];
  return language === 'es' ? pair[0] : pair[1];
}
