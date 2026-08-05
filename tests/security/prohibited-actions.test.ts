import { describe, expect, it } from 'vitest';
import {
  ALLOWED_ACTIONS,
  ACTION_CODES,
  INTENT_ACTIONS,
  INTENTS,
  PROHIBITED_ACTIONS,
  PROHIBITED_ACTION_CODES,
  isAllowedAction,
  isProhibitedAction,
} from '@rosillo/domain';
import { assertActionPermitted } from '@rosillo/actions';
import { enforcePolicy } from '@rosillo/orchestration';

/**
 * The action boundary (blueprint §13.3, Appendix B).
 *
 * The claim this platform makes is stronger than "prohibited actions are disabled":
 * they are absent. There is no handler, no feature flag and no configuration that
 * turns one on. These tests hold that claim from three directions — the catalogue
 * itself, the policy stage that filters a model's proposals, and the action layer
 * that would have to execute one.
 */

describe('the catalogue', () => {
  it('keeps allowed and prohibited actions in disjoint sets', () => {
    for (const code of PROHIBITED_ACTION_CODES) {
      expect(isAllowedAction(code), `${code} must not be allowed`).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(ALLOWED_ACTIONS, code)).toBe(false);
    }
    for (const code of ACTION_CODES) {
      expect(isProhibitedAction(code), `${code} must not be prohibited`).toBe(false);
    }
  });

  it('is not fooled by inherited object properties', () => {
    // `'toString' in ALLOWED_ACTIONS` is true; the membership test must not be.
    expect(isAllowedAction('toString')).toBe(false);
    expect(isAllowedAction('constructor')).toBe(false);
    expect(isAllowedAction('__proto__')).toBe(false);
    expect(isProhibitedAction('toString')).toBe(false);
  });

  it('names every prohibited action explicitly rather than by omission', () => {
    for (const code of ['SEND_EXTERNAL_MESSAGE', 'BIND_OR_ISSUE', 'EXECUTE_CANCELLATION', 'APPROVE_OR_DENY_CLAIM']) {
      expect(PROHIBITED_ACTIONS).toHaveProperty(code);
    }
  });

  it('maps every intent to actions drawn only from the approved catalogue', () => {
    for (const intent of INTENTS) {
      for (const code of INTENT_ACTIONS[intent]) {
        expect(isAllowedAction(code), `${intent} → ${code}`).toBe(true);
      }
    }
  });

  it('never offers execution where the platform may only prepare', () => {
    // Cancellation and amendment exist as PREPARE_* only. There is no execute code.
    expect(ACTION_CODES).toContain('PREPARE_CANCELLATION');
    expect(ACTION_CODES).toContain('PREPARE_AMENDMENT');
    expect(ACTION_CODES).not.toContain('EXECUTE_CANCELLATION');
    expect(ACTION_CODES).not.toContain('EXECUTE_AMENDMENT');
    expect(ACTION_CODES).not.toContain('SEND_EXTERNAL_MESSAGE');
    expect(ACTION_CODES).not.toContain('BIND_OR_ISSUE');
  });
});

describe('policy enforcement drops what the model proposes', () => {
  function enforce(intent: Parameters<typeof enforcePolicy>[0]['intent'], proposedActionCodes: string[]) {
    return enforcePolicy({
      draft: {
        answerType: 'PROCEDURE',
        clientMessage: 'Texto',
        citedEvidenceIndexes: [],
        uncertainty: [],
        followUpQuestions: [],
        proposedActionCodes,
        safetyNotice: null,
      },
      intent,
      candidateReferences: [],
      evidenceInsufficient: false,
      insufficiencyReasons: [],
      conflicts: [],
      staleSources: [],
      relevantPolicyIds: ['pol_ana_auto'],
      injectionDetected: false,
      language: 'es',
    });
  }

  it('blocks a prohibited code and records the attempt', () => {
    const result = enforce('CANCELLATION_REQUEST', ['EXECUTE_CANCELLATION', 'PREPARE_CANCELLATION']);
    expect(result.proposedActions.map((a) => a.code)).toEqual(['PREPARE_CANCELLATION']);
    expect(result.blockedActionCodes).toContain('EXECUTE_CANCELLATION');
  });

  it('blocks an external send however it is spelled', () => {
    const result = enforce('CLAIM_START', ['SEND_EXTERNAL_MESSAGE', 'send_external_message', 'PREPARE_CLAIM_INTAKE']);
    expect(result.proposedActions.map((a) => a.code)).toEqual(['PREPARE_CLAIM_INTAKE']);
    expect(result.blockedActionCodes.length).toBeGreaterThanOrEqual(2);
  });

  it('blocks an allowed action that does not belong to the intent', () => {
    // A coverage question must not be able to reach for a cancellation. What may
    // remain is a task for a person — never the action that was refused.
    const result = enforce('COVERAGE_EXPLANATION', ['PREPARE_CANCELLATION']);
    expect(result.proposedActions.map((a) => a.code)).not.toContain('PREPARE_CANCELLATION');
    expect(result.blockedActionCodes).toContain('PREPARE_CANCELLATION');
  });

  it('blocks an invented code the model made up', () => {
    const result = enforce('POLICY_FACT', ['GRANT_ME_EVERYTHING']);
    expect(result.proposedActions.map((a) => a.code)).not.toContain('GRANT_ME_EVERYTHING');
    expect(result.blockedActionCodes).toContain('GRANT_ME_EVERYTHING');
    // Every action that survives is a real one, permitted for this intent.
    for (const action of result.proposedActions) {
      expect(ACTION_CODES).toContain(action.code);
      expect(INTENT_ACTIONS.POLICY_FACT).toContain(action.code);
    }
  });

  it('marks every surviving action as internal-only', () => {
    const result = enforce('CANCELLATION_REQUEST', ['PREPARE_CANCELLATION']);
    for (const action of result.proposedActions) {
      expect(action.externalActionAllowed).toBe(false);
      expect(action.relatedPolicyIds.every((id) => id === 'pol_ana_auto')).toBe(true);
    }
  });

  it('requires human review once anything was blocked', () => {
    const result = enforce('CANCELLATION_REQUEST', ['EXECUTE_CANCELLATION']);
    expect(result.humanReviewRequired).toBe(true);
  });
});

describe('the action layer refuses to execute', () => {
  it('throws on a prohibited code', () => {
    expect(() => assertActionPermitted('EXECUTE_CANCELLATION', 'CANCELLATION_REQUEST')).toThrow();
    expect(() => assertActionPermitted('SEND_EXTERNAL_MESSAGE', 'CLAIM_START')).toThrow();
    expect(() => assertActionPermitted('BIND_OR_ISSUE', 'QUOTE_REQUEST')).toThrow();
  });

  it('throws on an allowed code outside its intent', () => {
    expect(() => assertActionPermitted('PREPARE_CANCELLATION', 'POLICY_FACT')).toThrow();
  });

  it('permits a prepare action for its own intent', () => {
    expect(() => assertActionPermitted('PREPARE_CANCELLATION', 'CANCELLATION_REQUEST')).not.toThrow();
  });
});
