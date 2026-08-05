import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ContextType } from '@rosillo/domain';
import {
  CLIENT_COOKIE,
  DEMO_PASSWORD,
  LoginThrottle,
  cookieOptions,
  createSessionToken,
  listAvailableContexts,
  lockoutMessage,
  sessionExpiry,
  verifySessionToken,
} from '@rosillo/auth';
import type { ClientAccount } from '@rosillo/customer-360';
import { nowIso, platform } from './platform';

/**
 * Client session handling.
 *
 * Every page and every server action resolves the session here, server-side. The
 * cookie carries an account id and an active context; both are re-validated against
 * the recorded grants on each request, so tampering with the cookie widens nothing
 * (see the security tests for the negative cases).
 */

export interface ClientSession {
  account: ClientAccount;
  contextType: ContextType;
  contextId: string;
  contextLabel: string;
  availableContexts: { type: ContextType; id: string; label: string }[];
}

/**
 * Failed-attempt budget, shared across the process.
 *
 * The demo password is weak on purpose; unlimited attempts against it would not be.
 * Held in a global so it survives a hot reload — a throttle that resets whenever a
 * file changes is not a throttle.
 */
declare global {
  // eslint-disable-next-line no-var
  var __rosilloClientThrottle: LoginThrottle | undefined;
}

function throttle(): LoginThrottle {
  globalThis.__rosilloClientThrottle ??= new LoginThrottle();
  return globalThis.__rosilloClientThrottle;
}

const INVALID_CREDENTIALS = 'Credenciales no válidas.';

/** Records a lockout so a credential-guessing run is visible afterwards. */
async function recordLockout(email: string, retryAfterMs: number): Promise<void> {
  await platform().store.appendAudit({
    occurredAt: nowIso(),
    actor: { type: 'CLIENT', id: 'anonymous' },
    action: 'RATE_LIMIT_APPLIED',
    resource: { type: 'login', id: 'client' },
    purposeCode: 'SECURITY_CONTROL',
    traceId: `login_${Date.now().toString(36)}`,
    modelRunId: null,
    beforeHash: null,
    afterHash: null,
    // The identifier attempted is not recorded: a failed login names someone who may
    // have nothing to do with the platform, and the count is what matters.
    metadata: { surface: 'client', retryAfterMs },
  });
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const limiter = throttle();
  const decision = limiter.check(email);
  if (!decision.allowed) {
    await recordLockout(email, decision.retryAfterMs);
    return lockoutMessage(decision.retryAfterMs);
  }

  const account = password === DEMO_PASSWORD ? await platform().c360.getAccountByEmail(email) : null;
  if (!account || account.status !== 'ACTIVE') {
    // One message and one path for a wrong password and an unknown account.
    // Distinguishing them turns the form into an account-enumeration oracle.
    const failure = limiter.recordFailure(email);
    if (!failure.allowed) {
      await recordLockout(email, failure.retryAfterMs);
      return lockoutMessage(failure.retryAfterMs);
    }
    return INVALID_CREDENTIALS;
  }

  limiter.recordSuccess(email);
  const store = await cookies();
  store.set(
    CLIENT_COOKIE,
    createSessionToken({
      kind: 'CLIENT',
      subjectId: account.id,
      contextType: 'PERSON',
      contextId: account.partyId,
      expiresAt: sessionExpiry(),
    }),
    cookieOptions(),
  );
  return null;
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(CLIENT_COOKIE);
}

/** Resolves the session, or null. Never throws — callers decide what to do. */
export async function getSession(): Promise<ClientSession | null> {
  const token = (await cookies()).get(CLIENT_COOKIE)?.value;
  const payload = verifySessionToken(token, 'CLIENT');
  if (!payload) return null;

  const deps = platform();
  const account = await deps.c360.getAccountById(payload.subjectId);
  if (!account || account.status !== 'ACTIVE') return null;

  const availableContexts = await listAvailableContexts(deps.c360, account.id);
  const requestedId = payload.contextId ?? account.partyId;
  // A context in the cookie is only honoured if it is still granted.
  const active = availableContexts.find((c) => c.id === requestedId) ?? availableContexts[0];
  if (!active) return null;

  return {
    account,
    contextType: active.type,
    contextId: active.id,
    contextLabel: active.label,
    availableContexts,
  };
}

export async function requireSession(): Promise<ClientSession> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

/** Switches the active context, refusing anything the account was not granted. */
export async function switchContext(contextId: string): Promise<void> {
  const session = await requireSession();
  const target = session.availableContexts.find((c) => c.id === contextId);
  if (!target) return;
  const store = await cookies();
  store.set(
    CLIENT_COOKIE,
    createSessionToken({
      kind: 'CLIENT',
      subjectId: session.account.id,
      contextType: target.type,
      contextId: target.id,
      expiresAt: sessionExpiry(),
    }),
    cookieOptions(),
  );
}
