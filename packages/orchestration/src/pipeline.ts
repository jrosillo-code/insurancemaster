import { createHash } from 'node:crypto';
import type {
  AIRun,
  AuthorisedScope,
  ConciergeDraft,
  ConciergeResponse,
  ContextType,
  HandoffTask,
  Intent,
} from '@rosillo/domain';
import {
  conciergeDraftSchema,
  conciergeResponseSchema,
  emptyScope,
  INTENTS,
  INTENT_ACTIONS,
  isAllowedMimeType,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_MESSAGE_CHARS,
  MAX_ATTACHMENT_BYTES,
  RateLimiter,
  summariseFreshness,
  truncate,
  wrapUntrusted,
} from '@rosillo/domain';
import type { ConciergeAIProvider, EvidenceCandidateView } from '@rosillo/ai';
import { intentClassificationSchema } from '@rosillo/ai';
import type { SyntheticCustomer360 } from '@rosillo/customer-360';
import { computeScope } from '@rosillo/auth';
import { planRetrieval, retrieveEvidence } from '@rosillo/retrieval';
import type { PlatformStore } from '@rosillo/store';
import { createHandoffTask, evaluateMissingInformation } from '@rosillo/actions';
import type { IdFactory } from './ids';
import { randomIdFactory } from './ids';
import { enforcePolicy } from './policy';

/**
 * The controlled Concierge pipeline (blueprint §10.2, §21 Milestone D).
 *
 * Nine stages, in this order, every time:
 *
 *   1. pre-process and sanitise the message and attachments
 *   2. authenticate and resolve the active context
 *   3. compute the authorised resource scope
 *   4. classify the intent using structured output
 *   5. build a narrow retrieval plan from the intent
 *   6. retrieve evidence within scope
 *   7. draft a typed answer over that evidence
 *   8. enforce policy and action rules, substituting real ids
 *   9. present, create any task, and write immutable audit events
 *
 * The model participates in stages 4 and 7 only. It never sees the database, never
 * selects a record id, and never decides whether an action is permitted.
 */

export const PROVIDER_TIMEOUT_MS = 45_000;

export interface PipelineDeps {
  c360: SyntheticCustomer360;
  store: PlatformStore;
  provider: ConciergeAIProvider;
  ids?: IdFactory;
  rateLimiter?: RateLimiter;
  providerTimeoutMs?: number;
}

