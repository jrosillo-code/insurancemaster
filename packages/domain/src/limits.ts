/** Input limits and content rules (blueprint §21 Security and Privacy). */

export const MAX_MESSAGE_CHARS = 4_000;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
export const MAX_CONVERSATION_MESSAGES = 200;

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function isAllowedMimeType(mime: string): mime is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

/** Per-client message rate limit. Applied server-side; the UI limit is secondary. */
export const RATE_LIMIT = { windowMs: 60_000, maxMessages: 20 } as const;

/**
 * A fixed-window rate limiter. Deliberately in-memory and per-process: it is a
 * prototype guard against runaway loops and accidental abuse, not a distributed
 * quota. A pilot needs a shared store (see docs/security/threat-model.md).
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly windowMs: number = RATE_LIMIT.windowMs,
    private readonly max: number = RATE_LIMIT.maxMessages,
  ) {}

  /** Returns true when the request is allowed. `now` is injected to keep tests deterministic. */
  check(key: string, now: number = Date.now()): { allowed: boolean; retryAfterMs: number } {
    const entry = this.hits.get(key);
    if (!entry || now >= entry.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, retryAfterMs: 0 };
    }
    if (entry.count >= this.max) {
      return { allowed: false, retryAfterMs: entry.resetAt - now };
    }
    entry.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }

  reset(): void {
    this.hits.clear();
  }
}
