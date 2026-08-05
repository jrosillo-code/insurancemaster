import Link from 'next/link';
import { formatSpanishDate } from '@rosillo/domain';
import { FooterLinks, TopBar } from '../../components/Chrome';
import { platform } from '../../lib/platform';
import { requireSession } from '../../lib/session';

/** Conversation history for the authenticated account only. */
export const dynamic = 'force-dynamic';

export default async function ConversationsPage() {
  const session = await requireSession();
  const conversations = await platform().store.listConversations(session.account.id);

  return (
    <>
      <TopBar contexts={session.availableContexts} activeContextId={session.contextId} />
      <main className="content">
        <h1>Mis consultas</h1>
        {conversations.length === 0 ? (
          <p>Todavía no has abierto ninguna consulta.</p>
        ) : (
          conversations.map((conversation) => (
            <Link key={conversation.id} href={`/chat?c=${conversation.id}`} className="conversation-item">
              <strong>{conversation.title}</strong>
              <time dateTime={conversation.updatedAt}>
                Última actividad: {formatSpanishDate(conversation.updatedAt.slice(0, 10))}
              </time>
            </Link>
          ))
        )}
        <p style={{ marginTop: 24 }}>
          <Link href="/chat">← Volver al asistente</Link>
        </p>
      </main>
      <FooterLinks />
    </>
  );
}
