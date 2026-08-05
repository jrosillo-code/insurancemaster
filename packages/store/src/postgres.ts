import postgres from 'postgres';
import type { AuditEvent, AuditEventInput } from '@rosillo/audit';
import { buildAuditEvent, verifyEventChain } from '@rosillo/audit';
import type { AIRun, ConciergeResponse, EmployeeDecision, HandoffTask, TaskState } from '@rosillo/domain';
import type { SessionKind, SessionRecord, SessionRegistry } from '@rosillo/auth';
import { newSessionId } from '@rosillo/auth';
import type { Conversation, ConversationMessage, PlatformStore, StoredTask } from './index';
import { conversationTitle } from './index';

/**
 * PostgreSQL persistence, for a deployment where the filesystem is not shared and
 * does not survive (ADR-0011 supersedes the JSONL store for anything hosted).
 *
 * The JSONL store works because both applications run on one machine and share a
 * directory. On a serverless host neither is true: instances come and go, and two
 * requests may not even land on the same machine. Postgres is what makes the handoff
 * work — and it makes the audit chain *safer* than the file lock did, because
 * `pg_advisory_xact_lock` plus a transaction is a real mutex rather than a lock file
 * with a stale-detection heuristic.
 *
 * Rows keep the full validated object as JSONB and promote to columns only what is
 * filtered or ordered on. The Zod schemas in `@rosillo/domain` stay the single source
 * of truth for shape; mirroring every field here would create a second one.
 */

/** Namespaced so the audit lock cannot collide with anything else in the database. */
const AUDIT_LOCK_KEY = 0x5205_11_0a;

export interface PostgresStoreOptions {
  /** Postgres connection string. Supabase: use the pooler URI for serverless. */
  connectionString?: string;
  /**
   * Connections per instance. One is right for serverless — a function handles one
   * request at a time, and a larger pool just exhausts the shared pooler faster.
   */
  max?: number;
  /**
   * Supabase's transaction pooler does not support prepared statements. Left on for
   * a direct connection, where they are worth having.
   */
  prepare?: boolean;
}

export class MissingConnectionStringError extends Error {
  constructor() {
    super(
      'DATABASE_URL is not set, so the Postgres store cannot start. ' +
        'Use the Supabase connection string, or leave ROSILLO_STORE unset to use the local JSONL store.',
    );
    this.name = 'MissingConnectionStringError';
  }
}

type Sql = ReturnType<typeof postgres>;

export class PostgresStore implements PlatformStore {
  private readonly sql: Sql;

  constructor(options: PostgresStoreOptions = {}) {
    const connectionString = options.connectionString ?? process.env['DATABASE_URL'];
    if (!connectionString) throw new MissingConnectionStringError();

    // A pooled connection string (Supabase port 6543) rules out prepared statements.
    const pooled = /[:.]6543|pooler\./.test(connectionString);
    this.sql = postgres(connectionString, {
      max: options.max ?? 1,
      prepare: options.prepare ?? !pooled,
      idle_timeout: 20,
      connect_timeout: 10,
      // Serverless hosts terminate idle sockets; reconnecting is normal, not an error.
      onnotice: () => {},
    });
  }

  /** Releases the pool. Tests call this; a serverless instance simply exits. */
  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  /**
   * Session records, over this store's connection pool.
   *
   * Sharing the pool matters more than tidiness here: a second pool would double the
   * connections every serverless instance opens, against a Postgres that counts them.
   */
  sessionRegistry(): SessionRegistry {
    return new PostgresSessionRegistry(this.sql);
  }

  // ── Conversations ─────────────────────────────────────────────────────────

