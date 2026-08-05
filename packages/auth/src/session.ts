import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Prototype session tokens (ADR-0004).
 *
 * Deliberately minimal: an HMAC-signed, expiring payload carried in an httpOnly
 * cookie. This is *not* production authentication — a pilot needs the existing
 * Rosillo app identity, passkeys or strong MFA for employees, and step-up
 * authentication for sensitive actions (blueprint §12.3). What it does provide is a
 * server-verified session with no client-controlled trust, so authorisation testing
 * is meaningful.
 *
 * The two surfaces use different cookie names and different payload kinds, so an
 * employee token can never be replayed as a client token or vice versa.
 */

export type SessionKind = 'CLIENT' | 'EMPLOYEE';

export const CLIENT_COOKIE = 'rosillo_client_session';
export const EMPLOYEE_COOKIE = 'rosillo_employee_session';
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/** Shared demo password. Prototype-only; see ADR-0004 and the threat model. */
export const DEMO_PASSWORD = 'demo';

export interface SessionPayload {
  kind: SessionKind;
  /** Account id for clients, employee id for employees. */
  subjectId: string;
  /**
   * Identifies a server-side session record. Present on every token issued since
   * revocation existed; optional so an in-flight token from before it does not
   * hard-fail, and treated as unrevocable when absent.
   */
  sessionId?: string;
  /** Active context for client sessions; absent for employees. */
  contextType?: 'PERSON' | 'ORGANISATION';
  contextId?: string;
  /** Unix seconds. */
  expiresAt: number;
}

/**
 * The placeholder shipped in `.env.example`. It is committed to the repository, so
 * anyone who can read the repository can forge a session signed with it.
 */
export const PLACEHOLDER_SECRET = 'dev-only-secret-change-me';

/** Below this, searching the key space is worth an attacker's time. */
export const MIN_SECRET_LENGTH = 32;

export class MisconfiguredSecretError extends Error {
  constructor(reason: string) {
    super(
      `AUTH_SECRET is ${reason}. Refusing to issue or verify sessions. ` +
        'Generate one with: openssl rand -hex 32',
    );
    this.name = 'MisconfiguredSecretError';
  }
}

/**
 * Why a secret is unusable, or null when it is sound.
 *
 * Takes the value explicitly rather than defaulting to the environment: a predicate
 * where `secretProblem(undefined)` quietly means "check something else" is exactly
 * the kind of thing that reads as tested and is not.
 */
export function secretProblem(value: string | undefined): string | null {
  if (!value || value.length === 0) return 'not set';
  if (value === PLACEHOLDER_SECRET) return 'still the placeholder from .env.example';
  if (value.length < MIN_SECRET_LENGTH) return `shorter than ${MIN_SECRET_LENGTH} characters`;
  return null;
}

/**
 * Resolves the signing secret, failing closed outside development.
 *
 * The previous behaviour — silently falling back to the committed placeholder — meant
 * a deployment that merely forgot to set `AUTH_SECRET` had forgeable sessions and no
 * symptom to notice. Production now refuses to sign or verify anything at all, so the
 * failure is loud and immediate rather than silent and exploitable.
 *
 * Development keeps the placeholder: requiring a real secret to run the demo would
 * only teach people to paste one in and stop reading.
 */
function secret(): string {
  const configured = process.env['AUTH_SECRET'];
  const problem = secretProblem(configured);
  if (!problem) return configured as string;
  if (process.env['NODE_ENV'] === 'production') throw new MisconfiguredSecretError(problem);
  return configured && configured.length > 0 ? configured : PLACEHOLDER_SECRET;
}

/**
 * Startup check, for a host that would rather fail to boot than serve one bad
 * request. Throws in production; returns the warning to log in development.
 */
export function checkSessionSecret(): string | null {
  const problem = secretProblem(process.env['AUTH_SECRET']);
  if (!problem) return null;
  if (process.env['NODE_ENV'] === 'production') throw new MisconfiguredSecretError(problem);
  return `AUTH_SECRET is ${problem}. Using the development placeholder — never do this outside local development.`;
}

function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

function safeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function createSessionToken(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

/**
 * Verifies and decodes a token. Returns null for anything that fails — a tampered
 * signature, a wrong kind, an expired session or malformed JSON all look identical
 * to the caller.
 */
export function verifySessionToken(
  token: string | undefined | null,
  expectedKind: SessionKind,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): SessionPayload | null {
  if (!token) return null;
  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;
  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!safeEquals(signature, sign(body))) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const payload = parsed as Partial<SessionPayload>;
  if (payload.kind !== expectedKind) return null;
  if (typeof payload.subjectId !== 'string' || payload.subjectId.length === 0) return null;
  if (payload.sessionId !== undefined && typeof payload.sessionId !== 'string') return null;
  if (typeof payload.expiresAt !== 'number' || payload.expiresAt <= nowSeconds) return null;
  if (payload.contextType !== undefined && payload.contextType !== 'PERSON' && payload.contextType !== 'ORGANISATION') {
    return null;
  }

  return {
    kind: payload.kind,
    subjectId: payload.subjectId,
    ...(payload.sessionId ? { sessionId: payload.sessionId } : {}),
    ...(payload.contextType ? { contextType: payload.contextType } : {}),
    ...(payload.contextId ? { contextId: payload.contextId } : {}),
    expiresAt: payload.expiresAt,
  };
}

export function sessionExpiry(nowSeconds: number = Math.floor(Date.now() / 1000)): number {
  return nowSeconds + SESSION_MAX_AGE_SECONDS;
}

/**
 * Cookie attributes used by both apps.
 *
 * `sameSite: 'strict'` rather than `'lax'`: neither surface is ever entered from a
 * third-party link, so there is no reason for the session to ride along on a
 * cross-site navigation. It costs nothing here and removes a class of CSRF entirely,
 * on top of the origin check Next.js applies to server actions.
 *
 * `secure` is set outside development, where there is no TLS to require.
 */
export function cookieOptions(): {
  httpOnly: true;
  sameSite: 'strict';
  path: string;
  maxAge: number;
  secure: boolean;
} {
  return {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: process.env['NODE_ENV'] === 'production',
  };
}
