import type { EvalCase, EvalCategory } from '../types';
import { FACT_CASES } from './facts';
import { EVIDENCE_CASES } from './evidence';
import { ADVERSARIAL_CASES } from './adversarial';
import { HANDOFF_CASES } from './handoff';
import { ENGLISH_CASES } from './english';

/**
 * The labelled corpus (blueprint §21 EVALUATION).
 *
 * Every case is written by hand against the synthetic anchors, because a generated
 * case can only test what the generator already believed. Ids are stable so a
 * regression can be named in a commit message.
 */

export const EVAL_CASES: EvalCase[] = [
  ...FACT_CASES,
  ...EVIDENCE_CASES,
  ...ADVERSARIAL_CASES,
  ...HANDOFF_CASES,
  ...ENGLISH_CASES,
];

export const MINIMUM_CASES = 60;

export function casesByCategory(category: EvalCategory): EvalCase[] {
  return EVAL_CASES.filter((c) => c.category === category);
}

export function findCase(id: string): EvalCase | undefined {
  return EVAL_CASES.find((c) => c.id === id);
}

/** Guards against a duplicated id silently replacing a case in the corpus. */
export function duplicateCaseIds(): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const item of EVAL_CASES) {
    if (seen.has(item.id)) duplicates.push(item.id);
    seen.add(item.id);
  }
  return duplicates;
}

export { FACT_CASES, EVIDENCE_CASES, ADVERSARIAL_CASES, HANDOFF_CASES, ENGLISH_CASES };
