import type {
  ActionCode,
  EmployeeDecision,
  HandoffTask,
  MissingItem,
  TaskState,
} from '@rosillo/domain';
import {
  ALLOWED_ACTIONS,
  CLIENT_VISIBLE_STATUS,
  canTransition,
  handoffTaskSchema,
  isProhibitedAction,
  queueForAction,
} from '@rosillo/domain';
import type { PlatformStore } from '@rosillo/store';
import { hasOutstandingRequired } from './rules/missingInfo';

/**
 * @rosillo/actions — the approved-action state machine.
 *
 * A task moves only along legal transitions, an employee decision is appended as a
 * new immutable version rather than replacing the old one, and closing a task with
 * required information still outstanding demands a recorded override reason
 * (blueprint §6.1 control boundary).
 *
 * Nothing here can send an email, call an insurer, or write to a system of record.
 * That is enforced by the absence of any such capability, not by a flag.
 */

export * from './rules/missingInfo';

export class ProhibitedActionError extends Error {
  constructor(readonly code: string) {
    super(`Action ${code} is prohibited and cannot be executed by this platform.`);
    this.name = 'ProhibitedActionError';
  }
}

export class IllegalTransitionError extends Error {
  constructor(from: TaskState, to: TaskState) {
    super(`Illegal task transition ${from} → ${to}`);
    this.name = 'IllegalTransitionError';
  }
}

/**
 * Final gate before a task is created. Called even though the policy layer has
 * already filtered the action — defence in depth is the point (blueprint §10.2).
 */
export function assertActionPermitted(code: string): asserts code is ActionCode {
  if (isProhibitedAction(code)) throw new ProhibitedActionError(code);
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_ACTIONS, code)) {
    throw new ProhibitedActionError(code);
  }
}

export interface CreateTaskInput {
  taskId: string;
  createdAt: string;
  clientId: string;
  organisationId: string | null;
  conversationId: string;
  intent: HandoffTask['intent'];
  actionCode: string;
  clientRequest: string;
  requestedOutcome: string;
  verifiedFacts: HandoffTask['verifiedFacts'];
  clientStatements: HandoffTask['clientStatements'];
  missingInformation: MissingItem[];
  relevantPolicyIds: string[];
  evidence: HandoffTask['evidence'];
  riskFlags: HandoffTask['riskFlags'];
  preferredChannel: HandoffTask['preferredChannel'];
  conversationSummary: string;
  authorityBasis: string;
}

/** Creates and persists a handoff task. Validates through the schema before storing. */
export async function createHandoffTask(store: PlatformStore, input: CreateTaskInput): Promise<HandoffTask> {
  assertActionPermitted(input.actionCode);
  const task = handoffTaskSchema.parse({
    ...input,
    employeeQueue: queueForAction(input.actionCode),
    dueAt: null,
    state: 'OPEN' satisfies TaskState,
    externalActionAllowed: false,
  });
  return store.createTask(task);
}

export interface ApplyDecisionInput {
  taskId: string;
  employeeId: string;
  decidedAt: string;
  decision: EmployeeDecision['decision'];
  edits: Record<string, string>;
  note: string;
  overrideReason: string;
}

const DECISION_TARGET_STATE: Record<EmployeeDecision['decision'], TaskState> = {
  APPROVE: 'APPROVED',
  APPROVE_WITH_EDITS: 'EDITED_AND_APPROVED',
  REJECT: 'REJECTED',
  ESCALATE: 'ESCALATED',
};

export interface DecisionResult {
  task: HandoffTask;
  decision: EmployeeDecision;
  clientVisibleStatus: string;
}

/**
 * Applies an employee decision.
 *
 * The task moves to a new state, a new immutable version is appended, and the
 * decision is recorded separately. Edits are applied to `verifiedFacts` — an
 * employee correcting a fact promotes it to `CLIENT_STATEMENT`-free, human-verified
 * provenance, which is exactly the record an audit needs to show who confirmed what.
 */
export async function applyEmployeeDecision(
  store: PlatformStore,
  input: ApplyDecisionInput,
): Promise<DecisionResult> {
  const stored = await store.getTask(input.taskId);
  if (!stored) throw new Error(`Unknown task ${input.taskId}`);

  const target = DECISION_TARGET_STATE[input.decision];
  // Move OPEN → IN_REVIEW implicitly: opening a task to decide on it *is* review.
  const from = stored.task.state === 'OPEN' ? 'IN_REVIEW' : stored.task.state;
  if (stored.task.state === 'OPEN' && !canTransition('OPEN', 'IN_REVIEW')) {
    throw new IllegalTransitionError('OPEN', 'IN_REVIEW');
  }
  if (!canTransition(from, target)) throw new IllegalTransitionError(from, target);

  // A decision that finishes the task while required items are outstanding needs a
  // reason on the record. Rejection and escalation are legitimate ways to stop.
  const closing = target === 'APPROVED' || target === 'EDITED_AND_APPROVED';
  if (closing && hasOutstandingRequired(stored.task.missingInformation) && input.overrideReason.trim().length === 0) {
    throw new Error(
      'Faltan datos obligatorios: se requiere un motivo de excepción para aprobar esta tarea.',
    );
  }

  const verifiedFacts = { ...stored.task.verifiedFacts };
  for (const [field, value] of Object.entries(input.edits)) {
    const existing = verifiedFacts[field];
    verifiedFacts[field] = {
      value,
      // An employee edit is itself a source: a person at Rosillo confirmed it.
      sourceType: 'APPROVED_KNOWLEDGE',
      sourceId: `employee:${input.employeeId}`,
      sourcePath: field,
      observedAt: input.decidedAt,
      confidence: 1,
      ...(existing?.effectiveFrom !== undefined ? { effectiveFrom: existing.effectiveFrom } : {}),
      ...(existing?.effectiveTo !== undefined ? { effectiveTo: existing.effectiveTo } : {}),
    };
  }

  const clientVisibleStatus = CLIENT_VISIBLE_STATUS[target];
  const updated = handoffTaskSchema.parse({
    ...stored.task,
    verifiedFacts,
    state: target,
    externalActionAllowed: false,
  });

  await store.appendTaskVersion(updated);
  const decision: EmployeeDecision = {
    taskId: input.taskId,
    employeeId: input.employeeId,
    decidedAt: input.decidedAt,
    decision: input.decision,
    edits: input.edits,
    note: input.note,
    overrideReason: input.overrideReason,
    clientVisibleStatus,
  };
  await store.recordDecision(decision);

  return { task: updated, decision, clientVisibleStatus };
}

/** Moves a task to IN_REVIEW when an employee opens it. Idempotent. */
export async function claimTask(store: PlatformStore, taskId: string): Promise<HandoffTask> {
  const stored = await store.getTask(taskId);
  if (!stored) throw new Error(`Unknown task ${taskId}`);
  if (stored.task.state !== 'OPEN') return stored.task;
  const updated = handoffTaskSchema.parse({ ...stored.task, state: 'IN_REVIEW', externalActionAllowed: false });
  await store.appendTaskVersion(updated);
  return updated;
}

/** The status text the client sees for a task, derived from its state. */
export function clientStatusFor(task: HandoffTask): string {
  return CLIENT_VISIBLE_STATUS[task.state];
}
