import { MockConciergeProvider, type ConciergeAIProvider } from '@rosillo/ai';
import { datasetSummary } from '@rosillo/customer-360';
import { EVAL_CASES } from './cases';
import { computeMetrics, evaluateGates, type CostModel } from './metrics';
import { runSuite } from './runner';
import type { EvalCase, EvalReport } from './types';

/**
 * One call that produces the whole scorecard, used by the CLI, the regression test
 * and anything else that needs a verdict rather than a stream of outcomes.
 */

export interface SuiteOptions {
  provider?: ConciergeAIProvider;
  cases?: EvalCase[];
  costModel?: CostModel;
  /** Injected so a report is byte-identical between runs of the same build. */
  generatedAt?: string;
}

export async function evaluate(options: SuiteOptions = {}): Promise<EvalReport> {
  const provider: ConciergeAIProvider = options.provider ?? new MockConciergeProvider();
  const cases = options.cases ?? EVAL_CASES;
  const outcomes = await runSuite({ provider, cases });
  // `getUsage` is optional on the port: a provider with nothing to meter omits it.
  const usage = provider.getUsage?.() ?? null;
  const metrics = computeMetrics(cases, outcomes, {
    costModel: options.costModel,
    usage: usage && usage.requests > 0 ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } : null,
  });

  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    provider: provider.name,
    model: provider.model,
    promptVersions: provider.promptVersions,
    datasetSummary: datasetSummary(),
    metrics,
    outcomes,
    gateFailures: evaluateGates(metrics, outcomes),
  };
}

/** Case notes, keyed by id, for printing next to a failure. */
export function caseNotes(cases: EvalCase[] = EVAL_CASES): Map<string, string> {
  return new Map(cases.map((c) => [c.id, c.notes]));
}
