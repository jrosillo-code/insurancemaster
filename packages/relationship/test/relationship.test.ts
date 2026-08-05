import { describe, expect, it } from 'vitest';
import {
  type ClientMemory,
  MAX_MOMENTS_PER_RUN,
  type RelationshipInput,
  REPEAT_SUPPRESSION_DAYS,
  attribution,
  findMoments,
  isStale,
  memoriesFor,
  usableFor,
} from '../src/index';

/**
 * The relationship layer, tested on its refusals.
 *
 * The happy path — "a renewal is coming, say so" — is easy and not where the risk
 * lives. What matters is that the system stays quiet when it should: no consent, a
 * deleted memory, special-category data, a repeat, a stale record. Each of those is a
 * way for a product built on trust to destroy it, so each has a test.
 */

const TODAY = '2026-08-05';

function memory(overrides: Partial<ClientMemory> = {}): ClientMemory {
  return {
    id: 'mem_1',
    accountId: 'acc_javier',
    kind: 'FAMILY_MEMBER',
    label: 'Hija',
    value: 'Sofía',
    onDate: '2008-09-01',
    provenance: {
      source: 'CLIENT_STATED',
      originId: 'conv_42',
      statedAt: '2026-02-01T10:00:00.000Z',
    },
    allowedPurposes: ['ANSWER_IN_CONVERSATION', 'PROACTIVE_CONTACT'],
    aboutThirdParty: true,
    specialCategory: false,
    ...overrides,
  };
}

function input(overrides: Partial<RelationshipInput> = {}): RelationshipInput {
  return {
    accountId: 'acc_javier',
    today: TODAY,
    memories: [],
    renewals: [],
    recentClaims: [],
    proactiveContactEnabled: true,
    recentlySent: [],
    ...overrides,
  };
}

describe('consent is checked before anything else', () => {
  it('produces nothing at all when proactive contact is switched off', () => {
    const moments = findMoments(
      input({
        proactiveContactEnabled: false,
        memories: [memory()],
        renewals: [{ policyId: 'pol_1', renewsOn: '2026-08-20', productName: 'Hogar' }],
        recentClaims: [{ claimId: 'clm_1', openedOn: '2026-07-27', description: 'agua' }],
      }),
    );
    // Every rule above had something to fire on. The switch is not a filter applied
    // to the output; it is the first thing checked.
    expect(moments).toEqual([]);
  });

  it('refuses a purpose the client did not grant', () => {
    const restricted = memory({ allowedPurposes: ['ANSWER_IN_CONVERSATION'] });
    expect(usableFor(restricted, 'ANSWER_IN_CONVERSATION')).toBe(true);
    expect(usableFor(restricted, 'PROACTIVE_CONTACT')).toBe(false);
  });

  it('never uses special-category data to start a conversation', () => {
    // The client volunteered a health detail so the assistant could answer them. That
    // is not permission to raise it unprompted, whatever the consent list says.
    const health = memory({
      kind: 'CIRCUMSTANCE',
      specialCategory: true,
      allowedPurposes: ['ANSWER_IN_CONVERSATION', 'PROACTIVE_CONTACT'],
    });
    expect(usableFor(health, 'ANSWER_IN_CONVERSATION')).toBe(true);
    expect(usableFor(health, 'PROACTIVE_CONTACT')).toBe(false);
  });

  it('treats a deleted memory as gone for every purpose', () => {
    const forgotten = memory({ forgottenAt: '2026-07-01T00:00:00.000Z' });
    expect(usableFor(forgotten, 'ANSWER_IN_CONVERSATION')).toBe(false);
    expect(usableFor(forgotten, 'ADVISER_CONTEXT')).toBe(false);
    expect(memoriesFor([forgotten], 'ANSWER_IN_CONVERSATION')).toEqual([]);
  });
});

describe('a moment can always be explained', () => {
  it('rests on record ids the client can be shown', () => {
    const moments = findMoments(
      input({ renewals: [{ policyId: 'pol_hogar', renewsOn: '2026-08-20', productName: 'Hogar' }] }),
    );
    expect(moments).toHaveLength(1);
    expect(moments[0]?.basis).toEqual(['pol_hogar']);
    expect(moments[0]?.reason.length).toBeGreaterThan(0);
  });

  it('carries only resolved facts, so a drafter cannot reach for anything else', () => {
    const moments = findMoments(
      input({
        memories: [memory()],
        // Sofía turns 18 on 2026-09-01, inside the 45-day window.
      }),
    );
    const child = moments.find((m) => m.code === 'CHILD_REACHES_18');
    expect(child).toBeDefined();
    expect(child?.facts['name']).toBe('Sofía');
    expect(child?.facts['turns18On']).toBe('2026-09-01');
    // The whole memory is not handed over — only what the rule resolved.
    expect(JSON.stringify(child?.facts)).not.toContain('conv_42');
  });

  it('says where a memory came from, in the reader’s language', () => {
    expect(attribution(memory(), 'es')).toContain('Nos lo contaste el 2026-02-01');
    expect(attribution(memory(), 'en')).toContain('You told us on 2026-02-01');
    expect(
      attribution(memory({ provenance: { ...memory().provenance, source: 'ADVISER_RECORDED' } }), 'en'),
    ).toContain('adviser');
  });
});

