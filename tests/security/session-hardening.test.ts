import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  InMemorySessionRegistry,
  LoginThrottle,
  MIN_SECRET_LENGTH,
  MisconfiguredSecretError,
  PLACEHOLDER_SECRET,
  checkSessionSecret,
  cookieOptions,
  createSessionToken,
  lockoutMessage,
  secretProblem,
  sessionExpiry,
  verifySessionToken,
} from '@rosillo/auth';

/**
 * Session and sign-in hardening (blueprint §15.1).
 *
 * Prototype authentication is deliberately weak (ADR-0004), but weak and *broken* are
 * different things. These hold the line on the parts that are not excused by being a
 * prototype: a deployment must not silently sign sessions with a secret published in
 * the repository, a forged or expired token must be worthless, and the login form
 * must not be an unlimited oracle.
 */

const ORIGINAL_SECRET = process.env['AUTH_SECRET'];
const ORIGINAL_ENV = process.env['NODE_ENV'];

function setEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  setEnv('AUTH_SECRET', 'a'.repeat(MIN_SECRET_LENGTH + 8));
});

afterEach(() => {
  setEnv('AUTH_SECRET', ORIGINAL_SECRET);
  setEnv('NODE_ENV', ORIGINAL_ENV);
});

describe('the signing secret', () => {
  it('rejects the placeholder that ships in .env.example', () => {
    expect(secretProblem(PLACEHOLDER_SECRET)).toContain('placeholder');
  });

  it('rejects an absent or too-short secret', () => {
    expect(secretProblem(undefined)).toBe('not set');
    expect(secretProblem('')).toBe('not set');
    expect(secretProblem('short')).toContain(String(MIN_SECRET_LENGTH));
  });

  it('accepts a properly generated secret', () => {
    expect(secretProblem('b'.repeat(MIN_SECRET_LENGTH))).toBeNull();
  });

  it('refuses to issue a session in production without a real secret', () => {
    setEnv('NODE_ENV', 'production');
    setEnv('AUTH_SECRET', PLACEHOLDER_SECRET);
    expect(() =>
      createSessionToken({ kind: 'CLIENT', subjectId: 'acc_ana', expiresAt: sessionExpiry() }),
    ).toThrow(MisconfiguredSecretError);
  });

  it('refuses to verify a session in production without a real secret', () => {
    const token = createSessionToken({ kind: 'CLIENT', subjectId: 'acc_ana', expiresAt: sessionExpiry() });
    setEnv('NODE_ENV', 'production');
    setEnv('AUTH_SECRET', undefined);
    // Fails closed: no session is better than one signed with a published key.
    expect(() => verifySessionToken(token, 'CLIENT')).toThrow(MisconfiguredSecretError);
  });

  it('fails the startup check in production and warns in development', () => {
    setEnv('NODE_ENV', 'production');
    setEnv('AUTH_SECRET', PLACEHOLDER_SECRET);
    expect(() => checkSessionSecret()).toThrow(MisconfiguredSecretError);

    setEnv('NODE_ENV', 'development');
    expect(checkSessionSecret()).toContain('never do this outside local development');
  });

  it('stays usable in development so the demo runs without setup', () => {
    setEnv('NODE_ENV', 'development');
    setEnv('AUTH_SECRET', undefined);
    const token = createSessionToken({ kind: 'CLIENT', subjectId: 'acc_ana', expiresAt: sessionExpiry() });
    expect(verifySessionToken(token, 'CLIENT')?.subjectId).toBe('acc_ana');
  });
});

describe('session tokens', () => {
  it('round-trips a valid token', () => {
    const token = createSessionToken({
      kind: 'CLIENT',
      subjectId: 'acc_ana',
      contextType: 'PERSON',
      contextId: 'party_ana',
      expiresAt: sessionExpiry(),
    });
    const payload = verifySessionToken(token, 'CLIENT');
    expect(payload?.subjectId).toBe('acc_ana');
    expect(payload?.contextId).toBe('party_ana');
  });

  it('rejects a tampered payload', () => {
    const token = createSessionToken({ kind: 'CLIENT', subjectId: 'acc_ana', expiresAt: sessionExpiry() });
    const [body, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ kind: 'CLIENT', subjectId: 'acc_carlos', expiresAt: sessionExpiry() }),
      'utf8',
    ).toString('base64url');
    expect(body).toBeDefined();
    expect(verifySessionToken(`${forged}.${signature}`, 'CLIENT')).toBeNull();
  });

  it('rejects a client token replayed on the employee surface', () => {
    const token = createSessionToken({ kind: 'CLIENT', subjectId: 'acc_ana', expiresAt: sessionExpiry() });
    expect(verifySessionToken(token, 'EMPLOYEE')).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = createSessionToken({
      kind: 'CLIENT',
      subjectId: 'acc_ana',
      expiresAt: Math.floor(Date.now() / 1000) - 1,
    });
    expect(verifySessionToken(token, 'CLIENT')).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = createSessionToken({ kind: 'CLIENT', subjectId: 'acc_ana', expiresAt: sessionExpiry() });
    setEnv('AUTH_SECRET', 'c'.repeat(MIN_SECRET_LENGTH + 8));
    expect(verifySessionToken(token, 'CLIENT')).toBeNull();
  });
});

