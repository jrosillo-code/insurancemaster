import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  CLIENT_VISIBLE_STATUS,
  INTENT_LABELS,
  RISK_FLAG_LABELS,
  formatSpanishDate,
  isTerminalState,
} from '@rosillo/domain';
import { canAccessQueue, hasPermission } from '@rosillo/auth';
import { ControlBoundary, TopBar } from '../../../components/Chrome';
import { c360, store } from '../../../lib/platform';
import { requireEmployee, signOut } from '../../../lib/session';
import { claimTaskAction, decideAction } from './actions';

/**
 * The handoff review screen (blueprint §21 Milestone E).
 *
 * Everything the specification requires is on one page: the client's exact request,
 * the identity and authority under which it was made, the relevant policies, the
 * verified facts with their evidence, the client's own statements held separately,
 * what is missing, the proposed outcome, the risk flags, a link to the source
 * conversation, and an approve/edit/reject/escalate flow whose result becomes a
 * client-visible status.
 */

export const dynamic = 'force-dynamic';

async function signOutAction(): Promise<void> {
  'use server';
  await signOut();
  redirect('/login');
}

export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const employee = await requireEmployee();
  const { id } = await params;
  const query = await searchParams;

  const stored = await store().getTask(id);
  if (!stored) notFound();
  if (!canAccessQueue(employee, stored.task.employeeQueue)) redirect('/?error=cola-ajena');

  const task = stored.task;
  const canDecide = hasPermission(employee.role, 'tasks.decide');
  const canOverride = hasPermission(employee.role, 'tasks.override_missing_info');
  const requiredOutstanding = task.missingInformation.filter((m) => m.severity === 'REQUIRED');
  const settled = isTerminalState(task.state) || task.state === 'APPROVED' || task.state === 'EDITED_AND_APPROVED' || task.state === 'REJECTED';

  const messages = await store().listMessages(task.conversationId);
  const party = await c360().getPartyById(task.clientId);
  const organisation = task.organisationId ? await c360().getPartyById(task.organisationId) : null;

  return (
    <>
      <TopBar employee={employee} signOutAction={signOutAction} />

      <p style={{ fontSize: 13, marginBottom: 12 }}>
        <Link href="/">← Volver a la cola</Link>
      </p>

      <div className="task-row-head" style={{ marginBottom: 8 }}>
        <span className={`badge state-${task.state}`}>{task.state}</span>
        <span className="badge queue">{task.employeeQueue}</span>
        <h1 style={{ margin: 0 }}>{INTENT_LABELS[task.intent]}</h1>
      </div>
      <p className="subtitle">
        Creada el {formatSpanishDate(task.createdAt.slice(0, 10))} · Acción propuesta:{' '}
        <strong>{task.actionCode}</strong>
      </p>

      {query.ok ? <div className="notice ok">Decisión registrada.</div> : null}
      {query.error ? <div className="notice error">{decodeURIComponent(query.error)}</div> : null}
      {task.riskFlags.length > 0 ? (
        <div className="notice warn">
          <strong>Señales de riesgo:</strong>{' '}
          {task.riskFlags.map((flag) => RISK_FLAG_LABELS[flag]).join(' · ')}
        </div>
      ) : null}

      <div className="columns">
        <div>
          <div className="card">
            <h3>Petición exacta del cliente</h3>
            <div className="verbatim">{task.clientRequest}</div>
            <p className="task-meta" style={{ marginTop: 10 }}>
              <Link href={`/tareas/${task.taskId}#conversacion`}>Ver la conversación completa</Link>
            </p>
          </div>

          <div className="card">
            <h3>Identidad y autorización</h3>
            <div className="fact">
              <span className="k">Cliente</span>: {party?.name ?? task.clientId}
              <div className="prov">{task.clientId}</div>
            </div>
            {organisation ? (
              <div className="fact">
                <span className="k">Actúa por</span>: {organisation.name}
                <div className="prov">{organisation.id}</div>
              </div>
            ) : null}
            <div className="fact">
              <span className="k">Base de la autorización</span>
              <div className="prov">{task.authorityBasis}</div>
            </div>
            <div className="fact">
              <span className="k">Canal preferido</span>: {task.preferredChannel}
            </div>
          </div>

          <div className="card">
            <h3>Lo que dice el cliente (sin verificar)</h3>
            {task.clientStatements.length === 0 ? (
              <p className="empty">Sin declaraciones registradas.</p>
            ) : (
              task.clientStatements.map((statement, index) => (
                <div className="statement" key={index}>
                  <span className="tag">Declarado por el cliente · no verificado</span>
                  {statement.text}
                </div>
              ))
            )}
          </div>

          <div className="card" id="conversacion">
            <h3>Conversación</h3>
            {messages.length === 0 ? (
              <p className="empty">Sin mensajes.</p>
            ) : (
              messages.map((message) => (
                <div key={message.id} style={{ marginBottom: 10, fontSize: 14 }}>
                  <strong>{message.role === 'CLIENT' ? 'Cliente' : 'Asistente'}:</strong>{' '}
                  {message.text}
                  {message.answerType ? (
                    <div className="prov" style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                      Tipo de respuesta: {message.answerType}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="card">
            <h3>Datos verificados</h3>
            {Object.keys(task.verifiedFacts).length === 0 ? (
              <p className="empty">Ningún dato verificado todavía.</p>
            ) : (
              Object.entries(task.verifiedFacts).map(([key, fact]) => (
                <div className={`fact verified${fact.conflict ? ' conflict' : ''}`} key={key}>
                  <span className="k">{key}</span>: {fact.value ?? '—'}
                  <div className="prov">
                    Fuente: {fact.sourceType} · {fact.sourceId}
                    {fact.sourcePath ? ` · ${fact.sourcePath}` : ''} · consultado{' '}
                    {formatSpanishDate(fact.observedAt.slice(0, 10))} · confianza{' '}
                    {Math.round(fact.confidence * 100)}%
                  </div>
                  {fact.conflict ? (
                    <div className="prov">
                      <strong>Conflicto sin resolver:</strong> {fact.conflict.detail} (otra fuente:{' '}
                      {fact.conflict.otherSourceId} = {fact.conflict.otherValue})
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <div className="card">
            <h3>Información pendiente</h3>
            {task.missingInformation.length === 0 ? (
              <p className="empty">Nada pendiente según las reglas aprobadas.</p>
            ) : (
              task.missingInformation.map((missing) => (
                <div className="missing-item" key={missing.key}>
                  <span className={`sev ${missing.severity}`}>{missing.severity}</span>
                  <span>{missing.label}</span>
                  <span className="rule">{missing.ruleId}</span>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <h3>Evidencia utilizada</h3>
            {task.evidence.length === 0 ? (
              <p className="empty">Sin evidencia citada.</p>
            ) : (
              task.evidence.map((reference) => (
                <details className="evidence-item" key={reference.id}>
                  <summary>
                    [{reference.tier}] {reference.label}
                  </summary>
                  <div className="body">
                    {reference.quote ? <blockquote>{reference.quote}</blockquote> : null}
                    <div>
                      {reference.sourceType} · {reference.sourceId}
                      {reference.passageId ? ` · ${reference.passageId}` : ''}
                      {reference.fieldPath ? ` · ${reference.fieldPath}` : ''}
                    </div>
                  </div>
                </details>
              ))
            )}
          </div>

          <div className="card">
            <h3>Pólizas relacionadas</h3>
            {task.relevantPolicyIds.length === 0 ? (
              <p className="empty">Ninguna.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
                {task.relevantPolicyIds.map((policyId) => (
                  <li key={policyId}>
                    <code>{policyId}</code>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Decisión</h3>
        <p style={{ fontSize: 14, marginTop: 0 }}>
          Resultado propuesto: <strong>{task.requestedOutcome}</strong>
        </p>

        {settled ? (
          <>
            <div className="notice ok">
              Tarea ya decidida. El cliente ve: “{CLIENT_VISIBLE_STATUS[task.state]}”
            </div>
            {stored.decisions.map((decision, index) => (
              <div className="fact" key={index}>
                <span className="k">{decision.decision}</span> por {decision.employeeId} el{' '}
                {formatSpanishDate(decision.decidedAt.slice(0, 10))}
                {decision.note ? <div className="prov">Nota: {decision.note}</div> : null}
                {decision.overrideReason ? (
                  <div className="prov">Motivo de excepción: {decision.overrideReason}</div>
                ) : null}
                {Object.keys(decision.edits).length > 0 ? (
                  <div className="prov">Correcciones: {Object.keys(decision.edits).join(', ')}</div>
                ) : null}
              </div>
            ))}
          </>
        ) : !canDecide ? (
          <div className="notice warn">
            Tu rol ({employee.role}) puede consultar esta tarea pero no decidir sobre ella.
          </div>
        ) : (
          <>
            {task.state === 'OPEN' ? (
              <form action={claimTaskAction} style={{ marginBottom: 14 }}>
                <input type="hidden" name="taskId" value={task.taskId} />
                <button type="submit" className="btn secondary">
                  Tomar la tarea (pasa a revisión)
                </button>
              </form>
            ) : null}

            {requiredOutstanding.length > 0 ? (
              <div className="notice warn">
                Faltan {requiredOutstanding.length} dato(s) obligatorio(s). Aprobar así exige un
                motivo de excepción
                {canOverride ? '.' : ' y el rol de supervisor (el tuyo no lo permite).'}
              </div>
            ) : null}

            <form action={decideAction} className="decision-form">
              <input type="hidden" name="taskId" value={task.taskId} />

              {Object.keys(task.verifiedFacts).length > 0 ? (
                <>
                  <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
                    Corregir datos (opcional)
                  </p>
                  {Object.entries(task.verifiedFacts).map(([key, fact]) => (
                    <label key={key}>
                      <span>{key}</span>
                      <input type="text" name={`edit:${key}`} placeholder={fact.value ?? ''} />
                    </label>
                  ))}
                </>
              ) : null}

              <label>
                <span>Nota interna</span>
                <textarea name="note" placeholder="Qué has comprobado y qué procede hacer." />
              </label>

              <label>
                <span>
                  Motivo de excepción{' '}
                  {requiredOutstanding.length > 0 ? '(obligatorio para aprobar)' : '(si procede)'}
                </span>
                <input
                  type="text"
                  name="overrideReason"
                  placeholder="Por qué se puede continuar sin la información pendiente."
                />
              </label>

              {/*
                Only the four permitted decisions exist here. There is no "send",
                no "cancel policy" and no "submit to insurer" — those actions are
                absent from the platform, not hidden behind a permission.
              */}
              <div className="btn-row">
                <button
                  type="submit"
                  name="decision"
                  value="APPROVE"
                  className="btn"
                  disabled={requiredOutstanding.length > 0 && !canOverride}
                >
                  Aprobar
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="APPROVE_WITH_EDITS"
                  className="btn"
                  disabled={requiredOutstanding.length > 0 && !canOverride}
                >
                  Aprobar con correcciones
                </button>
                <button type="submit" name="decision" value="ESCALATE" className="btn secondary">
                  Escalar
                </button>
                <button type="submit" name="decision" value="REJECT" className="btn danger">
                  Rechazar
                </button>
              </div>
            </form>
          </>
        )}

        <ControlBoundary />
      </div>

      <div className="card">
        <h3>Historial de versiones (inmutable)</h3>
        <p style={{ fontSize: 13, color: 'var(--ink-faint)', marginTop: 0 }}>
          Cada revisión crea una versión nueva; ninguna sustituye a la anterior.
        </p>
        {stored.versions.map((version, index) => (
          <div className="fact" key={index}>
            <span className="k">v{index + 1}</span>: estado {version.state} ·{' '}
            {Object.keys(version.verifiedFacts).length} dato(s) verificado(s) ·{' '}
            {version.missingInformation.length} pendiente(s)
          </div>
        ))}
      </div>
    </>
  );
}
