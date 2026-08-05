import { redirect } from 'next/navigation';
import { verifyEventChain } from '@rosillo/store';
import { TopBar } from '../../components/Chrome';
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

  const events = await store().listAudit(params.trace ? { traceId: params.trace } : {});
  const recent = events.slice(-200).reverse();
  const chain = verifyEventChain(events);

  return (
    <>
      <TopBar employee={employee} signOutAction={signOutAction} />
      <h1>Auditoría</h1>
      <p className="subtitle">
        Registro inmutable de accesos, decisiones del sistema y decisiones humanas.
        {params.trace ? ` Filtrado por traza ${params.trace}.` : ''}
      </p>

      {chain.valid ? (
        <div className="notice ok">
          Cadena de integridad verificada: {events.length} evento(s), sin alteraciones.
        </div>
      ) : (
        <div className="notice error">
          <strong>Cadena de integridad rota</strong> en la posición {chain.brokenAtIndex}. Un evento
          ha sido modificado o eliminado.
        </div>
      )}

      {recent.length === 0 ? (
        <p className="empty">Todavía no hay eventos registrados.</p>
      ) : (
        <div className="table-scroll">
          <table className="audit">
          <thead>
            <tr>
              <th>Momento</th>
              <th>Actor</th>
              <th>Acción</th>
              <th>Recurso</th>
              <th>Propósito</th>
              <th>Metadatos</th>
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

      <p className="boundary">
        Los eventos no contienen el texto de los mensajes ni el contenido de las pólizas: solo
        identificadores, verdictos y metadatos no sensibles.
      </p>
    </>
  );
}
