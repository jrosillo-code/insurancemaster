import Link from 'next/link';
import type { Employee } from '@rosillo/auth';
import { hasPermission } from '@rosillo/auth';

export function TopBar({ employee, signOutAction }: { employee: Employee; signOutAction: () => Promise<void> }) {
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        ROSILLO <span>· Empleado</span>
      </Link>
      <nav>
        <Link href="/">Cola</Link>
        {hasPermission(employee.role, 'audit.read') ? <Link href="/auditoria">Auditoría</Link> : null}
      </nav>
      <div className="spacer" />
      <span className="who">
        {employee.name} · {employee.role}
      </span>
      <form action={signOutAction}>
        <button type="submit" className="btn secondary small">
          Salir
        </button>
      </form>
    </header>
  );
}

/**
 * The standing reminder of what this workspace cannot do.
 *
 * Prohibited actions are absent from the interface rather than disabled
 * (blueprint §13.3); this states the boundary so an employee is never left
 * wondering whether a missing button is a bug.
 */
export function ControlBoundary() {
  return (
    <p className="boundary">
      Este espacio prepara y registra decisiones. No envía correos, no comunica nada a las
      aseguradoras y no escribe en el sistema de gestión. La tramitación se hace por los canales
      habituales de Rosillo.
    </p>
  );
}
