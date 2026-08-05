import { CATEGORY_LABELS, type EvalOutcome, type EvalReport } from './types';

/**
 * Report rendering.
 *
 * Written for a reviewer, not a dashboard: the failures come first with the exact
 * check that failed and the case's one-line rationale, because a scorecard nobody
 * can act on is decoration.
 */

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

export function formatReport(report: EvalReport, options: { notes?: Map<string, string> } = {}): string {
  const { metrics } = report;
  const lines: string[] = [];

  lines.push('');
  lines.push('Rosillo AI Platform — Concierge evaluation');
  lines.push('SYNTHETIC DATA ONLY. No real client, policy or claim data is involved.');
  lines.push('─'.repeat(78));
  lines.push(`Generated       ${report.generatedAt}`);
  lines.push(`Provider        ${report.provider} (${report.model})`);
  lines.push(
    `Prompts         ${Object.entries(report.promptVersions)
      .map(([id, version]) => `${id}@${version}`)
      .join(', ')}`,
  );
  lines.push(
    `Dataset         ${Object.entries(report.datasetSummary)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ')}`,
  );
  lines.push('');

  lines.push(`Cases           ${metrics.cases}  (pass ${metrics.passed} · fail ${metrics.failed} · error ${metrics.errored})`);
  lines.push('');
  lines.push('Quality');
  lines.push(`  intent accuracy                     ${pct(metrics.intentAccuracy)}`);
  lines.push(`  schema validity                     ${pct(metrics.schemaValidity)}`);
  lines.push(`  evidence coverage                   ${pct(metrics.evidenceCoverage)}`);
  lines.push(`  unsupported material statements     ${pct(metrics.unsupportedMaterialStatementRate)}`);
  lines.push(`  correct insufficiency               ${pct(metrics.correctInsufficiencyRate)}`);
  lines.push(`  correct escalation                  ${pct(metrics.correctEscalationRate)}`);
  lines.push('');
  lines.push('Safety');
  lines.push(`  cross-client leakage                ${metrics.crossClientLeakage} case(s)`);
  lines.push(`  prohibited-action compliance        ${pct(metrics.prohibitedActionCompliance)}`);
  lines.push(`  blocked action attempts             ${metrics.blockedActionAttempts}`);
  lines.push('');
  lines.push('Robustness');
  lines.push(`  repair rate                         ${pct(metrics.repairRate)}`);
  lines.push(`  fail-safe rate                      ${pct(metrics.failSafeRate)}`);
  lines.push(`  latency p50 / p95 / max             ${metrics.latencyMsP50} / ${metrics.latencyMsP95} / ${metrics.latencyMsMax} ms`);
  lines.push(
    `  provider tokens                     ${
      metrics.inputTokens === null && metrics.outputTokens === null
        ? 'n/a (deterministic provider)'
        : `${metrics.inputTokens ?? 0} in / ${metrics.outputTokens ?? 0} out`
    }`,
  );
  lines.push(
    `  approximate cost                    ${
      metrics.approximateCostUsd === null ? 'n/a (no live provider)' : `$${metrics.approximateCostUsd.toFixed(4)}`
    }`,
  );
  lines.push('');

  lines.push('By category');
  for (const score of metrics.byCategory) {
    const bar = score.total === score.passed ? '' : '  ← attention';
    lines.push(`  ${pad(CATEGORY_LABELS[score.category], 52)} ${score.passed}/${score.total}${bar}`);
  }
  lines.push('');

  const problems = report.outcomes.filter((o) => o.verdict !== 'PASS');
  if (problems.length > 0) {
    lines.push('Failures');
    for (const outcome of problems) {
      lines.push(`  ${outcome.caseId} [${outcome.category}] ${outcome.verdict}`);
      const note = options.notes?.get(outcome.caseId);
      if (note) lines.push(`     intent: ${note}`);
      lines.push(
        `     observed: intent=${outcome.observedIntent ?? '—'} answerType=${outcome.observedAnswerType ?? '—'} evidence=${outcome.evidenceCount} task=${outcome.taskCreated}`,
      );
      for (const check of outcome.checks.filter((c) => !c.passed)) {
        lines.push(`     ✗ ${check.name} — ${check.detail}`);
      }
    }
    lines.push('');
  }

  if (report.gateFailures.length > 0) {
    lines.push('ACCEPTANCE GATES FAILED');
    for (const failure of report.gateFailures) lines.push(`  ✗ ${failure}`);
  } else {
    lines.push('All acceptance gates passed.');
  }
  lines.push('');

  return lines.join('\n');
}

/** Machine-readable form, written next to the console output for trend tracking. */
export function toJson(report: EvalReport): string {
  return JSON.stringify(report, null, 2);
}

export function summariseOutcome(outcome: EvalOutcome): string {
  const failedChecks = outcome.checks.filter((c) => !c.passed).map((c) => c.name);
  return `${outcome.caseId} ${outcome.verdict}${failedChecks.length > 0 ? ` (${failedChecks.join('; ')})` : ''}`;
}
