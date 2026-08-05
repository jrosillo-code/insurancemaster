import { randomUUID } from 'node:crypto';

/**
 * Identifier generation.
 *
 * Injectable so the evaluation suite and tests can run with a deterministic
 * sequence — a scorecard that changes because a UUID changed is not a scorecard.
 */
export interface IdFactory {
  trace(): string;
  response(): string;
  task(): string;
  message(): string;
  run(): string;
  conversation(): string;
}

export function randomIdFactory(): IdFactory {
  const id = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  return {
    trace: () => id('trace'),
    response: () => id('resp'),
    task: () => id('task'),
    message: () => id('msg'),
    run: () => id('run'),
    conversation: () => id('conv'),
  };
}

/** Deterministic counter-based ids. Used by tests and the evaluation runner. */
export function sequentialIdFactory(seed = 0): IdFactory {
  const counters = new Map<string, number>();
  const next = (prefix: string) => {
    const value = (counters.get(prefix) ?? seed) + 1;
    counters.set(prefix, value);
    return `${prefix}_${String(value).padStart(6, '0')}`;
  };
  return {
    trace: () => next('trace'),
    response: () => next('resp'),
    task: () => next('task'),
    message: () => next('msg'),
    run: () => next('run'),
    conversation: () => next('conv'),
  };
}
