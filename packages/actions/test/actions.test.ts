import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '@rosillo/store';
import {
  MISSING_INFO_RULES_VERSION,
  ProhibitedActionError,
  applyEmployeeDecision,
  assertActionPermitted,
  claimTask,
  createHandoffTask,
  evaluateMissingInformation,
  hasOutstandingRequired,
} from '../src/index';

const NOW = '2026-08-05T10:00:00.000Z';

function baseTask(overrides: Partial<Parameters<typeof createHandoffTask>[1]> = {}) {
  return {
    taskId: 'task_1',
    createdAt: NOW,
    clientId: 'party_ana',
    organisationId: null,
    conversationId: 'conv_1',
    intent: 'CLAIM_START' as const,
    actionCode: 'PREPARE_CLAIM_INTAKE',
    clientRequest: 'Me han dado un golpe en el coche',
    requestedOutcome: 'Preparar el parte',
    verifiedFacts: {},
    clientStatements: [{ text: 'Me han dado un golpe', statedAt: NOW, verified: false as const }],
    missingInformation: [
      { key: 'incident_time', label: 'Hora', severity: 'REQUIRED' as const, ruleId: 'CL-002' },
    ],
    relevantPolicyIds: ['pol_ana_auto'],
    evidence: [],
    riskFlags: [] as never[],
    preferredChannel: 'chat' as const,
    conversationSummary: 'resumen',
    authorityBasis: 'Titular de sus propios datos',
    ...overrides,
  };
}

describe('action permission gate', () => {
  it('accepts a catalogue action', () => {
    expect(() => assertActionPermitted('CREATE_ADVISER_TASK')).not.toThrow();
  });

  it('refuses a prohibited action', () => {
    expect(() => assertActionPermitted('EXECUTE_CANCELLATION')).toThrow(ProhibitedActionError);
    expect(() => assertActionPermitted('SEND_EXTERNAL_MESSAGE')).toThrow(ProhibitedActionError);
    expect(() => assertActionPermitted('BIND_OR_ISSUE')).toThrow(ProhibitedActionError);
  });

  it('refuses an unknown action', () => {
    expect(() => assertActionPermitted('DO_WHATEVER')).toThrow(ProhibitedActionError);
  });
});

describe('task creation', () => {
  it('routes a claim to the claims queue with external action disabled', async () => {
    const store = new InMemoryStore();
    const task = await createHandoffTask(store, baseTask());
    expect(task.employeeQueue).toBe('siniestros');
    expect(task.externalActionAllowed).toBe(false);
    expect(task.state).toBe('OPEN');
  });

  it('refuses to create a task for a prohibited action', async () => {
    const store = new InMemoryStore();
    await expect(createHandoffTask(store, baseTask({ actionCode: 'EXECUTE_CANCELLATION' }))).rejects.toThrow(
      ProhibitedActionError,
    );
  });
});

describe('employee decisions', () => {
  it('appends an immutable version rather than overwriting', async () => {
    const store = new InMemoryStore();
    await createHandoffTask(store, baseTask());
    await applyEmployeeDecision(store, {
      taskId: 'task_1',
      employeeId: 'emp_ana_op',
      decidedAt: NOW,
      decision: 'APPROVE',
      edits: {},
      note: 'ok',
      overrideReason: 'Cliente confirma la hora por teléfono',
    });
    const stored = await store.getTask('task_1');
    expect(stored?.versions).toHaveLength(2);
    // The original version still says OPEN.
    expect(stored?.versions[0]?.state).toBe('OPEN');
    expect(stored?.task.state).toBe('APPROVED');
  });

  it('demands an override reason to approve with required items outstanding', async () => {
    const store = new InMemoryStore();
    await createHandoffTask(store, baseTask());
    await expect(
      applyEmployeeDecision(store, {
        taskId: 'task_1',
        employeeId: 'emp_ana_op',
        decidedAt: NOW,
        decision: 'APPROVE',
        edits: {},
        note: '',
        overrideReason: '',
      }),
    ).rejects.toThrow(/motivo de excepción/);
  });

  it('lets an employee reject or escalate without an override reason', async () => {
    const store = new InMemoryStore();
    await createHandoffTask(store, baseTask());
    const result = await applyEmployeeDecision(store, {
      taskId: 'task_1',
      employeeId: 'emp_carlos_sup',
      decidedAt: NOW,
      decision: 'ESCALATE',
      edits: {},
      note: 'Falta información',
      overrideReason: '',
    });
    expect(result.task.state).toBe('ESCALATED');
  });

  it('records an employee correction as human-verified provenance', async () => {
    const store = new InMemoryStore();
    await createHandoffTask(store, baseTask({ missingInformation: [] }));
    const result = await applyEmployeeDecision(store, {
      taskId: 'task_1',
      employeeId: 'emp_ana_op',
      decidedAt: NOW,
      decision: 'APPROVE_WITH_EDITS',
      edits: { incident_time: '18:30' },
      note: '',
      overrideReason: '',
    });
    const fact = result.task.verifiedFacts['incident_time'];
    expect(fact?.value).toBe('18:30');
    expect(fact?.sourceId).toBe('employee:emp_ana_op');
    expect(fact?.sourceType).toBe('APPROVED_KNOWLEDGE');
  });

  it('gives the client a status that never implies execution', async () => {
    const store = new InMemoryStore();
    await createHandoffTask(store, baseTask({ missingInformation: [] }));
    const result = await applyEmployeeDecision(store, {
      taskId: 'task_1',
      employeeId: 'emp_ana_op',
      decidedAt: NOW,
      decision: 'APPROVE',
      edits: {},
      note: '',
      overrideReason: '',
    });
    expect(result.clientVisibleStatus).toMatch(/aceptado para tramitar/);
    expect(result.clientVisibleStatus).not.toMatch(/enviado|tramitado ya|hecho/);
  });

  it('refuses to decide a task twice', async () => {
    const store = new InMemoryStore();
    await createHandoffTask(store, baseTask({ missingInformation: [] }));
    await applyEmployeeDecision(store, {
      taskId: 'task_1',
      employeeId: 'emp_ana_op',
      decidedAt: NOW,
      decision: 'APPROVE',
      edits: {},
      note: '',
      overrideReason: '',
    });
    // APPROVED → APPROVED is not a legal transition.
    await expect(
      applyEmployeeDecision(store, {
        taskId: 'task_1',
        employeeId: 'emp_ana_op',
        decidedAt: NOW,
        decision: 'APPROVE',
        edits: {},
        note: '',
        overrideReason: '',
      }),
    ).rejects.toThrow(/Illegal task transition/);
  });

  it('claims a task idempotently', async () => {
    const store = new InMemoryStore();
    await createHandoffTask(store, baseTask());
    expect((await claimTask(store, 'task_1')).state).toBe('IN_REVIEW');
    expect((await claimTask(store, 'task_1')).state).toBe('IN_REVIEW');
  });
});

