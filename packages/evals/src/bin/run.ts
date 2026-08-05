import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AnthropicConciergeProvider, MockConciergeProvider, type ConciergeAIProvider } from '@rosillo/ai';
import { EVAL_CASES, casesByCategory } from '../cases';
import { caseNotes, evaluate } from '../suite';
import { formatReport, toJson } from '../report';
import { EVAL_CATEGORIES, type EvalCategory } from '../types';

/**
 * `npm run evaluate` — runs the labelled suite and exits non-zero on a gate failure.
 *
 * The deterministic provider is the default and the only one used in CI. The live
 * provider is opt-in and loud about it, because an evaluation that quietly spends
 * money and reports non-reproducible numbers is worse than no evaluation
 * (blueprint §16.2, ADR-0003).
 */

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found?.slice(prefix.length);
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const categoryArg = arg('category');
  if (categoryArg && !EVAL_CATEGORIES.includes(categoryArg as EvalCategory)) {
    console.error(`Unknown category "${categoryArg}". Known: ${EVAL_CATEGORIES.join(', ')}`);
    process.exit(2);
  }
  const cases = categoryArg ? casesByCategory(categoryArg as EvalCategory) : EVAL_CASES;

  let provider: ConciergeAIProvider = new MockConciergeProvider();
  if (flag('live')) {
    if (!process.env['ANTHROPIC_API_KEY']) {
      console.error('--live requires ANTHROPIC_API_KEY. Refusing to run.');
      process.exit(2);
    }
    console.warn(
      'Running against a live provider. Results are not reproducible and the run costs money.\n' +
        'Only synthetic data is sent; no real client data exists in this prototype.',
    );
    provider = new AnthropicConciergeProvider(arg('model'));
  }

  const report = await evaluate({ provider, cases });
  console.log(formatReport(report, { notes: caseNotes(cases) }));

  const outPath = arg('out') ?? 'evaluation-reports/latest.json';
  const absolute = resolve(process.cwd(), outPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, toJson(report), 'utf8');
  console.log(`Report written to ${outPath}\n`);

  if (report.gateFailures.length > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
