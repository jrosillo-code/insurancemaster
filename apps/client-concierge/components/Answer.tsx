import type { AnswerType, ConciergeResponse, EvidenceReference, HandoffTask } from '@rosillo/domain';
import { truncate } from '@rosillo/domain';
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

function EvidenceCard({
  reference,
  locale,
  distinguish,
}: {
  reference: EvidenceReference;
  locale: Locale;
  /**
   * True when another card in this answer carries the same label.
   *
   * An answer that gives a premium, a renewal date and a status cites three fields
   * of one policy, and all three are labelled with that policy — so the list read as
   * the same card printed three times. The quote is what tells them apart, and it
   * moves up into the summary only when there is something to tell apart.
   */
  distinguish: boolean;
}) {
  const t = clientDictionary(locale);
  return (
    <details className="evidence-card">
      <summary>
        <span className={`tier-badge${reference.tier === 'C' ? ' tier-c' : ''}`}>
          {EVIDENCE_TIER_LABELS[locale][reference.tier]}
        </span>
        <span>
          {reference.label}
          {distinguish && reference.quote ? ` · ${truncate(reference.quote, 60)}` : null}
        </span>
      </summary>
      <div className="evidence-body">
        {/*
          The quote is the evidence. Everything else is metadata about it, and the
          previous version put five facts in one run-on paragraph — field path,
          passage id, effective dates, observation date — which buried the one line a
          client came to read.

          What survives is the quote and, on a second line, only the dates that change
          what the quote *means*: when it took effect, and when we last looked. Field
          paths and passage ids are internal identifiers; an adviser needs them and
          they are on the employee surface, but a client reading their own policy does
          not, and printing them here made the card look like a debug dump.
        */}
        {reference.quote ? <blockquote>{reference.quote}</blockquote> : null}
        <p className="evidence-meta">
          {reference.effectiveFrom
            ? `${t['answer.effectiveFrom']} ${formatDate(reference.effectiveFrom, locale)}${
                reference.effectiveTo
                  ? ` ${t['answer.effectiveTo']} ${formatDate(reference.effectiveTo, locale)}`
                  : ''
              } · `
            : null}
          {t['answer.observedOn']} {formatDate(reference.observedAt.slice(0, 10), locale)}
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
        {/*
          A badge qualifies a claim. A greeting or a question back makes no claim, so
          there is nothing to qualify and the badge is left off — the employee case
          file still records the type.
        */}
        {response.answerType === 'CONVERSATIONAL' ? null : (
          <div className={`answer-type ${answerTone(response.answerType)}`}>
            {ANSWER_TYPE_LABELS[locale][response.answerType]}
          </div>
        )}
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
            <EvidenceCard
              key={reference.id}
              reference={reference}
              locale={locale}
              distinguish={
                response.evidence.filter((other) => other.label === reference.label).length > 1
              }
            />
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