  async createConversation(input: Omit<Conversation, 'createdAt' | 'updatedAt'>): Promise<Conversation> {
    const now = new Date().toISOString();
    const conversation: Conversation = { ...input, createdAt: now, updatedAt: now };
    await this.sql`
      insert into conversations (id, account_id, context_type, context_id, title, created_at, updated_at)
      values (${conversation.id}, ${conversation.accountId}, ${conversation.contextType},
              ${conversation.contextId}, ${conversation.title}, ${now}, ${now})
      on conflict (id) do nothing
    `;
    return conversation;
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    const rows = await this.sql`select * from conversations where id = ${conversationId}`;
    const row = rows[0];
    return row ? toConversation(row) : null;
  }

  async listConversations(accountId: string): Promise<Conversation[]> {
    const rows = await this.sql`
      select * from conversations where account_id = ${accountId} order by updated_at desc
    `;
    return rows.map(toConversation);
  }

  async appendMessage(message: ConversationMessage): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx`
        insert into messages (id, conversation_id, role, body, created_at)
        values (${message.id}, ${message.conversationId}, ${message.role},
                ${tx.json(message as never)}, ${message.createdAt})
        on conflict (id) do nothing
      `;

      // The first thing the client said becomes the title, so the history list is
      // navigable rather than a column of "Nueva consulta".
      const priorClientMessages = await tx`
        select count(*)::int as count from messages
        where conversation_id = ${message.conversationId} and role = 'CLIENT' and id <> ${message.id}
      `;
      const isFirstFromClient = message.role === 'CLIENT' && (priorClientMessages[0]?.count ?? 0) === 0;

