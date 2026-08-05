/**
 * Employee identity and RBAC for the internal workspace (blueprint §12.3).
 *
 * Employee access is role-, relationship- and purpose-based. Roles here decide what
 * an employee may do with a handoff task; they never widen what the *client* session
 * could see, because a task only ever carries evidence the client was entitled to.
 */

export const EMPLOYEE_ROLES = ['operator', 'claims_specialist', 'supervisor', 'admin', 'dpo'] as const;
export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];

export const PERMISSIONS = [
  'tasks.read_queue',
  'tasks.read_all',
  'tasks.decide',
  'tasks.escalate',
  'tasks.override_missing_info',
  'audit.read',
  'evaluation.read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<EmployeeRole, readonly Permission[]> = {
  operator: ['tasks.read_queue', 'tasks.decide', 'tasks.escalate'],
  claims_specialist: ['tasks.read_queue', 'tasks.decide', 'tasks.escalate'],
  supervisor: [
    'tasks.read_queue',
    'tasks.read_all',
    'tasks.decide',
    'tasks.escalate',
    'tasks.override_missing_info',
    'audit.read',
    'evaluation.read',
  ],
  admin: ['tasks.read_all', 'audit.read', 'evaluation.read'],
  // The DPO reads controls and audit trails; they never decide operational tasks.
  dpo: ['tasks.read_all', 'audit.read', 'evaluation.read'],
};

export function hasPermission(role: EmployeeRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: EmployeeRole;
  /** Queues this employee works. Operators see only their own queues. */
  queues: string[];
  status: 'ACTIVE' | 'DISABLED';
}

/** Synthetic employees. Prototype-only authentication — see ADR-0004. */
export const EMPLOYEES: Employee[] = [
  {
    id: 'emp_ana_op',
    name: 'Ana Belén Ruiz',
    email: 'ana@rosillo.test',
    role: 'operator',
    queues: ['atencion-cliente'],
    status: 'ACTIVE',
  },
  {
    id: 'emp_carlos_sup',
    name: 'Carlos Méndez',
    email: 'carlos@rosillo.test',
    role: 'supervisor',
    queues: ['atencion-cliente', 'siniestros', 'suplementos', 'comercial'],
    status: 'ACTIVE',
  },
  {
    id: 'emp_lucia_claims',
    name: 'Lucía Ferrer',
    email: 'lucia@rosillo.test',
    role: 'claims_specialist',
    queues: ['siniestros'],
    status: 'ACTIVE',
  },
  {
    id: 'emp_marta_admin',
    name: 'Marta Salas',
    email: 'admin@rosillo.test',
    role: 'admin',
    queues: [],
    status: 'ACTIVE',
  },
  {
    id: 'emp_dpo',
    name: 'Delegado de Protección de Datos',
    email: 'dpo@rosillo.test',
    role: 'dpo',
    queues: [],
    status: 'ACTIVE',
  },
];

export function findEmployeeByEmail(email: string): Employee | null {
  const normalised = email.trim().toLowerCase();
  return EMPLOYEES.find((e) => e.email.toLowerCase() === normalised) ?? null;
}

export function findEmployeeById(id: string): Employee | null {
  return EMPLOYEES.find((e) => e.id === id) ?? null;
}

/** Whether an employee may open a task sitting in a given queue. */
export function canAccessQueue(employee: Employee, queue: string): boolean {
  if (hasPermission(employee.role, 'tasks.read_all')) return true;
  return employee.queues.includes(queue);
}
