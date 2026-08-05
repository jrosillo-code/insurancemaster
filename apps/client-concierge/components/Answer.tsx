import type { AnswerType, ConciergeResponse, EvidenceReference, HandoffTask } from '@rosillo/domain';
import {
  ANSWER_TYPE_LABELS,
  CLIENT_STATUS_LABELS,
  EVIDENCE_TIER_LABELS,
  type Locale,
  clientDictionary,
  formatDate,
} from '@rosillo/i18n';

/**
 * Renders one assistant turn.
 *
 * Three of the blueprint's content rules are structural here rather than left to
 * wording (§13.2): the answer type is always labelled, every citation is an
 * openable card showing the exact field or passage, and an action is described as
 * *prepared* — never as done.
 *
 * Quoted evidence is never translated. A passage from a policy document is cited
 * text; rendering an English paraphrase of it inside a blockquote would present a
 * translation as a source, which is the precise failure the citation rules exist to
 * prevent. The labels around the quote follow the reader's language; the quote
 * itself stays in the language of the document.
 *
 * All values arrive as plain strings and are rendered as text by React, which
 * escapes them. No `dangerouslySetInnerHTML` anywhere in this app.
 */

function answerTone(type: AnswerType): string {
  if (type === 'FACT' || type === 'EXPLANATION' || type === 'PROCEDURE') return 'material';
  if (type === 'PRELIMINARY' || type === 'INSUFFICIENT') return 'caution';
  if (type === 'EMERGENCY' || type === 'OUT_OF_SCOPE') return 'stop';
  return '';
}

function EvidenceCard({ reference, locale }: { reference: EvidenceReference; locale: Locale }) {
  const t = clientDictionary(locale);
  return (
    <details className="evidence-card">
      <summary>
        <span className={`tier-badge${reference.tier === 'C' ? ' tier-c' : ''}`}>
          {EVIDENCE_TIER_LABELS[locale][reference.tier]}
        </span>
        <span>{reference.label}</span>
      </summary>
      <div className="evidence-body">
        {reference.quote ? <blockquote>{reference.quote}</blockquote> : null}
        <p className="evidence-meta">
          {reference.fieldPath ? `${t['answer.field']}: ${reference.fieldPath}. ` : null}
          {reference.passageId ? `${t['answer.passage']}: ${reference.passageId}. ` : null}
          {reference.effectiveFrom
            ? `${t['answer.effectiveFrom']} ${formatDate(reference.effectiveFrom, locale)}`
            : null}
          {reference.effectiveTo
            ? ` ${t['answer.effectiveTo']} ${formatDate(reference.effectiveTo, locale)}`
            : null}
          {reference.effectiveFrom ? '. ' : null}
          {t['answer.observedOn']} {formatDate(reference.observedAt.slice(0, 10), locale)}.
        </p>
      </div>
    </details>
  );
}

export function Answer({
  response,
  task,
  locale,
}: {
  response: ConciergeResponse;
  task?: HandoffTask | null;
  locale: Locale;
}) {
  const t = clientDictionary(locale);
  return (
    <div className="turn">
      <div className="bubble assistant">
        <div className={`answer-type ${answerTone(response.answerType)}`}>
          {ANSWER_TYPE_LABELS[locale][response.answerType]}
        </div>
        <div>{response.clientMessage}</div>
      </div>

      {response.safetyNotice ? (
        <div className="note-block safety" role="alert">
          {response.safetyNotice}
        </div>
      ) : null}

      {response.evidence.length > 0 ? (
        <div className="evidence-list">
          <div className="evidence-heading">{t['answer.evidenceHeading']}</div>
          {response.evidence.map((reference) => (
            <EvidenceCard key={reference.id} reference={reference} locale={locale} />
          ))}
        </div>
      ) : null}

      {response.uncertainty.length > 0 ? (
        <div className="note-block uncertainty">
          <strong>{t['answer.uncertaintyHeading']}</strong>
          <ul>
            {response.uncertainty.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {response.followUpQuestions.length > 0 ? (
        <div className="followups">
          {response.followUpQuestions.map((question) => (
            <p key={question.id}>
              <strong>{question.text}</strong>
              {question.reason ? ` — ${question.reason}` : null}
            </p>
          ))}
        </div>
      ) : null}

      {response.proposedActions.map((action) => (
        <div className="action-card" key={action.code}>
          <h4>{action.label}</h4>
          <p>{action.description}</p>
          {/* The status never implies execution — "prepared", not "sent". */}
          <span className={`action-status${action.requiresHumanApproval ? ' pending' : ''}`}>
            {task && task.actionCode === action.code
              ? CLIENT_STATUS_LABELS[locale][task.state]
              : action.requiresHumanApproval
                ? t['answer.actionPrepared']
                : t['answer.actionAvailable']}
          </span>
        </div>
      ))}

      {response.evidence.length > 0 ? (
        <p className="freshness">
          {t['answer.freshness']}{' '}
          {response.dataFreshness.newestObservedAt
            ? formatDate(response.dataFreshness.newestObservedAt.slice(0, 10), locale)
            : '—'}
          .{response.dataFreshness.containsStaleSource ? ` ${t['answer.staleSource']}` : ''}
          {response.dataFreshness.containsConflict ? ` ${t['answer.conflict']}` : ''}
        </p>
      ) : null}
    </div>
  );
}

export function ClientTurn({ text }: { text: string }) {
  return (
    <div className="turn client">
      <div className="bubble client">{text}</div>
    </div>
  );
}
