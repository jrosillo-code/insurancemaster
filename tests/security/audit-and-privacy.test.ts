import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MockConciergeProvider } from '@rosillo/ai';
import { DATASET_TODAY, SyntheticCustomer360, getSyntheticDataset } from '@rosillo/customer-360';
import { InMemoryStore, JsonlStore, verifyEventChain } from '@rosillo/store';
import { handleClientMessage, sequentialIdFactory, type PipelineDeps } from '@rosillo/orchestration';

/**
 * Audit integrity and data hygiene (blueprint §12.3, §15.2, §15.4).
 *
 * Two properties are checked here. First, the audit log is tamper-evident: editing
 * or deleting an event breaks the hash chain and the platform says where. Second,
 * nothing sensitive is in the log to begin with — an audit trail that quietly
 * accumulates policy text is a second copy of the data it was meant to govern.
 */

const NOW = '2026-08-05T09:00:00.000Z';
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function deps(store = new InMemoryStore()): PipelineDeps {
  return {
    c360: new SyntheticCustomer360(),
    store,
    provider: new MockConciergeProvider(),
    ids: sequentialIdFactory(),
  };
}

async function converse(pipeline: PipelineDeps, message: string) {
  await pipeline.store.createConversation({
    id: 'conv_audit',
    accountId: 'acc_ana',
    contextType: 'PERSON',
    contextId: 'party_ana',
    title: 'audit',
  });
  return handleClientMessage(
    {
      accountId: 'acc_ana',
      conversationId: 'conv_audit',
      message,
      requestedContext: { type: 'PERSON', id: 'party_ana' },
      now: NOW,
      asOf: DATASET_TODAY,
    },
    pipeline,
  );
}

describe('the trail records what happened', () => {
  it('writes an event for every stage of a request', async () => {
    const pipeline = deps();
    const result = await converse(pipeline, '¿Cuál es la franquicia de mi coche?');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const actions = new Set((await pipeline.store.listAudit({ traceId: result.traceId })).map((e) => e.action));
    for (const expected of [
      'MESSAGE_RECEIVED',
      'SCOPE_COMPUTED',
      'INTENT_CLASSIFIED',
      'RETRIEVAL_PLANNED',
      'EVIDENCE_RETRIEVED',
      'POLICY_ENFORCED',
      'RESPONSE_DELIVERED',
    ]) {
      expect(actions, `missing ${expected}`).toContain(expected);
    }
  });

  it('records the lawful basis of each access, not only the access', async () => {
    const pipeline = deps();
    const result = await converse(pipeline, '¿Qué seguros tengo?');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const event of await pipeline.store.listAudit({ traceId: result.traceId })) {
      expect(event.purposeCode.length).toBeGreaterThan(0);
      expect(event.traceId).toBe(result.traceId);
    }
  });

  it('records a denial as an event rather than as silence', async () => {
    const pipeline = deps();
    await pipeline.store.createConversation({
      id: 'conv_denied',
      accountId: 'acc_ana',
      contextType: 'PERSON',
      contextId: 'party_ana',
      title: 'denied',
    });
    const result = await handleClientMessage(
      {
        accountId: 'acc_ana',
        conversationId: 'conv_denied',
        message: '¿Qué pólizas tiene la empresa?',
        requestedContext: { type: 'ORGANISATION', id: 'org_serrano' },
        now: NOW,
        asOf: DATASET_TODAY,
      },
      pipeline,
    );
    expect(result.ok).toBe(false);
    const events = await pipeline.store.listAudit({ traceId: result.traceId });
    expect(events.some((e) => e.action === 'ACCESS_DENIED')).toBe(true);
  });
});

describe('the trail cannot be rewritten', () => {
  it('verifies a clean chain', async () => {
    const pipeline = deps();
    await converse(pipeline, '¿Cuál es la franquicia de mi coche?');
    await expect(pipeline.store.verifyAuditChain()).resolves.toEqual({ valid: true, brokenAtIndex: null });
  });

  it('detects an edited event', async () => {
    const pipeline = deps();
    await converse(pipeline, '¿Cuál es la franquicia de mi coche?');
    const events = await pipeline.store.listAudit();
    expect(events.length).toBeGreaterThan(2);

    const tampered = events.map((event, index) =>
      index === 1 ? { ...event, purposeCode: 'SECURITY_CONTROL' as const } : event,
    );
    expect(verifyEventChain(tampered)).toEqual({ valid: false, brokenAtIndex: 1 });
  });

  it('detects a deleted event', async () => {
    const pipeline = deps();
    await converse(pipeline, '¿Cuál es la franquicia de mi coche?');
    const events = await pipeline.store.listAudit();
    const withHole = [...events.slice(0, 2), ...events.slice(3)];
    expect(verifyEventChain(withHole).valid).toBe(false);
  });

  it('chains across processes when the log is on disk', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rosillo-audit-'));
    tempDirs.push(dir);

    // Two stores over the same directory stand in for two running applications.
    const first = new JsonlStore(dir);
    await converse(deps(first), '¿Cuál es la franquicia de mi coche?');

    const second = new JsonlStore(dir);
    await second.appendAudit({
      occurredAt: NOW,
      actor: { type: 'EMPLOYEE', id: 'emp_1' },
      action: 'TASK_VIEWED',
      resource: { type: 'task', id: 'task_1' },
      purposeCode: 'EMPLOYEE_CASE_REVIEW',
      traceId: 'trace_x',
      modelRunId: null,
      beforeHash: null,
      afterHash: null,
      metadata: {},
    });

    const third = new JsonlStore(dir);
    await expect(third.verifyAuditChain()).resolves.toEqual({ valid: true, brokenAtIndex: null });
    const all = await third.listAudit();
    expect(all.some((e) => e.action === 'TASK_VIEWED')).toBe(true);
  });
});

