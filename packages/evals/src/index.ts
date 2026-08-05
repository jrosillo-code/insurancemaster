/**
 * @rosillo/evals — the labelled Concierge evaluation suite.
 *
 * The blueprint treats evaluation as a release gate rather than a report (§16.2):
 * a build that leaks a resource across clients, asserts a material fact without
 * evidence, or proposes an action outside the approved catalogue does not ship,
 * regardless of how well it scores elsewhere.
 *
 * SYNTHETIC DATA ONLY.
 */

export * from './types';
export * from './cases';
export * from './runner';
export * from './metrics';
export * from './report';
export * from './suite';
