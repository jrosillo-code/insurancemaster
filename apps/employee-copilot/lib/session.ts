import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  DEMO_PASSWORD,
  EMPLOYEE_COOKIE,
  LoginThrottle,
  canAccessQueue,
  cookieOptions,
  createSessionToken,
  findEmployeeByEmail,
  findEmployeeById,
  hasPermission,
  lockoutMessage,
  sessionExpiry,
  verifySessionToken,
  type Employee,
  type Permission,
} from '@rosillo/auth';
import { nowIso, store } from './platform';

/**
 * Employee session and RBAC.
 *
 * A separate cookie name and a separate token `kind` from the client surface, so a
 * client token can never be replayed here and vice versa. Permissions are re-read
 * from the employee record on every request rather than carried in the cookie.
 */

/**
 * Failed-attempt budget. An internal surface is the more valuable target of the two:
 * an employee session sees every client in the queues that role holds.
 */
declare global {
  // eslint-disable-next-line no-var
  var __rosilloEmployeeThrottle: LoginThrottle | undefined;
}

function throttle(): LoginThrottle {
  globalThis.__rosilloEmployeeThrottle ??= new LoginThrottle();
  return globalThis.__rosilloEmployeeThrottle;
}

const INVALID_CREDENTIALS = 'Credenciales no válidas.';

async function recordLockout(retryAfterMs: number): Promise<void> {
  await store().appendAudit({
    occurredAt: nowIso(),
    actor: { type: 'EMPLOYEE', id: 'anonymous' },
    action: 'RATE_LIMIT_APPLIED',
    resource: { type: 'login', id: 'employee' },
    purposeCode: 'SECURITY_CONTROL',
    traceId: `login_${Date.now().toString(36)}`,
    modelRunId: null,
    beforeHash: null,
    afterHash: null,
    metadata: { surface: 'employee', retryAfterMs },
  });
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const limiter = throttle();
  const decision = limiter.check(email);
  if (!decision.allowed) {
    await recordLockout(decision.retryAfterMs);
    return lockoutMessage(decision.retryAfterMs);
  }

  const employee = password === DEMO_PASSWORD ? findEmployeeByEmail(email) : null;
  if (!employee || employee.status !== 'ACTIVE') {
    const failure = limiter.recordFailure(email);
    if (!failure.allowed) {
      await recordLockout(failure.retryAfterMs);
      return lockoutMessage(failure.retryAfterMs);
    }
    return INVALID_CREDENTIALS;
  }

  limiter.recordSuccess(email);
  const cookieStore = await cookies();
  cookieStore.set(
    EMPLOYEE_COOKIE,
    createSessionToken({ kind: 'EMPLOYEE', subjectId: employee.id, expiresAt: sessionExpiry() }),
    cookieOptions(),
  );
  return null;
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(EMPLOYEE_COOKIE);
}

export async function getEmployee(): Promise<Employee | null> {
  const token = (await cookies()).get(EMPLOYEE_COOKIE)?.value;
  const payload = verifySessionToken(token, 'EMPLOYEE');
  if (!payload) return null;
  const employee = findEmployeeById(payload.subjectId);
  return employee && employee.status === 'ACTIVE' ? employee : null;
}

export async function requireEmployee(): Promise<Employee> {
  const employee = await getEmployee();
  if (!employee) redirect('/login');
  return employee;
}

/** Requires a permission, sending anyone without it back to the queue. */
export async function requirePermission(permission: Permission): Promise<Employee> {
  const employee = await requireEmployee();
  if (!hasPermission(employee.role, permission)) redirect('/?error=sin-permiso');
  return employee;
}

export { canAccessQueue, hasPermission };