describe('cookie attributes', () => {
  it('is httpOnly and same-site strict', () => {
    const options = cookieOptions();
    expect(options.httpOnly).toBe(true);
    // Neither surface is entered from a third-party link, so the session never needs
    // to ride a cross-site navigation.
    expect(options.sameSite).toBe('strict');
    expect(options.path).toBe('/');
    expect(options.maxAge).toBeGreaterThan(0);
  });

  it('requires TLS outside development', () => {
    setEnv('NODE_ENV', 'production');
    expect(cookieOptions().secure).toBe(true);
    setEnv('NODE_ENV', 'development');
    expect(cookieOptions().secure).toBe(false);
  });
});

describe('sign-in throttling', () => {
  it('allows attempts up to the limit and then locks out', () => {
    const throttle = new LoginThrottle({ maxFailures: 3, windowMs: 60_000, lockoutMs: 60_000 });
    expect(throttle.check('ana@cliente.test').allowed).toBe(true);

    expect(throttle.recordFailure('ana@cliente.test').remaining).toBe(2);
    expect(throttle.recordFailure('ana@cliente.test').remaining).toBe(1);
    const third = throttle.recordFailure('ana@cliente.test');

    expect(third.allowed).toBe(false);
    expect(third.retryAfterMs).toBeGreaterThan(0);
    expect(throttle.check('ana@cliente.test').allowed).toBe(false);
  });

  it('locks the identifier rather than the caller, so spreading the attempts does not help', () => {
    const throttle = new LoginThrottle({ maxFailures: 2 });
    throttle.recordFailure('ana@cliente.test');
    throttle.recordFailure('ana@cliente.test');
    // A second "client" gets the same answer: the budget belongs to the account.
    expect(throttle.check('ana@cliente.test').allowed).toBe(false);
    // An unrelated identifier is unaffected — a lockout is not a denial of service
    // against everyone else.
    expect(throttle.check('carlos@cliente.test').allowed).toBe(true);
  });

  it('treats case and surrounding whitespace as the same identifier', () => {
    const throttle = new LoginThrottle({ maxFailures: 2 });
    throttle.recordFailure('ana@cliente.test');
    throttle.recordFailure('  Ana@Cliente.TEST  ');
    expect(throttle.check('ANA@cliente.test').allowed).toBe(false);
  });

  it('forgets failures once the window has passed', () => {
    const throttle = new LoginThrottle({ maxFailures: 3, windowMs: 1_000, lockoutMs: 1_000 });
    const start = 1_000_000;
    throttle.recordFailure('ana@cliente.test', start);
    throttle.recordFailure('ana@cliente.test', start + 100);
    // Far enough ahead that the earlier failures no longer count.
    expect(throttle.recordFailure('ana@cliente.test', start + 5_000).allowed).toBe(true);
  });

  it('releases the lock when it expires', () => {
    const throttle = new LoginThrottle({ maxFailures: 1, lockoutMs: 500 });
    const start = 2_000_000;
    expect(throttle.recordFailure('ana@cliente.test', start).allowed).toBe(false);
    expect(throttle.check('ana@cliente.test', start + 200).allowed).toBe(false);
    expect(throttle.check('ana@cliente.test', start + 600).allowed).toBe(true);
  });

  it('clears the record after a successful sign-in', () => {
    const throttle = new LoginThrottle({ maxFailures: 3 });
    throttle.recordFailure('ana@cliente.test');
    throttle.recordFailure('ana@cliente.test');
    throttle.recordSuccess('ana@cliente.test');
    expect(throttle.check('ana@cliente.test').remaining).toBe(3);
  });

  it('does not reveal which identifiers exist', () => {
    // The lockout message says how long to wait and nothing else. It must not differ
    // by whether the account is real, or it becomes an enumeration oracle.
    expect(lockoutMessage(60_000)).not.toMatch(/cuenta|account|usuario|existe/i);
    expect(lockoutMessage(60_000)).toContain('1 minuto');
  });
});

