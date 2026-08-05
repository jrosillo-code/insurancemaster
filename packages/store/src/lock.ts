import { closeSync, mkdirSync, openSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * A cross-process advisory lock (ADR-0011).
 *
 * The Concierge and the employee workspace are separate processes appending to the
 * same files. Appending a line is one thing; appending an *audit* event is a
 * read-then-write — the previous hash comes from what is already on disk — and two
 * processes interleaving there both read the same head and both write an event
 * claiming it as their predecessor. The chain forks, and `verifyEventChain` reports
 * corruption that nobody caused maliciously.
 *
 * `open(..., 'wx')` fails if the path exists, which is atomic on every filesystem
 * this runs on, so the lock file itself is the mutex. Held for microseconds around a
 * single append, so contention is rare and a spin with backoff is the right shape —
 * no watcher, no async machinery, nothing to leak.
 */

export interface LockOptions {
  /** Give up after this long and proceed unlocked rather than failing the request. */
  timeoutMs?: number;
  /** A lock older than this is assumed to belong to a process that died. */
  staleMs?: number;
}

export const DEFAULT_LOCK_TIMEOUT_MS = 2_000;
export const DEFAULT_STALE_MS = 10_000;

/** Busy-waits without yielding the loop — deliberate: the hold time is a syscall. */
function spin(ms: number): void {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    /* empty */
  }
}

function breakIfStale(lockPath: string, staleMs: number): void {
  try {
    const age = Date.now() - statSync(lockPath).mtimeMs;
    if (age > staleMs) rmSync(lockPath, { force: true });
  } catch {
    // Gone already, or never there. Either way there is nothing to break.
  }
}

/**
 * Runs `fn` while holding the lock for `target`.
 *
 * On timeout the work proceeds **unlocked** rather than throwing. That is the right
 * trade for this prototype: a forked audit chain is detectable and recoverable, a
 * client whose message vanishes because a lock file was stuck is not. The fallback is
 * reported through the return value so a caller can surface it.
 */
export function withFileLock<T>(target: string, fn: () => T, options: LockOptions = {}): { value: T; locked: boolean } {
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const lockPath = `${target}.lock`;

  mkdirSync(dirname(lockPath), { recursive: true });

  let handle: number | null = null;
  const deadline = Date.now() + timeoutMs;
  let delay = 1;

  while (handle === null && Date.now() < deadline) {
    try {
      handle = openSync(lockPath, 'wx');
    } catch {
      breakIfStale(lockPath, staleMs);
      spin(delay);
      delay = Math.min(delay * 2, 25);
    }
  }

  try {
    return { value: fn(), locked: handle !== null };
  } finally {
    if (handle !== null) {
      closeSync(handle);
      rmSync(lockPath, { force: true });
    }
  }
}
