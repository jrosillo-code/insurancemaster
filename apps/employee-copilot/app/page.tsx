import Link from 'next/link';
import { redirect } from 'next/navigation';
import { truncate } from '@rosillo/domain';
import {
  INTENT_DISPLAY,
  RISK_FLAG_DISPLAY,
  TASK_STATE_DISPLAY,
  formatDate,
} from '@rosillo/i18n';
import { canAccessQueue, hasPermission } from '@rosillo/auth';
import { ControlBoundary, TopBar } from '../components/Chrome';
import { localised } from '../lib/locale';
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

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const employee = await requireEmployee();
  const params = await searchParams;
  const { locale, t } = await localised();

  const all = await store().listTasks();
  const visible = all.filter((task) => canAccessQueue(employee, task.employeeQueue));
  const open = visible.filter((t) => t.state === 'OPEN' || t.state === 'IN_REVIEW' || t.state === 'ESCALATED');
  const decided = visible.filter((t) => !open.includes(t));

  const errors: Record<string, string> = {
    'sin-permiso': t['error.noPermission'],
    'cola-ajena': t['error.otherQueue'],
  };

  return (
    <>
      <TopBar employee={employee} signOutAction={signOutAction} locale={locale} />
      <h1>{t['queue.title']}</h1>
      <p className="subtitle">
        {t['queue.subtitle']}{' '}
        {hasPermission(employee.role, 'tasks.read_all')
          ? t['queue.seesAll']
          : `${t['queue.seesOwn']} ${employee.queues.join(', ') || t['queue.none']}.`}
      </p>

      {params.error ? (
        <div className="notice error">{errors[params.error] ?? t['error.notAllowed']}</div>
      ) : null}

      <h2>
        {t['queue.pending']} ({open.length})
      </h2>
      {open.length === 0 ? (
        <p className="empty">{t['queue.empty']}</p>
      ) : (
        open.map((task) => (
          <Link key={task.taskId} href={`/tareas/${task.taskId}`} className="task-row">
            <div className="task-row-head">
              <span className={`badge state-${task.state}`}>{TASK_STATE_DISPLAY[locale][task.state]}</span>
              <span className="badge queue">{task.employeeQueue}</span>
              <strong>{INTENT_DISPLAY[locale][task.intent]}</strong>
              {task.riskFlags.map((flag) => (
                <span className="badge risk" key={flag}>
                  {RISK_FLAG_DISPLAY[locale][flag]}
                </span>
              ))}
            </div>
            <div className="task-request">“{truncate(task.clientRequest, 150)}”</div>
            <div className="task-meta">
              {formatDate(task.createdAt.slice(0, 10), locale)} ·{' '}
              {task.missingInformation.filter((m) => m.severity === 'REQUIRED').length}{' '}
              {t['queue.requiredOutstanding']} · {task.relevantPolicyIds.length}{' '}
              {t['queue.relatedPolicies']}
            </div>
          </Link>
        ))
      )}

      {decided.length > 0 ? (
        <>
          <h2>
            {t['queue.decided']} ({decided.length})
          </h2>
          {decided.map((task) => (
            <Link key={task.taskId} href={`/tareas/${task.taskId}`} className="task-row">
              <div className="task-row-head">
                <span className={`badge state-${task.state}`}>
                  {TASK_STATE_DISPLAY[locale][task.state]}
                </span>
                <strong>{INTENT_DISPLAY[locale][task.intent]}</strong>
              </div>
              <div className="task-request">“{truncate(task.clientRequest, 120)}”</div>
            </Link>
          ))}
        </>
      ) : null}

      <ControlBoundary locale={locale} />
    </>
  );
}
