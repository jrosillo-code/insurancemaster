'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { applyEmployeeDecision, claimTask } from '@rosillo/actions';
import { canAccessQueue, hasPermission } from '@rosillo/auth';
import { nowIso, store } from '../../../lib/platform';
import { requireEmployee } from '../../../lib/session';

/**
 * Task decision actions.
 *
 * Authorisation is re-checked here, not just on the page that rendered the form:
 * a form post is a request like any other, and a hidden field is not a permission.
 */

async function loadAuthorisedTask(taskId: string) {
  const employee = await requireEmployee();
  const stored = await store().getTask(taskId);
  if (!stored) redirect('/');
  if (!canAccessQueue(employee, stored.task.employeeQueue)) redirect('/?error=cola-ajena');
  return { employee, stored };
}

export async function claimTaskAction(formData: FormData): Promise<void> {
  const taskId = String(formData.get('taskId') ?? '');
  const { employee } = await loadAuthorisedTask(taskId);
  if (!hasPermission(employee.role, 'tasks.decide')) redirect('/?error=sin-permiso');
  await claimTask(store(), taskId);
  revalidatePath(`/tareas/${taskId}`);
  redirect(`/tareas/${taskId}`);
}

export async function decideAction(formData: FormData): Promise<void> {
  const taskId = String(formData.get('taskId') ?? '');
  const { employee, stored } = await loadAuthorisedTask(taskId);

  if (!hasPermission(employee.role, 'tasks.decide')) redirect('/?error=sin-permiso');

  const decision = String(formData.get('decision') ?? '') as
    | 'APPROVE'
    | 'APPROVE_WITH_EDITS'
    | 'REJECT'
    | 'ESCALATE';
  if (!['APPROVE', 'APPROVE_WITH_EDITS', 'REJECT', 'ESCALATE'].includes(decision)) {
    redirect(`/tareas/${taskId}?error=decision-no-valida`);
  }

  const overrideReason = String(formData.get('overrideReason') ?? '').trim();
  // Overriding outstanding required information is a supervisor act.
  const needsOverride =
    (decision === 'APPROVE' || decision === 'APPROVE_WITH_EDITS') &&
    stored.task.missingInformation.some((m) => m.severity === 'REQUIRED');
  if (needsOverride && !hasPermission(employee.role, 'tasks.override_missing_info')) {
    redirect(`/tareas/${taskId}?error=requiere-supervisor`);
  }

  // Edits arrive as edit:<field> so an employee can correct any prepared fact.
  const edits: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('edit:') && typeof value === 'string' && value.trim().length > 0) {
      edits[key.slice('edit:'.length)] = value.trim();
    }
  }

  try {
    await applyEmployeeDecision(store(), {
      taskId,
      employeeId: employee.id,
      decidedAt: nowIso(),
      decision,
      edits,
      note: String(formData.get('note') ?? '').trim(),
      overrideReason,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error';
    redirect(`/tareas/${taskId}?error=${encodeURIComponent(message.slice(0, 120))}`);
  }

  await store().appendAudit({
    occurredAt: nowIso(),
    actor: { type: 'EMPLOYEE', id: employee.id },
    action: 'TASK_DECIDED',
    resource: { type: 'task', id: taskId },
    purposeCode: 'EMPLOYEE_CASE_REVIEW',
    traceId: taskId,
    modelRunId: null,
    beforeHash: null,
    afterHash: null,
    metadata: {
      decision,
      role: employee.role,
      edits: Object.keys(edits),
      overrideProvided: overrideReason.length > 0,
    },
  });

  revalidatePath(`/tareas/${taskId}`);
  revalidatePath('/');
  redirect(`/tareas/${taskId}?ok=1`);
}
