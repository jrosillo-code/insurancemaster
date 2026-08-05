import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  DEMO_PASSWORD,
  EMPLOYEE_COOKIE,
  canAccessQueue,
  cookieOptions,
  createSessionToken,
  findEmployeeByEmail,
  findEmployeeById,
  hasPermission,
  sessionExpiry,
  verifySessionToken,
  type Employee,
  type Permission,
} from '@rosillo/auth';

/**
 * Employee session and RBAC.
 *
 * A separate cookie name and a separate token `kind` from the client surface, so a
 * client token can never be replayed here and vice versa. Permissions are re-read
 * from the employee record on every request rather than carried in the cookie.
 */

export async function signIn(email: string, password: string): Promise<string | null> {
  if (password !== DEMO_PASSWORD) return 'Credenciales no válidas.';
  const employee = findEmployeeByEmail(email);
  if (!employee || employee.status !== 'ACTIVE') return 'Credenciales no válidas.';

  const store = await cookies();
  store.set(
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
