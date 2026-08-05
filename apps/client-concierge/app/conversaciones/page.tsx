import Link from 'next/link';
import { clientDictionary, formatDate } from '@rosillo/i18n';
import { TopBar } from '../../components/Chrome';
import { locale } from '../../lib/locale';
import { platform } from '../../lib/platform';
import { requireSession } from '../../lib/session';

/** Conversation history for the authenticated account only. */
export const dynamic = 'force-dynamic';

export default async function ConversationsPage() {
  const session = await requireSession();
  const conversations = await platform().store.listConversations(session.account.id);
  const active = await locale();
  const t = clientDictionary(active);

  return (
    <>
      <TopBar locale={active} contexts={session.availableContexts} activeContextId={session.contextId} />
      <main className="content">
        <h1>{t['conversations.title']}</h1>
        {conversations.length === 0 ? (
          <p>{t['conversations.empty']}</p>
        ) : (
          conversations.map((conversation) => (
            <Link key={conversation.id} href={`/chat?c=${conversation.id}`} className="conversation-item">
              <strong>{conversation.title}</strong>
              <time dateTime={conversation.updatedAt}>
                {formatDate(conversation.updatedAt.slice(0, 10), active)}
              </time>
            </Link>
          ))
        )}
        <p style={{ marginTop: 24 }}>
          <Link href="/chat">{t['conversations.back']}</Link>
        </p>
      </main>
    </>
  );
}
