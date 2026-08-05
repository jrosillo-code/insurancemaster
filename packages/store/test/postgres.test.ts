import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresStore } from '../src/postgres';
import { InMemoryStore } from '../src/index';
import type { PlatformStore } from '../src/index';
import { verifyEventChain } from '@rosillo/audit';
import type { HandoffTask } from '@rosillo/domain';

/**
 * The Postgres store, against a real database.
 *
 * Skipped unless `TEST_DATABASE_URL` is set, because a store test that mocks the
 * database tests the mock. `npm run db:test` starts a throwaway Postgres and sets it.
 *
 * The point of these is not that SQL works. It is that the *port* behaves identically
 * to the in-memory implementation the rest of the platform is tested against — and
 * that the two properties the JSONL store had to work for get stronger, not weaker:
 * append-only history, and an audit chain that cannot fork under concurrency.
 */

const CONNECTION = process.env['TEST_DATABASE_URL'];
const describeIfDb = CONNECTION ? describe : describe.skip;

const MIGRATION = resolve(__dirname, '../../../supabase/migrations/0001_platform_schema.sql');

// Typed against the domain contract, so a change to HandoffTask breaks this file
// rather than being silently widened away by the spread.
function task(overrides: Partial<HandoffTask> = {}): HandoffTask {
  return {
    taskId: 'task_1',
    createdAt: '2026-08-05T09:00:00.000Z',
    clientId: 'party_ana',
    organisationId: null,
    conversationId: 'conv_1',
    intent: 'CANCELLATION_REQUEST' as const,
    actionCode: 'PREPARE_CANCELLATION' as const,
    clientRequest: 'Quiero dar de baja el seguro del coche.',
    requestedOutcome: 'Preparar la baja',
    verifiedFacts: {},
    clientStatements: [],
    missingInformation: [],
    relevantPolicyIds: ['pol_ana_auto'],
    evidence: [],
    riskFlags: [],
    preferredChannel: 'chat' as const,
    conversationSummary: 'Baja de auto',
    authorityBasis: 'Titular',
    employeeQueue: 'atencion-cliente',
    dueAt: null,
    state: 'OPEN' as const,
    externalActionAllowed: false as const,
    ...overrides,
  };
}

function auditInput(id: string) {
  return {
    occurredAt: '2026-08-05T09:00:00.000Z',
    actor: { type: 'SYSTEM' as const, id },
    action: 'SESSION_STARTED' as const,
    resource: { type: 'test', id },
    purposeCode: 'SECURITY_CONTROL' as const,
    traceId: 'trace_1',
    modelRunId: null,
    beforeHash: null,
    afterHash: null,
    metadata: {},
  };
}

