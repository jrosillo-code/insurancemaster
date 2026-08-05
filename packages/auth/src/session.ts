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
  /** Active context for client sessions; absent for employees. */
  contextType?: 'PERSON' | 'ORGANISATION';
  contextId?: string;
  /** Unix seconds. */
  expiresAt: number;
}

function secret(): string {
  return process.env['AUTH_SECRET'] ?? 'dev-only-secret-change-me';
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
  if (typeof payload.expiresAt !== 'number' || payload.expiresAt <= nowSeconds) return null;
  if (payload.contextType !== undefined && payload.contextType !== 'PERSON' && payload.contextType !== 'ORGANISATION') {
    return null;
  }

  return {
    kind: payload.kind,
    subjectId: payload.subjectId,
    ...(payload.contextType ? { contextType: payload.contextType } : {}),
    ...(payload.contextId ? { contextId: payload.contextId } : {}),
    expiresAt: payload.expiresAt,
  };
}

export function sessionExpiry(nowSeconds: number = Math.floor(Date.now() / 1000)): number {
  return nowSeconds + SESSION_MAX_AGE_SECONDS;
}

/** Cookie attributes used by both apps. `secure` is set outside development. */
export function cookieOptions(): {
  httpOnly: true;
  sameSite: 'lax';
  path: string;
  maxAge: number;
  secure: boolean;
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: process.env['NODE_ENV'] === 'production',
  };
}
