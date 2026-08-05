import { redirect } from 'next/navigation';
import { verifyEventChain } from '@rosillo/store';
import { TopBar } from '../../components/Chrome';
import { localised } from '../../lib/locale';
import { store } from '../../lib/platform';
import { requirePermission, signOut } from '../../lib/session';

/**
 * Audit trail (blueprint §12.3, §6.7).
 *
 * Restricted to roles holding `audit.read` — supervisor, admin and the DPO. The
 * chain is verified on render, because an audit log nobody checks is a filing
 * cabinet rather than a control.
 */

export const dynamic = 'force-dynamic';

async function signOutAction(): Promise<void> {
  'use server';
  await signOut();
  redirect('/login');
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ trace?: string }>;
}) {
  const employee = await requirePermission('audit.read');
  const params = await searchParams;
  const { locale, t } = await localised();

  const events = await store().listAudit(params.trace ? { traceId: params.trace } : {});
  const recent = events.slice(-200).reverse();
  const chain = verifyEventChain(events);

  return (
    <>
      <TopBar
        employee={employee}
        signOutAction={signOutAction}
        locale={locale}
        returnTo="/auditoria"
      />
      <h1>{t['audit.title']}</h1>
      <p className="subtitle">
        {t['audit.subtitle']}
        {params.trace ? ` ${params.trace}` : ''}
      </p>

      {chain.valid ? (
        <div className="notice ok">
          {t['audit.verified']}: {events.length} {t['audit.events']}
        </div>
      ) : (
        <div className="notice error">
          <strong>{t['audit.broken']}</strong> ({chain.brokenAtIndex})
        </div>
      )}

      {recent.length === 0 ? (
        <p className="empty">{t['audit.empty']}</p>
      ) : (
        <div className="table-scroll">
          <table className="audit">
          <thead>
            <tr>
              <th>{t['audit.colTime']}</th>
              <th>{t['audit.colActor']}</th>
              <th>{t['audit.colAction']}</th>
              <th>{t['audit.colSubject']}</th>
              <th>{t['audit.colTrace']}</th>
              <th>{t['audit.colMetadata']}</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((event) => (
              <tr key={event.eventId}>
                <td>{event.occurredAt.replace('T', ' ').slice(0, 19)}</td>
                <td>
                  {event.actor.type}
                  <br />
                  <code>{event.actor.id}</code>
                </td>
                <td>
                  <strong>{event.action}</strong>
                </td>
                <td>
                  {event.resource.type}
                  <br />
                  <code>{event.resource.id}</code>
                </td>
                <td>{event.purposeCode}</td>
                <td>
                  <code>{JSON.stringify(event.metadata)}</code>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      )}

      <p className="boundary">{t['audit.noContent']}</p>
    </>
  );
}