export interface AttachmentInput {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface HandleMessageInput {
  accountId: string;
  conversationId: string;
  message: string;
  requestedContext: { type: ContextType; id: string };
  attachments?: AttachmentInput[];
  /** Wall-clock for this request. Injected so runs are reproducible. */
  now: string;
  /** Date used for effectivity filtering. */
  asOf: string;
  language?: 'es' | 'en';
}

export interface HandleMessageSuccess {
  ok: true;
  response: ConciergeResponse;
  task: HandoffTask | null;
  scope: AuthorisedScope;
  traceId: string;
  rejectedAttachments: string[];
}

export interface HandleMessageFailure {
  ok: false;
  errorCode:
    | 'RATE_LIMITED'
    | 'MESSAGE_TOO_LONG'
    | 'TOO_MANY_ATTACHMENTS'
    | 'CONTEXT_UNAVAILABLE'
    | 'CONVERSATION_NOT_FOUND'
    | 'SCHEMA_VALIDATION_FAILED'
    | 'PROVIDER_ERROR'
    | 'PROVIDER_TIMEOUT';
  detail: string;
  traceId: string;
  /** Client-safe Spanish message. Never leaks internal detail. */
  clientMessage: string;
}

export type HandleMessageResult = HandleMessageSuccess | HandleMessageFailure;

export class ProviderTimeoutError extends Error {}
export class SchemaValidationError extends Error {}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function withTimeout<T>(promise: Promise<T>, ms: number, stage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ProviderTimeoutError(`Provider timed out during ${stage}`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Validates provider output, allowing exactly one controlled repair attempt. */
async function validateWithRepair<T>(
  raw: unknown,
  schema: { safeParse(value: unknown): { success: boolean; data?: T; error?: { message: string } } },
  retry: () => Promise<unknown>,
): Promise<{ value: T; repairs: number }> {
  const first = schema.safeParse(raw);
  if (first.success) return { value: first.data as T, repairs: 0 };
  const second = schema.safeParse(await retry());
  if (second.success) return { value: second.data as T, repairs: 1 };
  throw new SchemaValidationError(second.error?.message ?? 'provider output failed schema validation');
}

const DEGRADED_MESSAGE =
  'Ahora mismo no puedo procesar tu consulta con seguridad. He dejado constancia y un asesor de Rosillo la revisará. ' +
  'Si es urgente, llama a tu oficina habitual.';

export async function handleClientMessage(
  input: HandleMessageInput,
  deps: PipelineDeps,
): Promise<HandleMessageResult> {
  const ids = deps.ids ?? randomIdFactory();
  const traceId = ids.trace();
  const timeoutMs = deps.providerTimeoutMs ?? PROVIDER_TIMEOUT_MS;
  const language = input.language ?? 'es';
  const started = Date.now();

  // ── Stage 1: pre-processing ────────────────────────────────────────────────
  const rateLimiter = deps.rateLimiter;
  if (rateLimiter) {
    const check = rateLimiter.check(input.accountId, Date.parse(input.now));
    if (!check.allowed) {
      await deps.store.appendAudit({
        occurredAt: input.now,
        actor: { type: 'CLIENT', id: input.accountId },
        action: 'RATE_LIMIT_APPLIED',
        resource: { type: 'account', id: input.accountId },
        purposeCode: 'SECURITY_CONTROL',
        traceId,
        modelRunId: null,
        beforeHash: null,
        afterHash: null,
        metadata: { retryAfterMs: check.retryAfterMs },
      });
      return {
        ok: false,
        errorCode: 'RATE_LIMITED',
        detail: `retry after ${check.retryAfterMs}ms`,
        traceId,
        clientMessage: 'Has enviado muchos mensajes seguidos. Espera un momento y vuelve a intentarlo.',
      };
    }
  }

  if (input.message.length > MAX_MESSAGE_CHARS) {
    return {
      ok: false,
      errorCode: 'MESSAGE_TOO_LONG',
      detail: `message exceeds ${MAX_MESSAGE_CHARS} characters`,
      traceId,
      clientMessage: 'El mensaje es demasiado largo. ¿Puedes resumirlo o dividirlo en dos?',
    };
  }

  const attachments = input.attachments ?? [];
  if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return {
      ok: false,
      errorCode: 'TOO_MANY_ATTACHMENTS',
      detail: `more than ${MAX_ATTACHMENTS_PER_MESSAGE} attachments`,
      traceId,
      clientMessage: `Puedes adjuntar como máximo ${MAX_ATTACHMENTS_PER_MESSAGE} archivos por mensaje.`,
    };
  }
  // Unsupported or oversized files are quarantined rather than processed.
  const rejectedAttachments = attachments
    .filter((a) => !isAllowedMimeType(a.mimeType) || a.sizeBytes > MAX_ATTACHMENT_BYTES)
    .map((a) => a.filename);
  const acceptedAttachments = attachments.filter((a) => !rejectedAttachments.includes(a.filename));

  const wrapped = wrapUntrusted(input.message, {
    sourceType: 'CLIENT_STATEMENT',
    sourceId: input.conversationId,
    label: 'Mensaje del cliente',
  });

  await deps.store.appendAudit({
    occurredAt: input.now,
    actor: { type: 'CLIENT', id: input.accountId },
    action: 'MESSAGE_RECEIVED',
    resource: { type: 'conversation', id: input.conversationId },
    purposeCode: 'CLIENT_SELF_SERVICE',
    traceId,
    modelRunId: null,
    beforeHash: null,
    afterHash: null,
    metadata: {
      messageLength: input.message.length,
      attachments: acceptedAttachments.length,
      rejectedAttachments: rejectedAttachments.length,
    },
  });

  if (wrapped.injectionDetected) {
    await deps.store.appendAudit({
      occurredAt: input.now,
      actor: { type: 'SYSTEM', id: 'orchestration' },
      action: 'PROMPT_INJECTION_DETECTED',
      resource: { type: 'conversation', id: input.conversationId },
      purposeCode: 'SECURITY_CONTROL',
      traceId,
      modelRunId: null,
      beforeHash: null,
      afterHash: null,
      // Matched fragments only — never the whole message.
      metadata: { matches: wrapped.injectionMatches.slice(0, 5) },
    });
  }

  // A conversation belongs to exactly one account. `ensureConversation` already
  // refuses to open somebody else's, but the check is repeated here so a caller that
  // reaches the pipeline directly cannot append to, or read history from, a thread
  // it does not own (blueprint §15.1 — authorisation on every request, not at one
  // convenient boundary).
  const conversation = await deps.store.getConversation(input.conversationId);
  if (conversation && conversation.accountId !== input.accountId) {
    await deps.store.appendAudit({
      occurredAt: input.now,
      actor: { type: 'CLIENT', id: input.accountId },
      action: 'ACCESS_DENIED',
      resource: { type: 'conversation', id: input.conversationId },
      purposeCode: 'SECURITY_CONTROL',
      traceId,
      modelRunId: null,
      beforeHash: null,
      afterHash: null,
      metadata: { reason: 'conversation belongs to another account' },
    });
    return {
      ok: false,
      errorCode: 'CONVERSATION_NOT_FOUND',
      detail: 'conversation belongs to another account',
      traceId,
      clientMessage: 'No he podido abrir esa conversación. Empieza una nueva y te ayudo desde ahí.',
    };
  }

  // ── Stage 2 & 3: identity, active context, authorised scope ────────────────
  const scope = await computeScope(deps.c360, {
    accountId: input.accountId,
    requestedContext: input.requestedContext,
    on: input.asOf,
  });

  if (scope.partyIds.length === 0) {
    await deps.store.appendAudit({
      occurredAt: input.now,
      actor: { type: 'CLIENT', id: input.accountId },
      action: 'ACCESS_DENIED',
      resource: { type: input.requestedContext.type.toLowerCase(), id: input.requestedContext.id },
      purposeCode: 'SECURITY_CONTROL',
      traceId,
      modelRunId: null,
      beforeHash: null,
      afterHash: null,
      metadata: { requestedContextType: input.requestedContext.type },
    });
    return {
      ok: false,
      errorCode: 'CONTEXT_UNAVAILABLE',
      detail: 'no authority for requested context',
      traceId,
      clientMessage:
        'No puedo mostrar ese contexto con tu sesión actual. Si crees que es un error, un asesor de Rosillo puede revisarlo.',
    };
  }

  await deps.store.appendAudit({
    occurredAt: input.now,
    actor: { type: 'CLIENT', id: input.accountId },
    action: 'SCOPE_COMPUTED',
    resource: { type: 'party', id: scope.activeContext.id },
    purposeCode: 'CLIENT_SELF_SERVICE',
    traceId,
    modelRunId: null,
    beforeHash: null,
    afterHash: null,
    metadata: {
      policies: scope.policyIds.length,
      claims: scope.claimIds.length,
      documents: scope.documentIds.length,
      viaDelegation: scope.viaDelegation,
      grants: [...scope.appliedGrants],
    },
  });

  // Prior turns give the classifier context. Bounded and wrapped like everything else.
  const history = await deps.store.listMessages(input.conversationId);
  const wrappedHistory = history
    .slice(-6)
    .map(
      (m) =>
        wrapUntrusted(truncate(m.text, 400), {
          sourceType: m.role === 'CLIENT' ? 'CLIENT_STATEMENT' : 'APPROVED_KNOWLEDGE',
          sourceId: m.id,
        }).wrapped,
    );

  try {
    // ── Stage 4: intent classification ───────────────────────────────────────
    const classifyInput = {
      wrappedMessage: wrapped.wrapped,
      allowedIntents: INTENTS,
      wrappedHistory,
      language,
    };
    const classifyStarted = Date.now();
    const classified = await validateWithRepair(
      await withTimeout(deps.provider.classifyIntent(classifyInput), timeoutMs, 'classifyIntent'),
      intentClassificationSchema,
      () => withTimeout(deps.provider.classifyIntent(classifyInput), timeoutMs, 'classifyIntent (repair)'),
    );
    const intent: Intent = classified.value.intent;

    await recordRun(deps, {
      runId: ids.run(),
      traceId,
      startedAt: input.now,
      provider: deps.provider.name,
      model: deps.provider.model,
      promptVersions: deps.provider.promptVersions,
      stage: 'classifyIntent',
      inputHash: sha256(input.message),
      outputHash: sha256(JSON.stringify(classified.value)),
      policyVerdict: 'ALLOWED',
      policyReason: null,
      schemaValid: true,
      repairs: classified.repairs,
      latencyMs: Date.now() - classifyStarted,
      inputTokens: null,
      outputTokens: null,
      errorCode: null,
    });

    await deps.store.appendAudit({
      occurredAt: input.now,
      actor: { type: 'SYSTEM', id: 'orchestration' },
      action: 'INTENT_CLASSIFIED',
      resource: { type: 'conversation', id: input.conversationId },
      purposeCode: 'AI_ORCHESTRATION',
      traceId,
      modelRunId: null,
      beforeHash: null,
      afterHash: null,
      metadata: { intent, confidence: classified.value.confidence },
    });

    // ── Stage 5: retrieval plan ──────────────────────────────────────────────
    // Earlier client turns join the term extraction. A follow-up rarely repeats its
    // subject — "¿y la del coche?" is a whole question to a person and an empty one
    // to a term extractor — and the scope was fixed at stage 3, so carrying words
    // forward can only reorder matches inside what this client may already read.
    const plan = planRetrieval(intent, input.message, {
      priorClientTurns: history.filter((m) => m.role === 'CLIENT').map((m) => m.text),
    });
    await deps.store.appendAudit({
      occurredAt: input.now,
      actor: { type: 'SYSTEM', id: 'orchestration' },
      action: 'RETRIEVAL_PLANNED',
      resource: { type: 'conversation', id: input.conversationId },
      purposeCode: 'EVIDENCE_RETRIEVAL',
      traceId,
      modelRunId: null,
      beforeHash: null,
      afterHash: null,
      metadata: { sources: [...plan.sources], terms: plan.terms.slice(0, 10) },
    });

    // ── Stage 6: evidence retrieval ──────────────────────────────────────────
    const retrieval = await retrieveEvidence({
      c360: deps.c360,
      scope,
      plan,
      message: input.message,
      asOf: input.asOf,
    });

    await deps.store.appendAudit({
      occurredAt: input.now,
      actor: { type: 'SYSTEM', id: 'orchestration' },
      action: 'EVIDENCE_RETRIEVED',
      resource: { type: 'conversation', id: input.conversationId },
      purposeCode: 'EVIDENCE_RETRIEVAL',
      traceId,
      modelRunId: null,
      beforeHash: null,
      afterHash: null,
      // Source ids only — never the passages themselves.
      metadata: {
        candidates: retrieval.candidates.length,
        sourceIds: retrieval.readSourceIds.slice(0, 20),
        insufficient: retrieval.insufficient,
        conflicts: retrieval.conflicts.length,
      },
    });

    // ── Stage 7: draft the answer ────────────────────────────────────────────
    const candidateViews: EvidenceCandidateView[] = retrieval.candidates.map((candidate, index) => ({
      index,
      label: candidate.reference.label,
      tier: candidate.reference.tier,
      content: candidate.content,
      stale: candidate.stale,
      conflict: candidate.conflict,
      // Absent means the holder was not established for that record type, which is
      // not the same as "the client's own" and must not be reported as it.
      viaDelegation: candidate.viaDelegation === true,
    }));
    const permittedActionCodes = INTENT_ACTIONS[intent];

    const draftInput = {
      intent,
      wrappedMessage: wrapped.wrapped,
      // The same bounded, wrapped turns the classifier sees. A reply that cannot read
      // the thread has to ask the client to repeat themselves, which is the opposite
      // of what this product is for.
      wrappedHistory,
      language,
      candidates: candidateViews,
      evidenceInsufficient: retrieval.insufficient,
      insufficiencyReasons: retrieval.insufficiencyReasons,
      conflicts: retrieval.conflicts,
      staleSources: retrieval.staleSources,
      permittedActionCodes,
      organisationContext: scope.activeContext.type === 'ORGANISATION',
      contextLabel: scope.activeContext.label,
    };
    const draftStarted = Date.now();
    const drafted = await validateWithRepair<ConciergeDraft>(
      await withTimeout(deps.provider.draftAnswer(draftInput), timeoutMs, 'draftAnswer'),
      conciergeDraftSchema,
      () => withTimeout(deps.provider.draftAnswer(draftInput), timeoutMs, 'draftAnswer (repair)'),
    );

    // ── Stage 8: policy enforcement ──────────────────────────────────────────
    const policy = enforcePolicy({
      draft: drafted.value,
      intent,
      candidateReferences: retrieval.candidates.map((c) => c.reference),
      evidenceInsufficient: retrieval.insufficient,
      insufficiencyReasons: retrieval.insufficiencyReasons,
      conflicts: retrieval.conflicts,
      staleSources: retrieval.staleSources,
      relevantPolicyIds: retrieval.policies.map((p) => p.id),
      injectionDetected: wrapped.injectionDetected,
      language,
    });

    await recordRun(deps, {
      runId: ids.run(),
      traceId,
      startedAt: input.now,
      provider: deps.provider.name,
      model: deps.provider.model,
      promptVersions: deps.provider.promptVersions,
      stage: 'draftAnswer',
      inputHash: sha256(JSON.stringify({ intent, candidates: candidateViews.length })),
      outputHash: sha256(JSON.stringify(policy)),
      policyVerdict: policy.verdict,
      policyReason: policy.reason,
      schemaValid: true,
      repairs: drafted.repairs,
      latencyMs: Date.now() - draftStarted,
      inputTokens: null,
      outputTokens: null,
      errorCode: null,
    });

    for (const blocked of policy.blockedActionCodes) {
      await deps.store.appendAudit({
        occurredAt: input.now,
        actor: { type: 'SYSTEM', id: 'orchestration' },
        action: 'PROHIBITED_ACTION_BLOCKED',
        resource: { type: 'conversation', id: input.conversationId },
        purposeCode: 'SECURITY_CONTROL',
        traceId,
        modelRunId: null,
        beforeHash: null,
        afterHash: null,
        metadata: { code: blocked, intent },
      });
    }

    await deps.store.appendAudit({
      occurredAt: input.now,
      actor: { type: 'SYSTEM', id: 'orchestration' },
      action: 'POLICY_ENFORCED',
      resource: { type: 'conversation', id: input.conversationId },
      purposeCode: 'AI_ORCHESTRATION',
      traceId,
      modelRunId: null,
      beforeHash: null,
      afterHash: null,
      metadata: {
        verdict: policy.verdict,
        answerType: policy.answerType,
        actions: policy.proposedActions.map((a) => a.code),
        riskFlags: policy.riskFlags,
      },
    });

    // ── Stage 9: present, hand off, audit ────────────────────────────────────
    const response = conciergeResponseSchema.parse({
      responseId: ids.response(),
      conversationId: input.conversationId,
      intent,
      answerType: policy.answerType,
      clientMessage: policy.clientMessage,
      evidence: policy.evidence,
      uncertainty: policy.uncertainty,
      followUpQuestions: drafted.value.followUpQuestions,
      proposedActions: policy.proposedActions,
      humanReviewRequired: policy.humanReviewRequired,
      safetyNotice: policy.safetyNotice,
      dataFreshness: summariseFreshness(policy.evidence, input.asOf, {
        conflicts: retrieval.conflicts.length > 0,
      }),
      operationalNote: policy.operationalNote,
      traceId,
    });

    await deps.store.appendMessage({
      id: ids.message(),
      conversationId: input.conversationId,
      role: 'CLIENT',
      text: input.message,
      createdAt: input.now,
    });
    await deps.store.saveResponse(response);
    await deps.store.appendMessage({
      id: ids.message(),
      conversationId: input.conversationId,
      role: 'ASSISTANT',
      text: response.clientMessage,
      createdAt: input.now,
      responseId: response.responseId,
      answerType: response.answerType,
      traceId,
    });

    // A task is created when the answer proposes one that a person must act on.
    let task: HandoffTask | null = null;
    const taskAction = policy.proposedActions.find(
      (a) => a.code !== 'VIEW_RECORD' && a.code !== 'DOWNLOAD_DOCUMENT',
    );
    if (taskAction) {
      const missingInformation = evaluateMissingInformation({
        intent,
        clientText: [input.message, ...history.filter((m) => m.role === 'CLIENT').map((m) => m.text)].join(' \n '),
        hasAttachments: acceptedAttachments.length > 0,
        resolvedPolicyIds: retrieval.policies.map((p) => p.id),
      });

      task = await createHandoffTask(deps.store, {
        taskId: ids.task(),
        createdAt: input.now,
        clientId: scope.authenticatedPartyId,
        organisationId: scope.activeContext.type === 'ORGANISATION' ? scope.activeContext.id : null,
        conversationId: input.conversationId,
        intent,
        actionCode: taskAction.code,
        clientRequest: input.message,
        requestedOutcome: taskAction.description,
        verifiedFacts: buildVerifiedFacts(retrieval),
        // The client's own words, held apart from anything Rosillo verified.
        clientStatements: [{ text: truncate(input.message, 1000), statedAt: input.now, verified: false }],
        missingInformation,
        relevantPolicyIds: retrieval.policies.map((p) => p.id).slice(0, 20),
        evidence: policy.evidence,
        riskFlags: policy.riskFlags,
        preferredChannel: 'chat',
        conversationSummary: buildSummary(intent, input.message, policy.answerType),
        authorityBasis: scope.authorityBasis,
      });

      if (scope.viaDelegation && !task.riskFlags.includes('DELEGATED_AUTHORITY')) {
        // Recorded on the task so the employee sees how the requester is entitled to act.
        task.riskFlags.push('DELEGATED_AUTHORITY');
        await deps.store.appendTaskVersion(task);
      }

      await deps.store.appendAudit({
        occurredAt: input.now,
        actor: { type: 'SYSTEM', id: 'orchestration' },
        action: 'TASK_CREATED',
        resource: { type: 'task', id: task.taskId },
        purposeCode: 'ADVISER_TASK_PREPARATION',
        traceId,
        modelRunId: null,
        beforeHash: null,
        afterHash: sha256(JSON.stringify(task)),
        metadata: {
          queue: task.employeeQueue,
          action: task.actionCode,
          missingRequired: task.missingInformation.filter((m) => m.severity === 'REQUIRED').length,
        },
      });
    }

    await deps.store.appendAudit({
      occurredAt: input.now,
      actor: { type: 'SYSTEM', id: 'orchestration' },
      action: 'RESPONSE_DELIVERED',
      resource: { type: 'response', id: response.responseId },
      purposeCode: 'CLIENT_SELF_SERVICE',
      traceId,
      modelRunId: null,
      beforeHash: null,
      afterHash: sha256(response.clientMessage),
      metadata: {
        answerType: response.answerType,
        evidenceCount: response.evidence.length,
        humanReviewRequired: response.humanReviewRequired,
        latencyMs: Date.now() - started,
      },
    });

    return { ok: true, response, task, scope, traceId, rejectedAttachments };
  } catch (error) {
    const errorCode =
      error instanceof SchemaValidationError
        ? 'SCHEMA_VALIDATION_FAILED'
        : error instanceof ProviderTimeoutError
          ? 'PROVIDER_TIMEOUT'
          : 'PROVIDER_ERROR';

    await recordRun(deps, {
      runId: ids.run(),
      traceId,
      startedAt: input.now,
      provider: deps.provider.name,
      model: deps.provider.model,
      promptVersions: deps.provider.promptVersions,
      stage: 'pipeline',
      inputHash: sha256(input.message),
      outputHash: null,
      policyVerdict: 'REJECTED',
      policyReason: 'provider failure',
      schemaValid: false,
      repairs: 0,
      latencyMs: Date.now() - started,
      inputTokens: null,
      outputTokens: null,
      errorCode,
    });

    // Degraded mode: the client is told plainly, and the failure is on the record.
    return {
      ok: false,
      errorCode,
      detail: error instanceof Error ? error.message.slice(0, 300) : 'unknown error',
      traceId,
      clientMessage: DEGRADED_MESSAGE,
    };
  }
}

async function recordRun(deps: PipelineDeps, run: AIRun): Promise<void> {
  await deps.store.recordAIRun(run);
}

/** Verified facts for the handoff: values Rosillo can stand behind, with provenance. */
function buildVerifiedFacts(
  retrieval: Awaited<ReturnType<typeof retrieveEvidence>>,
): HandoffTask['verifiedFacts'] {
  const facts: HandoffTask['verifiedFacts'] = {};
  for (const policy of retrieval.policies.slice(0, 5)) {
    const provenance = policy.fieldProvenance['premium'];
    if (!provenance) continue;
    facts[`policy_${policy.policyNumber}`] = {
      value: `${policy.productLabel} — ${policy.insurer} (${policy.policyNumber})`,
      sourceType: provenance.sourceType,
      sourceId: provenance.sourceId,
      sourcePath: 'poliza',
      observedAt: provenance.observedAt,
      confidence: provenance.confidence,
      ...(provenance.conflict ? { conflict: provenance.conflict } : {}),
    };
  }
  return facts;
}

function buildSummary(intent: Intent, message: string, answerType: string): string {
  return truncate(
    `El cliente escribió: "${message}". Clasificado como ${intent}; la respuesta se entregó como ${answerType}.`,
    2000,
  );
}

/** Ensures a conversation exists for an account, creating one if needed. */
export async function ensureConversation(
  deps: PipelineDeps,
  input: { accountId: string; conversationId?: string; contextType: ContextType; contextId: string; now: string },
): Promise<string> {
  const ids = deps.ids ?? randomIdFactory();
  if (input.conversationId) {
    const existing = await deps.store.getConversation(input.conversationId);
    // A conversation only ever belongs to the account that created it.
    if (existing && existing.accountId === input.accountId) return existing.id;
  }
  const created = await deps.store.createConversation({
    id: ids.conversation(),
    accountId: input.accountId,
    contextType: input.contextType,
    contextId: input.contextId,
    title: 'Nueva consulta',
  });
  return created.id;
}

export { emptyScope };