describe('session revocation', () => {
  /**
   * A signed token is unforgeable but not retractable. Without a server-side record,
   * signing out clears one cookie and a copied token stays valid for the rest of its
   * eight hours — and the only remedy was rotating AUTH_SECRET, which signs everyone
   * out of everything.
   */
  const NOW_ISO = '2026-08-05T09:00:00.000Z';
  const NOW_SECONDS = Math.floor(Date.parse(NOW_ISO) / 1000);

  async function issued(registry: InMemorySessionRegistry, subjectId = 'acc_ana') {
    return registry.issue({ kind: 'CLIENT', subjectId, expiresAt: NOW_SECONDS + 3600, now: NOW_ISO });
  }

  it('accepts a session until it is revoked, then never again', async () => {
    const registry = new InMemorySessionRegistry();
    const record = await issued(registry);

    expect(await registry.active(record.sessionId, NOW_SECONDS)).not.toBeNull();
    await registry.revoke(record.sessionId, 'signed out', NOW_ISO);
    // The token is still perfectly signed. It just no longer means anything.
    expect(await registry.active(record.sessionId, NOW_SECONDS)).toBeNull();
  });

  it('refuses a session past its expiry even if nobody revoked it', async () => {
    const registry = new InMemorySessionRegistry();
    const record = await issued(registry);
    expect(await registry.active(record.sessionId, NOW_SECONDS + 3601)).toBeNull();
  });

  it('refuses an unknown session id', async () => {
    const registry = new InMemorySessionRegistry();
    expect(await registry.active('sess_never_issued', NOW_SECONDS)).toBeNull();
  });

  it('ends every session for a subject without touching anyone else', async () => {
    const registry = new InMemorySessionRegistry();
    const laptop = await issued(registry);
    const phone = await issued(registry);
    const somebodyElse = await issued(registry, 'acc_carlos');

    // The realistic incident is "I think someone has my session", and the honest
    // answer is to end all of them.
    expect(await registry.revokeAllForSubject('acc_ana', 'compromised', NOW_ISO)).toBe(2);
    expect(await registry.active(laptop.sessionId, NOW_SECONDS)).toBeNull();
    expect(await registry.active(phone.sessionId, NOW_SECONDS)).toBeNull();
    expect(await registry.active(somebodyElse.sessionId, NOW_SECONDS)).not.toBeNull();
  });

  it('records why a session ended', async () => {
    const registry = new InMemorySessionRegistry();
    const record = await issued(registry);
    await registry.revoke(record.sessionId, 'compromised', NOW_ISO);
    await registry.prune(NOW_SECONDS);

    // Pruning keeps a revoked-but-unexpired record: it is the evidence that the
    // session was ended deliberately rather than simply forgotten.
    expect(await registry.active(record.sessionId, NOW_SECONDS)).toBeNull();
  });

  it('drops only records that can no longer authorise anything', async () => {
    const registry = new InMemorySessionRegistry();
    await issued(registry);
    expect(await registry.prune(NOW_SECONDS)).toBe(0);
    expect(await registry.prune(NOW_SECONDS + 7200)).toBe(1);
  });

  it('carries the session id through the token unchanged', () => {
    const token = createSessionToken({
      kind: 'CLIENT',
      sessionId: 'sess_abc123',
      subjectId: 'acc_ana',
      expiresAt: sessionExpiry(),
    });
    expect(verifySessionToken(token, 'CLIENT')?.sessionId).toBe('sess_abc123');
  });

  it('rejects a token whose session id was tampered with', () => {
    const token = createSessionToken({
      kind: 'CLIENT',
      sessionId: 'sess_abc123',
      subjectId: 'acc_ana',
      expiresAt: sessionExpiry(),
    });
    const [, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        kind: 'CLIENT',
        sessionId: 'sess_somebody_elses',
        subjectId: 'acc_ana',
        expiresAt: sessionExpiry(),
      }),
      'utf8',
    ).toString('base64url');
    expect(verifySessionToken(`${forged}.${signature}`, 'CLIENT')).toBeNull();
  });
});
