import Link from 'next/link';
import type { ConciergeResponse, HandoffTask } from '@rosillo/domain';
import type { ClientKey } from '@rosillo/i18n';
import { Answer, ClientTurn } from '../../components/Answer';
import { AiDisclosure, FooterBar, TopBar } from '../../components/Chrome';
import { Composer } from '../../components/Composer';
import { localised } from '../../lib/locale';
import { platform } from '../../lib/platform';
import { requireSession } from '../../lib/session';
import { sendMessage, signOutAction, switchContextAction } from './actions';

/**
 * The conversational home (blueprint §13.1).
 *
 * Close to empty on purpose, and more so than before: the whole screen is a question,
 * three suggestions and a box to type in. Policy cards, clauses and task status appear
 * *after* the question, never as a menu before it.
 *
 * Two things stay on an otherwise bare screen because they are obligations, not
 * decoration: the synthetic-data banner (in the layout, so no route can render without
 * it) and the AI disclosure with its route to a person — EU AI Act Article 50
 * transparency for direct interaction with an AI system, which applies from 2 August
 * 2026 (blueprint §12.1). Both are now single quiet lines rather than panels. The
 * requirement is that a person can see them, not that they shout.
 */

export const dynamic = 'force-dynamic';

const EXAMPLE_KEYS: ClientKey[] = ['home.example1', 'home.example2', 'home.example3'];

const ERROR_KEYS: Record<string, ClientKey> = {
  RATE_LIMITED: 'error.RATE_LIMITED',
  'demasiado-largo': 'error.MESSAGE_TOO_LONG',
  MESSAGE_TOO_LONG: 'error.MESSAGE_TOO_LONG',
  CONTEXT_UNAVAILABLE: 'error.CONTEXT_UNAVAILABLE',
  PROVIDER_TIMEOUT: 'error.PROVIDER_TIMEOUT',
  PROVIDER_ERROR: 'error.PROVIDER_ERROR',
  SCHEMA_VALIDATION_FAILED: 'error.SCHEMA_VALIDATION_FAILED',
};

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; error?: string; prompt?: string }>;
}) {
  const session = await requireSession();
  const deps = platform();
  const params = await searchParams;
  const { locale, t } = await localised();

  const conversations = await deps.store.listConversations(session.account.id);
  // The home is a blank chat (blueprint §13.1), so an earlier thread opens only
  // when explicitly requested. Past requests are reachable from /conversaciones.
  const conversationId = params.c ?? '';

  // Only open a conversation that belongs to this account.
  const conversation = conversationId ? await deps.store.getConversation(conversationId) : null;
  const owned = conversation?.accountId === session.account.id ? conversation : null;

  const messages = owned ? await deps.store.listMessages(owned.id) : [];
  const tasks = owned ? await deps.store.listTasksForConversation(owned.id) : [];
  const tasksByConversationOrder = new Map<string, HandoffTask>();
  for (const task of tasks) tasksByConversationOrder.set(task.createdAt + task.actionCode, task);

  // Rehydrate each assistant turn from its stored response so evidence cards,
  // uncertainty and freshness survive a page reload.
  const turns: { role: 'CLIENT' | 'ASSISTANT'; text: string; response?: ConciergeResponse | null }[] = [];
  for (const message of messages) {
    if (message.role === 'CLIENT') {
      turns.push({ role: 'CLIENT', text: message.text });
    } else {
      const response = message.responseId ? await deps.store.getResponse(message.responseId) : null;
      turns.push({ role: 'ASSISTANT', text: message.text, response });
    }
  }

  const errorKey = params.error ? ERROR_KEYS[params.error] : undefined;
  const error = params.error ? (errorKey ? t[errorKey] : t['error.generic']) : null;
  const prefill = params.prompt === 'humano' ? t['composer.humanPrefill'] : '';
  const empty = turns.length === 0;

  return (
    <>
      <TopBar
        locale={locale}
        contexts={session.availableContexts}
        activeContextId={session.contextId}
        switchAction={switchContextAction}
      />

      <main className={`conversation${empty ? ' is-empty' : ''}`} id="conversacion">
        {error ? (
          <div className="error" role="alert">
            {error}
          </div>
        ) : null}

        {empty ? null : (
          turns.map((turn, index) =>
            turn.role === 'CLIENT' ? (
              <ClientTurn key={index} text={turn.text} />
            ) : turn.response ? (
              <Answer
                key={index}
                locale={locale}
                response={turn.response}
                task={tasks.find((t) => t.conversationId === owned?.id) ?? null}
              />
            ) : (
              <div className="turn" key={index}>
                <div className="bubble assistant">{turn.text}</div>
              </div>
            ),
          )
        )}
      </main>

      {/*
        Suggestions live beside the composer, closed by default.
        A heading and a list of questions in the middle of an otherwise empty screen
        reads as an interruption — it fills the space a person came to type in. As a
        disclosure it is available to anyone who wants a starting point and invisible
        to everyone who does not.
      */}
      {empty ? (
        <details className="suggestions">
          <summary>{t['home.examplesLabel']}</summary>
          <div className="examples">
            {EXAMPLE_KEYS.map((key) => (
              <form action={sendMessage} key={key}>
                <input type="hidden" name="message" value={t[key]} />
                <input type="hidden" name="conversationId" value={owned?.id ?? ''} />
                <button type="submit" className="example-btn">
                  {t[key]}
                </button>
              </form>
            ))}
          </div>
        </details>
      ) : null}

      <Composer
        action={sendMessage}
        conversationId={owned?.id ?? ''}
        prefill={prefill}
        strings={{
          placeholder: t['composer.placeholder'],
          label: t['composer.label'],
          send: t['composer.send'],
          sending: t['composer.sending'],
          thinking: t['composer.thinking'],
        }}
      />

      <AiDisclosure locale={locale} />

      <FooterBar
        locale={locale}
        displayName={session.account.displayName}
        showPrevious={conversations.length > 1}
        signOutAction={signOutAction}
      />
    </>
  );
}
