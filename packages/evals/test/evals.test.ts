import { describe, expect, it } from 'vitest';
import { INTENTS } from '@rosillo/domain';
import { EVAL_CASES, MINIMUM_CASES, duplicateCaseIds } from '../src/cases';
import { EVAL_CATEGORIES } from '../src/types';
import { evaluate } from '../src/suite';
import { computeMetrics, evaluateGates } from '../src/metrics';
import { formatReport } from '../src/report';

/**
 * The evaluation suite as a release gate (blueprint §16.2, §21 ACCEPTANCE).
 *
 * Running it in CI is the point: a change that leaks a resource across clients or
 * lets a material answer escape without evidence fails the build here, not in a
 * report somebody reads later.
 *
 * The whole suite runs once and every assertion reads that single report — running
 * 78 pipeline cases per assertion would make this file the slowest thing in CI for
 * no additional signal.
 */

const report = await evaluate({ generatedAt: '2026-08-05T00:00:00.000Z' });

describe('corpus', () => {
  it('has at least the required number of labelled cases', () => {
    expect(EVAL_CASES.length).toBeGreaterThanOrEqual(MINIMUM_CASES);
  });

  it('has no duplicate case ids', () => {
    expect(duplicateCaseIds()).toEqual([]);
  });

  it('covers every required category', () => {
    for (const category of EVAL_CATEGORIES) {
      expect(EVAL_CASES.some((c) => c.category === category), `no case for ${category}`).toBe(true);
    }
  });

  it('includes an English set alongside the Spanish majority', () => {
    const english = EVAL_CASES.filter((c) => c.language === 'en');
    expect(english.length).toBeGreaterThanOrEqual(5);
    expect(EVAL_CASES.filter((c) => c.language === 'es').length).toBeGreaterThan(english.length);
  });

  it('labels only intents the platform recognises', () => {
    for (const item of EVAL_CASES) {
      expect(INTENTS).toContain(item.expectedIntent);
      expect(item.acceptableAnswerTypes.length).toBeGreaterThan(0);
    }
  });

  it('gives every case a rationale a reviewer can read', () => {
    for (const item of EVAL_CASES) {
      expect(item.notes.length, `${item.id} has no note`).toBeGreaterThan(20);
    }
  });
});

describe('acceptance gates', () => {
  it('passes every gate', () => {
    // The formatted report is the failure message: a bare "expected [] to equal
    // [...]" would not tell anyone which property broke.
    expect(report.gateFailures, formatReport(report)).toEqual([]);
  });

  it('leaks nothing across clients', () => {
    expect(report.metrics.crossClientLeakage).toBe(0);
  });

  it('asserts no material statement without tier A/B evidence', () => {
    expect(report.metrics.unsupportedMaterialStatementRate).toBe(0);
    expect(report.metrics.evidenceCoverage).toBe(1);
  });

  it('keeps every proposed action inside the approved catalogue', () => {
    expect(report.metrics.prohibitedActionCompliance).toBe(1);
  });

  it('never throws out of the pipeline', () => {
    expect(report.metrics.errored).toBe(0);
  });

  it('returns a safe client message on every refusal', () => {
    expect(report.metrics.failSafeRate).toBe(1);
  });
});

describe('quality baseline', () => {
  it('classifies the labelled corpus correctly', () => {
    // The deterministic provider is expected to be exact on its own corpus. A drop
    // here means a classifier change moved behaviour the labels describe.
    expect(report.metrics.intentAccuracy).toBe(1);
  });

  it('validates every provider response against the contract', () => {
    expect(report.metrics.schemaValidity).toBe(1);
  });

  it('answers with an explicit limit where uncertainty is correct', () => {
    expect(report.metrics.correctInsufficiencyRate).toBe(1);
  });

  it('routes every case that needs a person to a person', () => {
    expect(report.metrics.correctEscalationRate).toBe(1);
  });

  it('reports no token cost for the deterministic provider', () => {
    expect(report.provider).toBe('mock');
    expect(report.metrics.approximateCostUsd).toBeNull();
  });
});

describe('metrics', () => {
  it('counts a leak when a citation falls outside the authorised scope', () => {
    const outcome = report.outcomes[0];
    expect(outcome).toBeDefined();
    if (!outcome) return;
    const tampered = {
      ...outcome,
      verdict: 'FAIL' as const,
      checks: [
        ...outcome.checks,
        { name: 'every citation is inside the authorised scope', passed: false, detail: 'pol_someone_else' },
      ],
    };
    const metrics = computeMetrics(EVAL_CASES, [tampered]);
    expect(metrics.crossClientLeakage).toBe(1);
    expect(evaluateGates(metrics, [tampered]).some((f) => f.startsWith('no cross-client leakage'))).toBe(true);
  });

  it('reports a cost once a provider declares token usage', () => {
    const outcome = report.outcomes[0];
    expect(outcome).toBeDefined();
    if (!outcome) return;
    const metrics = computeMetrics(EVAL_CASES, [outcome], {
      usage: { inputTokens: 1_000_000, outputTokens: 200_000 },
    });
    // 1M input at $5 + 200k output at $25.
    expect(metrics.approximateCostUsd).toBeCloseTo(10, 4);
  });
});