describeIfDb('PostgresStore', () => {
  let store: PostgresStore;

  beforeAll(async () => {
    // A clean schema each run: these tests assert on counts and on chain position.
    execFileSync('psql', [CONNECTION as string, '-v', 'ON_ERROR_STOP=1', '-q', '-c', SCHEMA_RESET], {
      stdio: 'pipe',
    });
    execFileSync('psql', [CONNECTION as string, '-v', 'ON_ERROR_STOP=1', '-q', '-f', MIGRATION], { stdio: 'pipe' });
    store = new PostgresStore({ connectionString: CONNECTION });
  });

  afterAll(async () => {
    await store?.close();
  });

  it('round-trips a conversation and titles it from the first client message', async () => {
    await store.createConversation({
      id: 'conv_1',
      accountId: 'acc_ana',
      contextType: 'PERSON',
      contextId: 'party_ana',
      title: 'Nueva consulta',
    });

    await store.appendMessage({
      id: 'msg_1',
      conversationId: 'conv_1',
      role: 'CLIENT',
      text: '¿Cuál es la franquicia de mi coche?',
      createdAt: '2026-08-05T09:00:00.000Z',
    });
    await store.appendMessage({
      id: 'msg_2',
      conversationId: 'conv_1',
      role: 'ASSISTANT',
      text: 'La franquicia es de 300 €.',
      createdAt: '2026-08-05T09:00:01.000Z',
    });

    const conversation = await store.getConversation('conv_1');
    expect(conversation?.title).toBe('¿Cuál es la franquicia de mi coche?');
    expect(conversation?.accountId).toBe('acc_ana');

    const messages = await store.listMessages('conv_1');
    expect(messages.map((m) => m.id)).toEqual(['msg_1', 'msg_2']);
    // Ordering is by insertion sequence, not timestamp: two messages in one turn
    // can share a millisecond.
    expect(messages[0]?.role).toBe('CLIENT');

    expect((await store.listConversations('acc_ana')).map((c) => c.id)).toEqual(['conv_1']);
    expect(await store.listConversations('acc_carlos')).toEqual([]);
  });

  it('keeps every task version rather than replacing the current one', async () => {
    await store.createTask(task());
    await store.appendTaskVersion(task({ state: 'IN_REVIEW' }));
    await store.appendTaskVersion(task({ state: 'APPROVED' }));

    const stored = await store.getTask('task_1');
    expect(stored?.versions.map((v) => v.state)).toEqual(['OPEN', 'IN_REVIEW', 'APPROVED']);
    // The current task is the newest version, not the first.
    expect(stored?.task.state).toBe('APPROVED');
  });

  it('filters tasks on their current state, not on any state they ever held', async () => {
    // task_1 passed through OPEN on its way to APPROVED. Filtering on OPEN must not
    // return it — the queue would show work that is already finished.
    expect((await store.listTasks({ state: 'OPEN' })).map((t) => t.taskId)).not.toContain('task_1');
    expect((await store.listTasks({ state: 'APPROVED' })).map((t) => t.taskId)).toContain('task_1');
    expect((await store.listTasks({ queue: 'siniestros' })).map((t) => t.taskId)).not.toContain('task_1');
    expect((await store.listTasksForConversation('conv_1')).map((t) => t.taskId)).toEqual(['task_1']);
  });

  it('refuses to update or delete append-only history', async () => {
    // The application has no path that does this. The trigger makes that a property
    // of the database rather than of the current code.
    expect(() =>
      execFileSync('psql', [CONNECTION as string, '-v', 'ON_ERROR_STOP=1', '-c', "delete from audit_events"], {
        stdio: 'pipe',
      }),
    ).toThrow();
    expect(() =>
      execFileSync('psql', [CONNECTION as string, '-v', 'ON_ERROR_STOP=1', '-c', "update task_versions set state = 'OPEN'"], {
        stdio: 'pipe',
      }),
    ).toThrow();
  });

  it('chains audit events and verifies them', async () => {
    const first = await store.appendAudit(auditInput('a'));
    const second = await store.appendAudit(auditInput('b'));

    expect(first.previousHash).toBeNull();
    expect(second.previousHash).toBe(first.eventHash);
    await expect(store.verifyAuditChain()).resolves.toEqual({ valid: true, brokenAtIndex: null });

    const filtered = await store.listAudit({ traceId: 'trace_1' });
    expect(filtered).toHaveLength(2);
    // The event read back must be byte-identical to the one hashed, or the chain
    // fails for a reason that has nothing to do with tampering.
    expect(filtered[0]?.occurredAt).toBe('2026-08-05T09:00:00.000Z');
    expect(verifyEventChain(filtered).valid).toBe(true);
  });

  it('serialises concurrent audit appends into one unbroken chain', async () => {
    const before = (await store.listAudit()).length;

    // Twenty appends started at once. Without the transaction-scoped advisory lock
    // these interleave, each reading the same head, and the chain forks.
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.appendAudit(auditInput(`concurrent_${i}`))));

    const events = await store.listAudit();
    expect(events).toHaveLength(before + 20);
    expect(verifyEventChain(events)).toEqual({ valid: true, brokenAtIndex: null });
    // Every event got a distinct id, so none overwrote another.
    expect(new Set(events.map((e) => e.eventId)).size).toBe(events.length);
  });

  it('behaves like the in-memory store for the same sequence of calls', async () => {
    // The port is the contract. Two implementations that disagree mean every test
    // written against the fast one is testing something the deployed one does not do.
    const memory: PlatformStore = new InMemoryStore();
    const sequence = async (target: PlatformStore, suffix: string) => {
      await target.createConversation({
        id: `conv_${suffix}`,
        accountId: 'acc_x',
        contextType: 'PERSON',
        contextId: 'party_x',
        title: 'Nueva consulta',
      });
      await target.appendMessage({
        id: `msg_${suffix}`,
        conversationId: `conv_${suffix}`,
        role: 'CLIENT',
        text: 'Hola, tengo una duda sobre mi póliza',
        createdAt: '2026-08-05T10:00:00.000Z',
      });
      await target.createTask(task({ taskId: `task_${suffix}`, conversationId: `conv_${suffix}` }));
      return {
        title: (await target.getConversation(`conv_${suffix}`))?.title,
        messages: (await target.listMessages(`conv_${suffix}`)).length,
        taskState: (await target.getTask(`task_${suffix}`))?.task.state,
        versions: (await target.getTask(`task_${suffix}`))?.versions.length,
      };
    };

    expect(await sequence(store, 'pg')).toEqual(await sequence(memory, 'mem'));
  });
});

const SCHEMA_RESET = `
drop schema public cascade;
create schema public;
`;
