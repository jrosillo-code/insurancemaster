import Link from 'next/link';
import type { ConciergeResponse, HandoffTask } from '@rosillo/domain';
import { Answer, ClientTurn } from '../../components/Answer';
import { AiDisclosure, FooterLinks, TopBar } from '../../components/Chrome';
import { platform } from '../../lib/platform';
import { requireSession } from '../../lib/session';
import { sendMessage, signOutAction, switchContextAction } from './actions';

/**
 * The conversational home (blueprint §13.1).
 *
 * Deliberately close to empty: brand, context, disclosure, and a prompt. Policy
 * cards, clauses and task status appear *after* the question, never as a menu
 * before it.
 */

export const dynamic = 'force-dynamic';

const EXAMPLE_PROMPTS = [
  '¿Qué seguros tengo contratados?',
  '¿Cuál es la franquicia de mi coche?',
  '¿Estoy cubierto si me roban el móvil?',
  'Necesito un certificado del seguro de hogar',
];

const ERROR_MESSAGES: Record<string, string> = {
  RATE_LIMITED: 'Has enviado muchos mensajes seguidos. Espera un momento y vuelve a intentarlo.',
  'demasiado-largo': 'El mensaje es demasiado largo. ¿Puedes resumirlo?',
  MESSAGE_TOO_LONG: 'El mensaje es demasiado largo. ¿Puedes resumirlo?',
  CONTEXT_UNAVAILABLE: 'No puedo mostrar ese contexto con tu sesión actual.',
  PROVIDER_TIMEOUT: 'No he podido procesar tu consulta a tiempo. Un asesor la revisará.',
  PROVIDER_ERROR: 'No he podido procesar tu consulta. Un asesor la revisará.',
  SCHEMA_VALIDATION_FAILED: 'No he podido procesar tu consulta con seguridad. Un asesor la revisará.',
};

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; error?: string; prompt?: string }>;
}) {
  const session = await requireSession();
  const deps = platform();
  const params = await searchParams;

  const conversations = await deps.store.listConversations(session.account.id);
  // The home is a blank chat (blueprint §13.1), so an earlier thread opens only
  // when explicitly requested. Past consultas are reachable from /conversaciones.
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

  const error = params.error ? (ERROR_MESSAGES[params.error] ?? 'No he podido completar la acción.') : null;
  const prefill = params.prompt === 'humano' ? 'Quiero hablar con una persona' : '';

  return (
    <>
      <TopBar
        contexts={session.availableContexts}
        activeContextId={session.contextId}
        switchAction={switchContextAction}
      />
      <AiDisclosure />

      <main className="conversation">
        {error ? (
          <div className="error" role="alert">
            {error}
          </div>
        ) : null}

        {turns.length === 0 ? (
          <div className="empty-home">
            <h1>¿En qué te puedo ayudar?</h1>
            <p>
              Pregúntame por tus pólizas, tus coberturas, tus recibos o tus siniestros. Te respondo
              con la documentación que Rosillo tiene registrada a tu nombre.
            </p>
            <div className="examples">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <form action={sendMessage} key={prompt}>
                  <input type="hidden" name="message" value={prompt} />
                  <input type="hidden" name="conversationId" value={owned?.id ?? ''} />
                  <button type="submit" className="example-btn">
                    {prompt}
                  </button>
                </form>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn, index) =>
            turn.role === 'CLIENT' ? (
              <ClientTurn key={index} text={turn.text} />
            ) : turn.response ? (
              <Answer
                key={index}
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

      <div className="composer">
        <form action={sendMessage}>
          <input type="hidden" name="conversationId" value={owned?.id ?? ''} />
          <label htmlFor="message" className="visually-hidden" style={{ display: 'none' }}>
            Escribe tu consulta
          </label>
          <textarea
            id="message"
            name="message"
            rows={1}
            placeholder="Escribe tu consulta…"
            defaultValue={prefill}
            maxLength={4000}
            required
          />
          <button type="submit" className="btn">
            Enviar
          </button>
        </form>
        <p className="composer-hint">
          Este asistente no contrata, no da de baja ni resuelve siniestros. Prepara la información y
          la revisa una persona de Rosillo.
        </p>
      </div>

      <FooterLinks />
      <div style={{ padding: '0 16px 20px', fontSize: 13 }}>
        <form action={signOutAction}>
          <button type="submit" className="btn secondary small">
            Cerrar sesión ({session.account.displayName})
          </button>
        </form>
        {conversations.length > 1 ? (
          <p style={{ marginTop: 12 }}>
            <Link href="/conversaciones">Ver mis consultas anteriores</Link>
          </p>
        ) : null}
      </div>
    </>
  );
}