describe('nothing sensitive reaches the trail', () => {
  it('never stores the client’s message text', async () => {
    const pipeline = deps();
    const secret = 'mi matrícula es 4821 KLM y vivo en Calle Sintética 12';
    const result = await converse(pipeline, `¿Cuál es la franquicia? ${secret}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const serialised = JSON.stringify(await pipeline.store.listAudit({ traceId: result.traceId }));
    expect(serialised).not.toContain('4821 KLM');
    expect(serialised).not.toContain('Calle Sintética');
    expect(serialised).not.toContain(secret);
  });

  it('never stores policy or claim text', async () => {
    const pipeline = deps();
    const result = await converse(pipeline, '¿Qué cubre mi seguro de hogar si hay un escape de agua?');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const serialised = JSON.stringify(await pipeline.store.listAudit({ traceId: result.traceId }));
    // The passages are retrieved and quoted to the client; the log holds ids only.
    expect(serialised).not.toContain('Franquicia: 150 € en daños por agua');
    expect(serialised).not.toContain('localización y reparación de la avería');
  });

  it('never stores the answer text either', async () => {
    const pipeline = deps();
    const result = await converse(pipeline, '¿Cuál es la franquicia de mi coche?');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const serialised = JSON.stringify(await pipeline.store.listAudit({ traceId: result.traceId }));
    expect(serialised).not.toContain(result.response.clientMessage);
  });

  it('records no chain-of-thought on an AI run', async () => {
    const pipeline = deps();
    const result = await converse(pipeline, '¿Cuál es la franquicia de mi coche?');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const runs = await pipeline.store.listAIRuns(result.traceId);
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      // Hashes and verdicts, never reasoning or raw prompts (ADR-0009).
      expect(Object.keys(run)).not.toContain('reasoning');
      expect(Object.keys(run)).not.toContain('prompt');
      expect(run.inputHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe('the dataset is synthetic by construction', () => {
  it('uses the reserved .test domain for every contact address', () => {
    const dataset = getSyntheticDataset();
    for (const party of dataset.parties) {
      if (party.email === null) continue;
      // RFC 2606 reserves .test precisely so it can never resolve to a real inbox.
      expect(party.email.endsWith('.test'), party.email).toBe(true);
    }
    for (const account of dataset.accounts) {
      expect(account.email.endsWith('.test'), account.email).toBe(true);
    }
  });

  it('never carries a tax identifier that could belong to a real person', () => {
    // Every synthetic NIE is well-formed — so the interface and any parsing code are
    // exercised realistically — and every one deliberately fails the official check
    // letter, so none of them can collide with an identifier actually issued.
    const letters = 'TRWAGMYFPDXBNJZSQVHLCKE';
    const dataset = getSyntheticDataset();
    const persons = dataset.parties.filter((party) => party.type === 'PERSON');
    expect(persons.length).toBeGreaterThan(30);

    for (const party of persons) {
      const taxId = party.taxIdSynthetic;
      expect(taxId, `${party.id} has no identifier`).not.toBeNull();
      if (taxId === null) continue;
      expect(taxId, `${party.id}`).toMatch(/^[XYZ]\d{7}[A-Z]$/);

      const prefix = taxId[0] as 'X' | 'Y' | 'Z';
      const numeric = Number.parseInt(`${{ X: '0', Y: '1', Z: '2' }[prefix]}${taxId.slice(1, 8)}`, 10);
      expect(letters[numeric % 23], `${party.id} (${taxId}) is a valid NIE`).not.toBe(taxId[8]);
    }
  });

  it('holds no policy number that resolves outside the synthetic dataset', () => {
    const dataset = getSyntheticDataset();
    for (const policy of dataset.policies) {
      expect(policy.policyNumber).toMatch(/^[A-Z]{3}-\d{4}-\d{4}$/);
    }
  });
});