      if (isFirstFromClient) {
        await tx`
          update conversations
          set updated_at = ${message.createdAt}, title = ${conversationTitle(message.text)}
          where id = ${message.conversationId}
        `;
      } else {
        await tx`
          update conversations set updated_at = ${message.createdAt} where id = ${message.conversationId}
        `;
      }
    });
  }

  async listMessages(conversationId: string): Promise<ConversationMessage[]> {
    const rows = await this.sql`
      select body from messages where conversation_id = ${conversationId} order by seq asc
    `;
    return rows.map((row) => row['body'] as ConversationMessage);
  }

  // ── Responses ─────────────────────────────────────────────────────────────

  async saveResponse(response: ConciergeResponse): Promise<void> {
    await this.sql`
      insert into responses (response_id, conversation_id, trace_id, body)
      values (${response.responseId}, ${response.conversationId}, ${response.traceId},
              ${this.sql.json(response as never)})
      on conflict (response_id) do nothing
    `;
  }

  async getResponse(responseId: string): Promise<ConciergeResponse | null> {
    const rows = await this.sql`select body from responses where response_id = ${responseId}`;
    return (rows[0]?.['body'] as ConciergeResponse | undefined) ?? null;
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────

  async createTask(task: HandoffTask): Promise<HandoffTask> {
    await this.writeTaskVersion(task);
    return task;
  }

  async appendTaskVersion(task: HandoffTask): Promise<void> {
    await this.writeTaskVersion(task);
  }

  private async writeTaskVersion(task: HandoffTask): Promise<void> {
    await this.sql`
      insert into task_versions (task_id, conversation_id, client_id, employee_queue, state, body)
      values (${task.taskId}, ${task.conversationId}, ${task.clientId},
              ${task.employeeQueue}, ${task.state}, ${this.sql.json(task as never)})
    `;
  }

  async getTask(taskId: string): Promise<StoredTask | null> {
    const [versionRows, decisionRows] = await Promise.all([
      this.sql`select body from task_versions where task_id = ${taskId} order by seq asc`,
      this.sql`select body from decisions where task_id = ${taskId} order by seq asc`,
    ]);
    if (versionRows.length === 0) return null;

    const versions = versionRows.map((row) => row['body'] as HandoffTask);
    const current = versions[versions.length - 1];
    if (!current) return null;
    return {
      task: current,
      versions,
      decisions: decisionRows.map((row) => row['body'] as EmployeeDecision),
    };
  }

  async listTasks(filter: { queue?: string; state?: TaskState; clientId?: string } = {}): Promise<HandoffTask[]> {
    // Only the newest version of each task is the task. `distinct on` gives that in
    // one pass; filtering happens after, so a task that has *moved into* the filtered
    // state is matched on its current state rather than on any version it ever had.
    const rows = await this.sql`
      select distinct on (task_id) task_id, body
      from task_versions
      order by task_id, seq desc
    `;
    return rows
      .map((row) => row['body'] as HandoffTask)
      .filter((task) => (filter.queue ? task.employeeQueue === filter.queue : true))
      .filter((task) => (filter.state ? task.state === filter.state : true))
      .filter((task) => (filter.clientId ? task.clientId === filter.clientId : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listTasksForConversation(conversationId: string): Promise<HandoffTask[]> {
    const rows = await this.sql`
      select distinct on (task_id) task_id, body
      from task_versions
      where conversation_id = ${conversationId}
      order by task_id, seq desc
    `;
    return rows.map((row) => row['body'] as HandoffTask);
  }

  async recordDecision(decision: EmployeeDecision): Promise<void> {
    await this.sql`
      insert into decisions (task_id, employee_id, decided_at, body)
      values (${decision.taskId}, ${decision.employeeId}, ${decision.decidedAt},
              ${this.sql.json(decision as never)})
    `;
  }

  // ── AI runs ───────────────────────────────────────────────────────────────

  async recordAIRun(run: AIRun): Promise<void> {
    await this.sql`
      insert into ai_runs (run_id, trace_id, started_at, body)
      values (${run.runId}, ${run.traceId}, ${run.startedAt}, ${this.sql.json(run as never)})
      on conflict (run_id) do nothing
    `;
  }

  async listAIRuns(traceId: string): Promise<AIRun[]> {
    const rows = await this.sql`select body from ai_runs where trace_id = ${traceId} order by started_at asc`;
    return rows.map((row) => row['body'] as AIRun);
  }

  // ── Audit ─────────────────────────────────────────────────────────────────

  /**
   * Appends one chained event.
   *
   * The previous hash comes from the current head, so this is a read-then-write and
   * two concurrent callers would otherwise both claim the same predecessor and fork
   * the chain. A transaction-scoped advisory lock serialises it across every
   * connection and every instance — the property the file lock could only approximate
   * on a single machine, and the reason a hosted deployment needs this store.
   */
  async appendAudit(input: AuditEventInput): Promise<AuditEvent> {
    return this.sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`;

      const headRows = await tx`select event_hash from audit_events order by seq desc limit 1`;
      const countRows = await tx`select count(*)::int as count from audit_events`;
      const previousHash = (headRows[0]?.['event_hash'] as string | undefined) ?? null;
      const position = (countRows[0]?.['count'] as number | undefined) ?? 0;

      const event = buildAuditEvent(input, previousHash, `evt_${String(position + 1).padStart(6, '0')}`);

      await tx`
        insert into audit_events (
          event_id, occurred_at, actor_type, actor_id, action,
          resource_type, resource_id, purpose_code, trace_id, model_run_id,
          before_hash, after_hash, metadata, previous_hash, event_hash, body
        ) values (
          ${event.eventId}, ${event.occurredAt}, ${event.actor.type}, ${event.actor.id}, ${event.action},
          ${event.resource.type}, ${event.resource.id}, ${event.purposeCode}, ${event.traceId}, ${event.modelRunId},
          ${event.beforeHash}, ${event.afterHash}, ${tx.json(event.metadata as never)},
          ${event.previousHash}, ${event.eventHash}, ${tx.json(event as never)}
        )
      `;
      return event;
    }) as Promise<AuditEvent>;
  }

  async listAudit(
    filter: { traceId?: string; resourceType?: string; resourceId?: string } = {},
  ): Promise<AuditEvent[]> {
    const rows = await this.sql`
      select body from audit_events
      where (${filter.traceId ?? null}::text is null or trace_id = ${filter.traceId ?? null})
        and (${filter.resourceType ?? null}::text is null or resource_type = ${filter.resourceType ?? null})
        and (${filter.resourceId ?? null}::text is null or resource_id = ${filter.resourceId ?? null})
      order by seq asc
    `;
    return rows.map((row) => row['body'] as AuditEvent);
  }

  async verifyAuditChain(): Promise<{ valid: boolean; brokenAtIndex: number | null }> {
    const rows = await this.sql`select body from audit_events order by seq asc`;
    return verifyEventChain(rows.map((row) => row['body'] as AuditEvent));
  }
}

function toConversation(row: postgres.Row): Conversation {
  return {
    id: row['id'] as string,
    accountId: row['account_id'] as string,
    contextType: row['context_type'] as Conversation['contextType'],
    contextId: row['context_id'] as string,
    title: row['title'] as string,
    createdAt: toIso(row['created_at']),
    updatedAt: toIso(row['updated_at']),
  };
}

/** Postgres returns `timestamptz` as a Date; the application speaks ISO strings. */
function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}


/**
 * Server-side session records in Postgres, so revocation holds across instances.
 *
 * The in-memory registry is correct for one process and useless for a serverless
 * deployment: revoking a session on the instance that happened to serve the sign-out
 * leaves it valid on every other one.
 */
export class PostgresSessionRegistry implements SessionRegistry {
  constructor(private readonly sql: Sql) {}

  async issue(input: {
    kind: SessionKind;
    subjectId: string;
    expiresAt: number;
    now: string;
  }): Promise<SessionRecord> {
    const record: SessionRecord = {
      sessionId: newSessionId(),
      kind: input.kind,
      subjectId: input.subjectId,
      createdAt: input.now,
      expiresAt: input.expiresAt,
      revokedAt: null,
      revokedReason: null,
    };
    await this.sql`
      insert into sessions (session_id, kind, subject_id, created_at, expires_at)
      values (${record.sessionId}, ${record.kind}, ${record.subjectId}, ${record.createdAt}, ${record.expiresAt})
    `;
    return record;
  }

  async active(sessionId: string, nowSeconds: number): Promise<SessionRecord | null> {
    // Revocation and expiry are both checked in SQL, so a caller cannot forget one.
    const rows = await this.sql`
      select * from sessions
      where session_id = ${sessionId} and revoked_at is null and expires_at > ${nowSeconds}
    `;
    const row = rows[0];
    return row ? toSessionRecord(row) : null;
  }

  async revoke(sessionId: string, reason: string, now: string): Promise<void> {
    await this.sql`
      update sessions set revoked_at = ${now}, revoked_reason = ${reason}
      where session_id = ${sessionId} and revoked_at is null
    `;
  }

  async revokeAllForSubject(subjectId: string, reason: string, now: string): Promise<number> {
    const rows = await this.sql`
      update sessions set revoked_at = ${now}, revoked_reason = ${reason}
      where subject_id = ${subjectId} and revoked_at is null
      returning session_id
    `;
    return rows.length;
  }

  async prune(nowSeconds: number): Promise<number> {
    // Only rows that can no longer authorise anything. A revoked-but-unexpired record
    // is kept: it is the evidence that the session was ended deliberately.
    const rows = await this.sql`
      delete from sessions where expires_at <= ${nowSeconds} returning session_id
    `;
    return rows.length;
  }
}

function toSessionRecord(row: postgres.Row): SessionRecord {
  return {
    sessionId: row['session_id'] as string,
    kind: row['kind'] as SessionKind,
    subjectId: row['subject_id'] as string,
    createdAt: toIso(row['created_at']),
    expiresAt: Number(row['expires_at']),
    revokedAt: row['revoked_at'] ? toIso(row['revoked_at']) : null,
    revokedReason: (row['revoked_reason'] as string | null) ?? null,
  };
}
