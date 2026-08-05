import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isTerminalState } from '@rosillo/domain';
import {
  CLIENT_STATUS_LABELS,
  INTENT_DISPLAY,
  RISK_FLAG_DISPLAY,
  TASK_STATE_DISPLAY,
  formatDate,
} from '@rosillo/i18n';
import { canAccessQueue, hasPermission } from '@rosillo/auth';
import { ControlBoundary, TopBar } from '../../../components/Chrome';
import { localised } from '../../../lib/locale';
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
  const { locale, t } = await localised();

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
      <TopBar employee={employee} signOutAction={signOutAction} locale={locale} returnTo={`/tareas/${id}`} />

      <p style={{ fontSize: 13, marginBottom: 12 }}>
        <Link href="/">{t['task.back']}</Link>
      </p>

      <div className="task-row-head" style={{ marginBottom: 8 }}>
        <span className={`badge state-${task.state}`}>{TASK_STATE_DISPLAY[locale][task.state]}</span>
        <span className="badge queue">{task.employeeQueue}</span>
        <h1 style={{ margin: 0 }}>{INTENT_DISPLAY[locale][task.intent]}</h1>
      </div>
      <p className="subtitle">
        {t['task.createdOn']} {formatDate(task.createdAt.slice(0, 10), locale)} ·{' '}
        {t['task.proposedAction']}: <strong>{task.actionCode}</strong>
      </p>

      {query.ok ? <div className="notice ok">{t['task.decisionRecorded']}</div> : null}
      {query.error ? <div className="notice error">{decodeURIComponent(query.error)}</div> : null}
      {task.riskFlags.length > 0 ? (
        <div className="notice warn">
          <strong>{t['task.riskFlags']}</strong>{' '}
          {task.riskFlags.map((flag) => RISK_FLAG_DISPLAY[locale][flag]).join(' · ')}
        </div>
      ) : null}

      <div className="columns">
        <div>
          <div className="card">
            <h3>{t['task.exactRequest']}</h3>
            <div className="verbatim">{task.clientRequest}</div>
            <p className="task-meta" style={{ marginTop: 10 }}>
              <Link href={`/tareas/${task.taskId}#conversacion`}>{t['task.seeConversation']}</Link>
            </p>
          </div>

          <div className="card">
            <h3>{t['task.identity']}</h3>
            <div className="fact">
              <span className="k">{t['task.client']}</span>: {party?.name ?? task.clientId}
              <div className="prov">{task.clientId}</div>
            </div>
            {organisation ? (
              <div className="fact">
                <span className="k">{t['task.actingFor']}</span>: {organisation.name}
                <div className="prov">{organisation.id}</div>
              </div>
            ) : null}
            <div className="fact">
              <span className="k">{t['task.authorityBasis']}</span>
              <div className="prov">{task.authorityBasis}</div>
            </div>
            <div className="fact">
              <span className="k">{t['task.preferredChannel']}</span>: {task.preferredChannel}
            </div>
          </div>

          <div className="card">
            <h3>{t['task.clientSays']}</h3>
            {task.clientStatements.length === 0 ? (
              <p className="empty">{t['task.noStatements']}</p>
            ) : (
              task.clientStatements.map((statement, index) => (
                <div className="statement" key={index}>
                  <span className="tag">{t['task.clientSaysTag']}</span>
                  {statement.text}
                </div>
              ))
            )}
          </div>

          <div className="card" id="conversacion">
            <h3>{t['task.conversation']}</h3>
            {messages.length === 0 ? (
              <p className="empty">{t['task.noMessages']}</p>
            ) : (
              messages.map((message) => (
                <div key={message.id} style={{ marginBottom: 10, fontSize: 14 }}>
                  <strong>{message.role === 'CLIENT' ? t['task.roleClient'] : t['task.roleAssistant']}:</strong>{' '}
                  {message.text}
                  {message.answerType ? (
                    <div className="prov" style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                      {t['task.answerType']}: {message.answerType}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="card">
            <h3>{t['task.verifiedFacts']}</h3>
            {Object.keys(task.verifiedFacts).length === 0 ? (
              <p className="empty">{t['task.noVerifiedFacts']}</p>
            ) : (
              Object.entries(task.verifiedFacts).map(([key, fact]) => (
                <div className={`fact verified${fact.conflict ? ' conflict' : ''}`} key={key}>
                  <span className="k">{key}</span>: {fact.value ?? '—'}
                  <div className="prov">
                    {t['task.source']}: {fact.sourceType} · {fact.sourceId}
                    {fact.sourcePath ? ` · ${fact.sourcePath}` : ''} · {t['task.checked']}{' '}
                    {formatDate(fact.observedAt.slice(0, 10), locale)} · {t['task.confidence']}{' '}
                    {Math.round(fact.confidence * 100)}%
                  </div>
                  {fact.conflict ? (
                    <div className="prov">
                      <strong>{t['task.unresolvedConflict']}</strong> {fact.conflict.detail} (
                      {t['task.otherSource']}: {fact.conflict.otherSourceId} ={' '}
                      {fact.conflict.otherValue})
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <div className="card">
            <h3>{t['task.missingInfo']}</h3>
            {task.missingInformation.length === 0 ? (
              <p className="empty">{t['task.nothingMissing']}</p>
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
            <h3>{t['task.evidenceUsed']}</h3>
            {task.evidence.length === 0 ? (
              <p className="empty">{t['task.noEvidence']}</p>
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
            <h3>{t['task.relatedPolicies']}</h3>
            {task.relevantPolicyIds.length === 0 ? (
              <p className="empty">{t['task.noPolicies']}</p>
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
        <h3>{t['decision.heading']}</h3>
        <p style={{ fontSize: 14, marginTop: 0 }}>
          {t['decision.proposedOutcome']}: <strong>{task.requestedOutcome}</strong>
        </p>

        {settled ? (
          <>
            <div className="notice ok">
              {t['decision.alreadyDecided']} “{CLIENT_STATUS_LABELS[locale][task.state]}”
            </div>
            {stored.decisions.map((decision, index) => (
              <div className="fact" key={index}>
                <span className="k">{decision.decision}</span> {t['decision.by']}{' '}
                {decision.employeeId} {t['decision.on']}{' '}
                {formatDate(decision.decidedAt.slice(0, 10), locale)}
                {decision.note ? (
                  <div className="prov">
                    {t['decision.note']}: {decision.note}
                  </div>
                ) : null}
                {decision.overrideReason ? (
                  <div className="prov">
                    {t['decision.overrideReason']}: {decision.overrideReason}
                  </div>
                ) : null}
                {Object.keys(decision.edits).length > 0 ? (
                  <div className="prov">
                    {t['decision.edits']}: {Object.keys(decision.edits).join(', ')}
                  </div>
                ) : null}
              </div>
            ))}
          </>
        ) : !canDecide ? (
          <div className="notice warn">
            {t['decision.yourRole']} ({employee.role}) {t['decision.cannotDecide']}
          </div>
        ) : (
          <>
            {task.state === 'OPEN' ? (
              <form action={claimTaskAction} style={{ marginBottom: 14 }}>
                <input type="hidden" name="taskId" value={task.taskId} />
                <button type="submit" className="btn secondary">
                  {t['decision.claim']}
                </button>
              </form>
            ) : null}

            {requiredOutstanding.length > 0 ? (
              <div className="notice warn">
                {t['decision.missingWarnA']} {requiredOutstanding.length}{' '}
                {t['decision.missingWarnB']}
                {canOverride ? '.' : ` ${t['decision.missingWarnSupervisor']}`}
              </div>
            ) : null}

            <form action={decideAction} className="decision-form">
              <input type="hidden" name="taskId" value={task.taskId} />

              {Object.keys(task.verifiedFacts).length > 0 ? (
                <>
                  <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
                    {t['decision.editFacts']}
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
                <span>{t['decision.internalNote']}</span>
                <textarea name="note" placeholder={t['decision.internalNotePlaceholder']} />
              </label>

              <label>
                <span>
                  {t['decision.overrideReason']}{' '}
                  {requiredOutstanding.length > 0
                    ? t['decision.overrideRequired']
                    : t['decision.overrideOptional']}
                </span>
                <input
                  type="text"
                  name="overrideReason"
                  placeholder={t['decision.overridePlaceholder']}
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
                  {t['decision.approve']}
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="APPROVE_WITH_EDITS"
                  className="btn"
                  disabled={requiredOutstanding.length > 0 && !canOverride}
                >
                  {t['decision.approveWithEdits']}
                </button>
                <button type="submit" name="decision" value="ESCALATE" className="btn secondary">
                  {t['decision.escalate']}
                </button>
                <button type="submit" name="decision" value="REJECT" className="btn danger">
                  {t['decision.reject']}
                </button>
              </div>
            </form>
          </>
        )}

        <ControlBoundary locale={locale} />
      </div>

      <div className="card">
        <h3>{t['versions.heading']}</h3>
        <p style={{ fontSize: 13, color: 'var(--ink-faint)', marginTop: 0 }}>
          {t['versions.note']}
        </p>
        {stored.versions.map((version, index) => (
          <div className="fact" key={index}>
            <span className="k">v{index + 1}</span>: {t['versions.state']}{' '}
            {TASK_STATE_DISPLAY[locale][version.state]} ·{' '}
            {Object.keys(version.verifiedFacts).length} {t['versions.verifiedCount']} ·{' '}
            {version.missingInformation.length} {t['versions.missingCount']}
          </div>
        ))}
      </div>
    </>
  );
}
