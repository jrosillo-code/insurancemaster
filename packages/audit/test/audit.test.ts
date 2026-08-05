import { describe, expect, it } from 'vitest';
import { AuditLog, verifyEventChain, type AuditEventInput } from '../src/index';

/**
 * The audit log's value is that a rewritten history is detectable. These tests
 * tamper with recorded events and assert the chain notices.
 */

function event(overrides: Partial<AuditEventInput> = {}): AuditEventInput {
  return {
    occurredAt: '2026-08-05T10:00:00.000Z',
    actor: { type: 'CLIENT', id: 'acc_ana' },
    action: 'MESSAGE_RECEIVED',
    resource: { type: 'conversation', id: 'conv_1' },
    purposeCode: 'CLIENT_SELF_SERVICE',
    traceId: 'trace_1',
    modelRunId: null,
    beforeHash: null,
    afterHash: null,
    metadata: {},
    ...overrides,
  };
}

describe('append-only behaviour', () => {
  it('assigns sequential ids and links each event to the previous one', () => {
    const log = new AuditLog();
    const first = log.append(event());
    const second = log.append(event({ action: 'RESPONSE_DELIVERED' }));
    expect(first.previousHash).toBeNull();
    expect(second.previousHash).toBe(first.eventHash);
    expect(log.length).toBe(2);
  });

  it('returns copies, so a caller cannot rewrite recorded history', () => {
    const log = new AuditLog();
    log.append(event());
    const events = log.all();
    events[0]!.action = 'ACCESS_DENIED';
    // The mutation touched the copy, not the log.
    expect(log.all()[0]?.action).toBe('MESSAGE_RECEIVED');
    expect(log.verifyChain().valid).toBe(true);
  });

  it('refuses metadata that is not a non-sensitive scalar', () => {
    const log = new AuditLog();
    expect(() =>
      log.append(event({ metadata: { nested: { secret: 'x' } } as never })),
    ).toThrow();
  });
});

describe('tamper detection', () => {
  it('detects an edited event', () => {
    const log = new AuditLog();
    log.append(event());
    log.append(event({ action: 'INTENT_CLASSIFIED' }));
    log.append(event({ action: 'RESPONSE_DELIVERED' }));

    const events = log.all();
    events[1]!.action = 'ACCESS_DENIED';
    const verdict = verifyEventChain(events);
    expect(verdict.valid).toBe(false);
    expect(verdict.brokenAtIndex).toBe(1);
  });

  it('detects a deleted event', () => {
    const log = new AuditLog();
    log.append(event());
    log.append(event({ action: 'PROHIBITED_ACTION_BLOCKED' }));
    log.append(event({ action: 'RESPONSE_DELIVERED' }));

    // Removing the inconvenient middle event breaks the chain at the next link.
    const events = log.all().filter((e) => e.action !== 'PROHIBITED_ACTION_BLOCKED');
    expect(verifyEventChain(events).valid).toBe(false);
  });

  it('accepts an untouched chain read back from storage', () => {
    const log = new AuditLog();
    for (let i = 0; i < 10; i += 1) log.append(event({ traceId: `trace_${i}` }));
    const roundTripped = JSON.parse(JSON.stringify(log.all()));
    expect(verifyEventChain(roundTripped)).toEqual({ valid: true, brokenAtIndex: null });
  });
});

describe('queries', () => {
  it('filters by trace and by resource', () => {
    const log = new AuditLog();
    log.append(event({ traceId: 'trace_a' }));
    log.append(event({ traceId: 'trace_b', resource: { type: 'task', id: 'task_1' } }));
    expect(log.byTrace('trace_a')).toHaveLength(1);
    expect(log.byResource('task', 'task_1')).toHaveLength(1);
    expect(log.byResource('task', 'task_2')).toHaveLength(0);
  });
});
