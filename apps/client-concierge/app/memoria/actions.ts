'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { MEMORY_PURPOSES, grant, withdraw } from '@rosillo/relationship';
import type { MemoryPurpose } from '@rosillo/relationship';
import { nowIso, platform } from '../../lib/platform';
import { requireSession } from '../../lib/session';

/**
 * Server actions for the memory manager.
 *
 * Two rules run through all of them, and both are the same rule the rest of the
 * platform follows: the account comes from the verified session and never from the
 * form, and every change to personal data is written to the audit trail.
 *
 * The second is not bookkeeping. A client who is told they can correct and erase what
 * is held about them is being made a promise, and a promise nobody can check is a
 * marketing line. The audit entry records *that* a memory was corrected or erased,
 * with its id — never the old or new value, because the trail must not become the
 * copy of the data the client thought they had deleted.
 */

/**
 * The audit envelope, filled once.
 *
 * These are client-initiated data-rights actions rather than steps in an answer, so
 * there is no model run and no before/after hash to chain — but the fields exist on
 * every event and omitting them is not optional, so they are stated as null here
 * rather than left to each call site to forget differently.
 */
function envelope(accountId: string, at: string) {
  return {
    occurredAt: at,
    actor: { type: 'CLIENT' as const, id: accountId },
    purposeCode: 'RELATIONSHIP_MANAGEMENT' as const,
    traceId: `mem_${at}`,
    modelRunId: null,
    beforeHash: null,
    afterHash: null,
  };
}

async function ownedMemory(accountId: string, memoryId: string) {
  const store = platform().store;
  const memories = await store.listMemories(accountId);
  return memories.find((memory) => memory.id === memoryId) ?? null;
}

export async function correctMemory(formData: FormData): Promise<void> {
  const session = await requireSession();
  const deps = platform();
  const memoryId = String(formData.get('memoryId') ?? '');
  const value = String(formData.get('value') ?? '').trim().slice(0, 400);
  if (!memoryId || value.length === 0) redirect('/memoria');

  // Scoped to the session's account, so a forged id reaches nothing.
  const held = await ownedMemory(session.account.id, memoryId);
  if (!held || held.forgottenAt) redirect('/memoria');

  const at = nowIso();
  await deps.store.saveMemory({
    ...held,
    value,
    // A correction is a fresh statement by the client, so it resets staleness and is
    // attributed to them rather than leaving the original adviser's name on it.
    confirmedAt: at,
    provenance: { source: 'CLIENT_STATED', originId: 'memory-manager', statedAt: at },
  });

  await deps.store.appendAudit({
    ...envelope(session.account.id, at),
    action: 'MEMORY_CORRECTED',
    resource: { type: 'client_memory', id: memoryId },
    // The value itself is deliberately absent: the trail must not retain what the
    // client just changed.
    metadata: { kind: held.kind },
  });

  revalidatePath('/memoria');
  redirect('/memoria?ok=corrected');
}

export async function confirmMemory(formData: FormData): Promise<void> {
  const session = await requireSession();
  const deps = platform();
  const memoryId = String(formData.get('memoryId') ?? '');
  const held = await ownedMemory(session.account.id, memoryId);
  if (!held || held.forgottenAt) redirect('/memoria');

  const at = nowIso();
  await deps.store.saveMemory({ ...held, confirmedAt: at });
  await deps.store.appendAudit({
    ...envelope(session.account.id, at),
    action: 'MEMORY_CONFIRMED',
    resource: { type: 'client_memory', id: memoryId },
    metadata: { kind: held.kind },
  });

  revalidatePath('/memoria');
  redirect('/memoria?ok=confirmed');
}

export async function forgetMemory(formData: FormData): Promise<void> {
  const session = await requireSession();
  const deps = platform();
  const memoryId = String(formData.get('memoryId') ?? '');
  const held = await ownedMemory(session.account.id, memoryId);
  if (!held) redirect('/memoria');

  const at = nowIso();
  await deps.store.forgetMemory(session.account.id, memoryId, at);
  await deps.store.appendAudit({
    ...envelope(session.account.id, at),
    action: 'MEMORY_FORGOTTEN',
    resource: { type: 'client_memory', id: memoryId },
    metadata: { kind: held.kind },
  });

  revalidatePath('/memoria');
  redirect('/memoria?ok=forgotten');
}

/**
 * Save the consent panel.
 *
 * Every purpose is read from the form on every save, so an unchecked box is a
 * withdrawal rather than an absence. A partial update here would mean a client could
 * never turn anything off.
 */
export async function saveConsent(formData: FormData): Promise<void> {
  const session = await requireSession();
  const deps = platform();
  const at = nowIso();

  let settings = await deps.store.getConsent(session.account.id);
  const before = new Set(settings.grantedPurposes);

  for (const purpose of MEMORY_PURPOSES) {
    const wanted = formData.get(`purpose:${purpose}`) === 'on';
    settings = wanted
      ? grant(settings, purpose as MemoryPurpose, at)
      : withdraw(settings, purpose as MemoryPurpose);
  }

  const from = Number(formData.get('quietFrom'));
  const to = Number(formData.get('quietTo'));
  const quiet =
    Number.isInteger(from) && Number.isInteger(to) && from >= 0 && from <= 23 && to >= 0 && to <= 23
      ? { fromHour: from, toHour: to }
      : undefined;
  settings = { ...settings, ...(quiet ? { quietHours: quiet } : {}), reviewedAt: at };

  await deps.store.saveConsent(settings);

  const after = new Set(settings.grantedPurposes);
  await deps.store.appendAudit({
    ...envelope(session.account.id, at),
    action: 'CONSENT_UPDATED',
    resource: { type: 'client_consent', id: session.account.id },
    // Which purposes, not which memories: the grant is the thing being evidenced.
    metadata: {
      granted: [...after].filter((purpose) => !before.has(purpose)),
      withdrawn: [...before].filter((purpose) => !after.has(purpose)),
    },
  });

  revalidatePath('/memoria');
  redirect('/memoria?ok=consent');
}

