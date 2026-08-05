import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * Append-only audit events (blueprint §15.4, §12.3).
 *
 * The platform must be able to reconstruct any interaction: who acted, on what, under
 * which purpose, and what the model and rules did. Events are chained by hash so that
 * a deletion or edit in the middle of the log is detectable rather than silent.
 *
 * Metadata is non-sensitive by contract — raw policy, claim and message text never
 * enters an audit event (blueprint §15.2 "no logs containing raw policy/claim text").
 */

export const ACTOR_TYPES = ['CLIENT', 'EMPLOYEE', 'SYSTEM'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

/**
 * Purpose codes make the lawful basis of each access explicit, so an access log can
 * answer "why" and not only "what" (blueprint §12.5).
 */
export const PURPOSE_CODES = [
  'CLIENT_SELF_SERVICE',
  'ADVISER_TASK_PREPARATION',
  'EMPLOYEE_CASE_REVIEW',
  'EVIDENCE_RETRIEVAL',
  'AI_ORCHESTRATION',
  'SECURITY_CONTROL',
  'EVALUATION',
] as const;
export type PurposeCode = (typeof PURPOSE_CODES)[number];

export const AUDIT_ACTIONS = [
  'SESSION_STARTED',
  'SESSION_ENDED',
  'CONTEXT_SWITCHED',
  'MESSAGE_RECEIVED',
  'SCOPE_COMPUTED',
  'INTENT_CLASSIFIED',
  'RETRIEVAL_PLANNED',
  'EVIDENCE_RETRIEVED',
  'AI_RUN_COMPLETED',
  'POLICY_ENFORCED',
  'RESPONSE_DELIVERED',
  'TASK_CREATED',
  'TASK_VIEWED',
  'TASK_DECIDED',
  'DOCUMENT_ACCESSED',
  'ACCESS_DENIED',
  'PROHIBITED_ACTION_BLOCKED',
  'PROMPT_INJECTION_DETECTED',
  'RATE_LIMIT_APPLIED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Values permitted in audit metadata. Objects and free text are refused by design. */
export const nonSensitiveValueSchema = z.union([
  z.string().max(200),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string().max(200)).max(20),
]);

export const auditEventSchema = z.object({
  eventId: z.string().min(1).max(200),
  occurredAt: z.string(),
  actor: z.object({
    type: z.enum(ACTOR_TYPES),
    id: z.string().min(1).max(200),
  }),
  action: z.enum(AUDIT_ACTIONS),
  resource: z.object({
    type: z.string().min(1).max(100),
    id: z.string().min(1).max(200),
  }),
  purposeCode: z.enum(PURPOSE_CODES),
  traceId: z.string().min(1).max(200),
  modelRunId: z.string().max(200).nullable().default(null),
  beforeHash: z.string().max(128).nullable().default(null),
  afterHash: z.string().max(128).nullable().default(null),
  metadata: z.record(z.string(), nonSensitiveValueSchema).default({}),
  /** Hash of the previous event in this log, forming a tamper-evident chain. */
  previousHash: z.string().max(128).nullable().default(null),
  /** Hash of this event's content (excluding this field). */
  eventHash: z.string().max(128),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export type AuditEventInput = Omit<AuditEvent, 'eventId' | 'eventHash' | 'previousHash'>;

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hashEvent(event: Omit<AuditEvent, 'eventHash'>): string {
  return sha256(
    JSON.stringify({
      eventId: event.eventId,
      occurredAt: event.occurredAt,
      actor: event.actor,
      action: event.action,
      resource: event.resource,
      purposeCode: event.purposeCode,
      traceId: event.traceId,
      modelRunId: event.modelRunId,
      beforeHash: event.beforeHash,
      afterHash: event.afterHash,
      metadata: event.metadata,
      previousHash: event.previousHash,
    }),
  );
}

/**
 * An append-only audit log. `append` is the only mutator and there is deliberately
 * no update or delete: history is evidence, and evidence that can be rewritten is
 * not evidence (blueprint §14.4).
 */
export class AuditLog {
  private readonly events: AuditEvent[] = [];
  private lastHash: string | null = null;
  private sequence = 0;

  constructor(private readonly idPrefix = 'evt') {}

  append(input: AuditEventInput): AuditEvent {
    this.sequence += 1;
    const eventId = `${this.idPrefix}_${String(this.sequence).padStart(6, '0')}`;
    const withoutHash = {
      ...auditEventSchema
        .omit({ eventId: true, eventHash: true, previousHash: true })
        .parse(input),
      eventId,
      previousHash: this.lastHash,
    };
    const event: AuditEvent = { ...withoutHash, eventHash: hashEvent(withoutHash) };
    this.events.push(event);
    this.lastHash = event.eventHash;
    return event;
  }

  /** A defensive copy — callers cannot reach in and mutate recorded history. */
  all(): AuditEvent[] {
    return this.events.map((e) => ({ ...e }));
  }

  byTrace(traceId: string): AuditEvent[] {
    return this.all().filter((e) => e.traceId === traceId);
  }

  byResource(type: string, id: string): AuditEvent[] {
    return this.all().filter((e) => e.resource.type === type && e.resource.id === id);
  }

  get length(): number {
    return this.events.length;
  }

  /** Recomputes the chain. Returns the index of the first tampered event, or null. */
  verifyChain(): { valid: boolean; brokenAtIndex: number | null } {
    let previous: string | null = null;
    for (let i = 0; i < this.events.length; i += 1) {
      const event = this.events[i];
      if (!event) continue;
      const { eventHash, ...rest } = event;
      if (rest.previousHash !== previous || hashEvent(rest) !== eventHash) {
        return { valid: false, brokenAtIndex: i };
      }
      previous = eventHash;
    }
    return { valid: true, brokenAtIndex: null };
  }
}

/** Verifies a chain that was read back from storage rather than held in memory. */
export function verifyEventChain(events: AuditEvent[]): { valid: boolean; brokenAtIndex: number | null } {
  let previous: string | null = null;
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (!event) continue;
    const { eventHash, ...rest } = event;
    if (rest.previousHash !== previous || hashEvent(rest) !== eventHash) {
      return { valid: false, brokenAtIndex: i };
    }
    previous = eventHash;
  }
  return { valid: true, brokenAtIndex: null };
}
