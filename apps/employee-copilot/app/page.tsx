import Link from 'next/link';
import { redirect } from 'next/navigation';
import { INTENT_LABELS, RISK_FLAG_LABELS, formatSpanishDate, truncate } from '@rosillo/domain';
import { canAccessQueue, hasPermission } from '@rosillo/auth';
import { ControlBoundary, TopBar } from '../components/Chrome';
import { store } from '../lib/platform';
import { requireEmployee, signOut } from '../lib/session';

/**
 * The queue.
 *
 * An operator sees only the queues they work; a supervisor, admin or DPO sees
 * everything. That filtering happens here, server-side, against the employee record
 * — the list is built from what the session may see, not filtered after the fact.
 */

export const dynamic = 'force-dynamic';

async function signOutAction(): Promise<void> {
  'use server';
  await signOut();
  redirect('/login');
}

const ERRORS: Record<string, string> = {
  'sin-permiso': 'No tienes permiso para acceder a esa sección.',
  'cola-ajena': 'Esa tarea pertenece a una cola que no gestionas.',
};

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const employee = await requireEmployee();
  const params = await searchParams;

  const all = await store().listTasks();
  const visible = all.filter((task) => canAccessQueue(employee, task.employeeQueue));
  const open = visible.filter((t) => t.state === 'OPEN' || t.state === 'IN_REVIEW' || t.state === 'ESCALATED');
  const decided = visible.filter((t) => !open.includes(t));

  return (
    <>
      <TopBar employee={employee} signOutAction={signOutAction} />
      <h1>Cola de tareas</h1>
      <p className="subtitle">
        Consultas que el asistente ha preparado para revisión humana.{' '}
        {hasPermission(employee.role, 'tasks.read_all')
          ? 'Ves todas las colas.'
          : `Ves tus colas: ${employee.queues.join(', ') || 'ninguna'}.`}
      </p>

      {params.error ? <div className="notice error">{ERRORS[params.error] ?? 'Acción no permitida.'}</div> : null}

      <h2>Pendientes ({open.length})</h2>
      {open.length === 0 ? (
        <p className="empty">
          No hay tareas pendientes. Abre el asistente de cliente y envía una consulta para generar
          una.
        </p>
      ) : (
        open.map((task) => (
          <Link key={task.taskId} href={`/tareas/${task.taskId}`} className="task-row">
            <div className="task-row-head">
              <span className={`badge state-${task.state}`}>{task.state}</span>
              <span className="badge queue">{task.employeeQueue}</span>
              <strong>{INTENT_LABELS[task.intent]}</strong>
              {task.riskFlags.map((flag) => (
                <span className="badge risk" key={flag}>
                  {RISK_FLAG_LABELS[flag]}
                </span>
              ))}
            </div>
            <div className="task-request">“{truncate(task.clientRequest, 150)}”</div>
            <div className="task-meta">
              {formatSpanishDate(task.createdAt.slice(0, 10))} ·{' '}
              {task.missingInformation.filter((m) => m.severity === 'REQUIRED').length} dato(s)
              obligatorio(s) pendiente(s) · {task.relevantPolicyIds.length} póliza(s) relacionada(s)
            </div>
          </Link>
        ))
      )}

      {decided.length > 0 ? (
        <>
          <h2>Decididas ({decided.length})</h2>
          {decided.map((task) => (
            <Link key={task.taskId} href={`/tareas/${task.taskId}`} className="task-row">
              <div className="task-row-head">
                <span className={`badge state-${task.state}`}>{task.state}</span>
                <strong>{INTENT_LABELS[task.intent]}</strong>
              </div>
              <div className="task-request">“{truncate(task.clientRequest, 120)}”</div>
            </Link>
          ))}
        </>
      ) : null}

      <ControlBoundary />
    </>
  );
}