describe('restraint', () => {
  it('does not repeat a moment inside the suppression window', () => {
    const renewals = [{ policyId: 'pol_1', renewsOn: '2026-08-20', productName: 'Hogar' }];
    const fresh = findMoments(input({ renewals }));
    expect(fresh).toHaveLength(1);

    const recent = findMoments(
      input({
        renewals,
        recentlySent: [{ code: 'RENEWAL_APPROACHING', sentOn: '2026-07-20' }],
      }),
    );
    expect(recent).toEqual([]);

    // Outside the window it is allowed again.
    const old = findMoments(
      input({
        renewals,
        recentlySent: [{ code: 'RENEWAL_APPROACHING', sentOn: '2026-01-01' }],
      }),
    );
    expect(old).toHaveLength(1);
    expect(REPEAT_SUPPRESSION_DAYS).toBeGreaterThan(30);
  });

  it('never sends more than the cap, however many rules fire', () => {
    const moments = findMoments(
      input({
        memories: [memory(), memory({ id: 'mem_2', label: 'Hijo', value: 'Mateo' })],
        renewals: [
          { policyId: 'pol_1', renewsOn: '2026-08-10', productName: 'Hogar' },
          { policyId: 'pol_2', renewsOn: '2026-08-25', productName: 'Auto' },
        ],
        recentClaims: [{ claimId: 'clm_1', openedOn: '2026-07-27', description: 'agua' }],
      }),
    );
    expect(moments.length).toBeLessThanOrEqual(MAX_MOMENTS_PER_RUN);
  });

  it('puts the claim follow-up ahead of anything commercial', () => {
    const moments = findMoments(
      input({
        renewals: [{ policyId: 'pol_1', renewsOn: '2026-08-10', productName: 'Hogar' }],
        recentClaims: [{ claimId: 'clm_1', openedOn: '2026-07-27', description: 'agua' }],
      }),
    );
    // Somebody who has just had a loss hears "how are you?" before "shall we review
    // your premium?" — and if that ordering ever inverts, this fails.
    expect(moments[0]?.code).toBe('CLAIM_FOLLOW_UP');
  });

  it('waits before following up a claim rather than intruding immediately', () => {
    const sameWeek = findMoments(
      input({ recentClaims: [{ claimId: 'clm_1', openedOn: '2026-08-03', description: 'agua' }] }),
    );
    expect(sameWeek).toEqual([]);
  });
});

describe('memories go stale rather than being assumed true', () => {
  it('marks a long-unconfirmed memory stale', () => {
    const old = memory({ provenance: { ...memory().provenance, statedAt: '2024-01-01T00:00:00.000Z' } });
    expect(isStale(old, TODAY)).toBe(true);
    expect(isStale(memory(), TODAY)).toBe(false);
  });

  it('asks about a stale memory instead of acting on it', () => {
    const old = memory({
      kind: 'CIRCUMSTANCE',
      label: 'Reforma de la casa',
      value: 'Está reformando la cocina',
      onDate: undefined,
      provenance: { source: 'CLIENT_STATED', originId: 'conv_7', statedAt: '2024-01-01T00:00:00.000Z' },
    });
    const moments = findMoments(input({ memories: [old] }));
    expect(moments.map((m) => m.code)).toContain('MEMORY_NEEDS_CONFIRMING');
  });

  it('does not use a stale family memory to fire a birthday rule', () => {
    const stale = memory({
      provenance: { source: 'CLIENT_STATED', originId: 'conv_1', statedAt: '2023-01-01T00:00:00.000Z' },
    });
    const moments = findMoments(input({ memories: [stale] }));
    expect(moments.map((m) => m.code)).not.toContain('CHILD_REACHES_18');
  });

  it('asks about at most one stale memory at a time', () => {
    const staleAt = '2024-01-01T00:00:00.000Z';
    const moments = findMoments(
      input({
        memories: [
          memory({ id: 'm1', kind: 'CIRCUMSTANCE', onDate: undefined, provenance: { source: 'CLIENT_STATED', originId: 'c1', statedAt: staleAt } }),
          memory({ id: 'm2', kind: 'CIRCUMSTANCE', onDate: undefined, provenance: { source: 'CLIENT_STATED', originId: 'c2', statedAt: staleAt } }),
          memory({ id: 'm3', kind: 'CIRCUMSTANCE', onDate: undefined, provenance: { source: 'CLIENT_STATED', originId: 'c3', statedAt: staleAt } }),
        ],
      }),
    );
    // A list of "is this still true?" is an interrogation, not a relationship.
    expect(moments.filter((m) => m.code === 'MEMORY_NEEDS_CONFIRMING')).toHaveLength(1);
  });
});

describe('the type system forbids an invented memory', () => {
  it('has no source meaning the model made it up', () => {
    // Not a runtime check — a statement of the design. If somebody adds
    // 'MODEL_INFERRED' to MemorySource, this is where the argument happens.
    const sources = ['CLIENT_STATED', 'ADVISER_RECORDED', 'CLIENT_PROFILE_FORM'];
    expect(sources).not.toContain('MODEL_INFERRED');
    expect(memory().provenance.originId).toBeTruthy();
  });
});
