'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { MAX_MESSAGE_CHARS } from '@rosillo/domain';
import { ensureConversation, handleClientMessage } from '@rosillo/orchestration';
import { DEMO_TODAY, nowIso, platform } from '../../lib/platform';
import { requireSession, signOut, switchContext } from '../../lib/session';

/**
 * Server actions for the Concierge.
 *
 * Every action re-resolves the session server-side. Nothing is trusted from the
 * form: not the account, not the active context, not the conversation id — a
 * conversation that does not belong to the caller is replaced with a new one
 * rather than opened (see `ensureConversation`).
 */

export async function sendMessage(formData: FormData): Promise<void> {
  const session = await requireSession();
  const deps = platform();

  const raw = formData.get('message');
  const message = typeof raw === 'string' ? raw.trim() : '';
  if (message.length === 0) return;
  if (message.length > MAX_MESSAGE_CHARS) {
    redirect(`/chat?error=demasiado-largo`);
  }

  const requestedConversation = formData.get('conversationId');
  const conversationId = await ensureConversation(deps, {
    accountId: session.account.id,
    ...(typeof requestedConversation === 'string' && requestedConversation.length > 0
      ? { conversationId: requestedConversation }
      : {}),
    contextType: session.contextType,
    contextId: session.contextId,
    now: nowIso(),
  });

  const result = await handleClientMessage(
    {
      accountId: session.account.id,
      conversationId,
      message,
      // The context comes from the verified session, never from the form.
      requestedContext: { type: session.contextType, id: session.contextId },
      now: nowIso(),
      asOf: DEMO_TODAY,
      language: session.account.preferredLanguage,
    },
    deps,
  );

  if (!result.ok) {
    // The client sees a plain message; the detail stays in the audit trail.
    redirect(`/chat?c=${conversationId}&error=${encodeURIComponent(result.errorCode)}`);
  }

  revalidatePath('/chat');
  redirect(`/chat?c=${conversationId}`);
}

export async function switchContextAction(formData: FormData): Promise<void> {
  const contextId = formData.get('contextId');
  if (typeof contextId === 'string') await switchContext(contextId);
  revalidatePath('/chat');
  redirect('/chat');
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect('/login');
}
