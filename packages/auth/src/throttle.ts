/**
 * Sign-in throttling (blueprint §15.1).
 *
 * A shared demo password over seeded accounts (ADR-0004) is weak by design, but
 * "weak" and "unlimited attempts" are different problems, and only one of them is
 * inherent to the prototype. Without a limit, the login form is an oracle: an
 * attacker can enumerate accounts and guess passwords as fast as the network allows,
 * and nothing anywhere records that it happened.
 *
 * The counter is keyed on the identifier being attempted rather than only on a client
 * address, so distributing an attack across addresses does not reset it. It is
 * in-process, which is the same limitation the request rate limiter has and is
 * recorded as a residual risk in the threat model.
 */

export interface ThrottleDecision {
  allowed: boolean;
  /** Attempts left before lockout. Zero once locked. */
  remaining: number;
  /** Milliseconds until the lock lifts. Zero when not locked. */
  retryAfterMs: number;
}

export interface LoginThrottleOptions {
  /** Failures tolerated inside the window before the identifier locks. */
  maxFailures?: number;
  /** How long failures are remembered. */
  windowMs?: number;
  /** How long a locked identifier stays locked. */
  lockoutMs?: number;
}

interface Entry {
  failures: number[];
  lockedUntil: number;
}

export const DEFAULT_MAX_FAILURES = 5;
export const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
export const DEFAULT_LOCKOUT_MS = 15 * 60 * 1000;

export class LoginThrottle {
  private readonly entries = new Map<string, Entry>();
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly lockoutMs: number;

  constructor(options: LoginThrottleOptions = {}) {
    this.maxFailures = options.maxFailures ?? DEFAULT_MAX_FAILURES;
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.lockoutMs = options.lockoutMs ?? DEFAULT_LOCKOUT_MS;
  }

  /**
   * Normalises the key so `Ana@Cliente.TEST ` and `ana@cliente.test` are one
   * identifier rather than two independent attempt budgets.
   */
  private key(identifier: string): string {
    return identifier.trim().toLocaleLowerCase('en-US');
  }

  private entry(identifier: string): Entry {
    const key = this.key(identifier);
    const existing = this.entries.get(key);
    if (existing) return existing;
    const created: Entry = { failures: [], lockedUntil: 0 };
    this.entries.set(key, created);
    return created;
  }

  /** Checks whether an attempt may proceed. Does not record anything. */
  check(identifier: string, now: number = Date.now()): ThrottleDecision {
    const entry = this.entry(identifier);
    if (entry.lockedUntil > now) {
      return { allowed: false, remaining: 0, retryAfterMs: entry.lockedUntil - now };
    }
    const recent = entry.failures.filter((at) => now - at < this.windowMs);
    return {
      allowed: true,
      remaining: Math.max(0, this.maxFailures - recent.length),
      retryAfterMs: 0,
    };
  }

  /** Records a failure and returns the decision that now applies. */
  recordFailure(identifier: string, now: number = Date.now()): ThrottleDecision {
    const entry = this.entry(identifier);
    entry.failures = entry.failures.filter((at) => now - at < this.windowMs);
    entry.failures.push(now);

    if (entry.failures.length >= this.maxFailures) {
      entry.lockedUntil = now + this.lockoutMs;
      // The window is cleared with the lock so one further failure after it lifts
      // does not immediately re-lock the identifier.
      entry.failures = [];
      return { allowed: false, remaining: 0, retryAfterMs: this.lockoutMs };
    }
    return {
      allowed: true,
      remaining: this.maxFailures - entry.failures.length,
      retryAfterMs: 0,
    };
  }

  /** Clears the record for an identifier after a successful sign-in. */
  recordSuccess(identifier: string): void {
    this.entries.delete(this.key(identifier));
  }

  /** Drops entries that can no longer affect a decision. */
  prune(now: number = Date.now()): void {
    for (const [key, entry] of this.entries) {
      const stale = entry.failures.every((at) => now - at >= this.windowMs);
      if (stale && entry.lockedUntil <= now) this.entries.delete(key);
    }
  }
}

/**
 * The message shown to a locked-out user.
 *
 * Deliberately identical in shape to the ordinary failure message: telling an
 * attacker *which* identifiers lock out confirms which ones exist.
 */
export function lockoutMessage(retryAfterMs: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
  return `Demasiados intentos fallidos. Vuelve a intentarlo en ${minutes} minuto(s).`;
}