describe('deterministic missing-information rules', () => {
  it('is versioned', () => {
    expect(MISSING_INFO_RULES_VERSION).toBe('concierge-rules-v1');
  });

  it('asks for everything a bare claim report omits', () => {
    const items = evaluateMissingInformation({
      intent: 'CLAIM_START',
      clientText: 'Me han dado un golpe',
      hasAttachments: false,
      resolvedPolicyIds: ['pol_ana_auto'],
    });
    const keys = items.map((i) => i.key);
    expect(keys).toEqual(
      expect.arrayContaining(['incident_date', 'incident_time', 'incident_place', 'damage_photos']),
    );
    expect(hasOutstandingRequired(items)).toBe(true);
  });

  it('stops asking once the client has supplied the facts', () => {
    const items = evaluateMissingInformation({
      intent: 'CLAIM_START',
      clientText:
        'Me han dado un golpe el 12/07 a las 18:30 en el aparcamiento del centro. ' +
        'No hay heridos, hicimos parte amistoso con el otro conductor y avisamos a la policía.',
      hasAttachments: true,
      resolvedPolicyIds: ['pol_ana_auto'],
    });
    expect(items.map((i) => i.key)).toHaveLength(0);
  });

  it('always requires the signed request for a cancellation', () => {
    const items = evaluateMissingInformation({
      intent: 'CANCELLATION_REQUEST',
      clientText: 'Quiero dar de baja el seguro el 1 de octubre porque he vendido el coche',
      hasAttachments: true,
      resolvedPolicyIds: ['pol_ana_auto'],
    });
    const keys = items.map((i) => i.key);
    // Cannot be gathered through chat, so it is always outstanding.
    expect(keys).toContain('signed_cancellation');
    expect(keys).toContain('sale_document');
  });

  it('asks which policy when a renewal review is ambiguous', () => {
    const ambiguous = evaluateMissingInformation({
      intent: 'RENEWAL_REVIEW',
      clientText: '¿Por qué me ha subido la prima?',
      hasAttachments: false,
      resolvedPolicyIds: ['pol_ana_auto', 'pol_ana_hogar'],
    });
    expect(ambiguous.map((i) => i.key)).toContain('target_policy');

    const unambiguous = evaluateMissingInformation({
      intent: 'RENEWAL_REVIEW',
      clientText: '¿Por qué me ha subido la prima?',
      hasAttachments: false,
      resolvedPolicyIds: ['pol_ana_auto'],
    });
    expect(unambiguous.map((i) => i.key)).not.toContain('target_policy');
  });

  it('produces the same verdict for the same input every time', () => {
    const input = {
      intent: 'POLICY_CHANGE' as const,
      clientText: 'Quiero cambiar la dirección',
      hasAttachments: false,
      resolvedPolicyIds: [],
    };
    expect(evaluateMissingInformation(input)).toEqual(evaluateMissingInformation(input));
  });
});
