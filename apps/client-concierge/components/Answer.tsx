import type { AnswerType, ConciergeResponse, EvidenceReference, HandoffTask } from '@rosillo/domain';
import { ANSWER_TYPE_PRESENTATION, CLIENT_VISIBLE_STATUS, formatSpanishDate } from '@rosillo/domain';

/**
 * Renders one assistant turn.
 *
 * Three of the blueprint's content rules are structural here rather than left to
 * wording (§13.2): the answer type is always labelled, every citation is an
 * openable card showing the exact field or passage, and an action is described as
 * *prepared* — never as done.
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

function EvidenceCard({ reference }: { reference: EvidenceReference }) {
  const tierLabel: Record<EvidenceReference['tier'], string> = {
    A: 'Tu ficha',
    B: 'Tu documentación',
    C: 'Procedimiento Rosillo',
    D: 'Interpretación',
    E: 'General',
  };
  return (
    <details className="evidence-card">
      <summary>
        <span className={`tier-badge${reference.tier === 'C' ? ' tier-c' : ''}`}>
          {tierLabel[reference.tier]}
        </span>
        <span>{reference.label}</span>
      </summary>
      <div className="evidence-body">
        {reference.quote ? <blockquote>{reference.quote}</blockquote> : null}
        <p className="evidence-meta">
          {reference.fieldPath ? `Campo: ${reference.fieldPath}. ` : null}
          {reference.passageId ? `Pasaje: ${reference.passageId}. ` : null}
          {reference.effectiveFrom
            ? `Vigente desde ${formatSpanishDate(reference.effectiveFrom)}`
            : null}
          {reference.effectiveTo ? ` hasta ${formatSpanishDate(reference.effectiveTo)}` : null}
          {reference.effectiveFrom ? '. ' : null}
          Consultado el {formatSpanishDate(reference.observedAt.slice(0, 10))}.
        </p>
      </div>
    </details>
  );
}

export function Answer({ response, task }: { response: ConciergeResponse; task?: HandoffTask | null }) {
  const presentation = ANSWER_TYPE_PRESENTATION[response.answerType];
  return (
    <div className="turn">
      <div className="bubble assistant">
        <div className={`answer-type ${answerTone(response.answerType)}`}>{presentation.label}</div>
        <div>{response.clientMessage}</div>
      </div>

      {response.safetyNotice ? (
        <div className="note-block safety" role="alert">
          {response.safetyNotice}
        </div>
      ) : null}

      {response.evidence.length > 0 ? (
        <div className="evidence-list">
          <div className="evidence-heading">En qué me baso</div>
          {response.evidence.map((reference) => (
            <EvidenceCard key={reference.id} reference={reference} />
          ))}
        </div>
      ) : null}

      {response.uncertainty.length > 0 ? (
        <div className="note-block uncertainty">
          <strong>Lo que no puedo confirmar</strong>
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
              ? CLIENT_VISIBLE_STATUS[task.state]
              : action.requiresHumanApproval
                ? 'Preparado. Lo revisa una persona antes de dar ningún paso.'
                : 'Disponible ahora.'}
          </span>
        </div>
      ))}

      {response.evidence.length > 0 ? (
        <p className="freshness">
          Datos consultados el{' '}
          {response.dataFreshness.newestObservedAt
            ? formatSpanishDate(response.dataFreshness.newestObservedAt.slice(0, 10))
            : '—'}
          .{response.dataFreshness.containsStaleSource ? ' Contiene documentación sustituida.' : ''}
          {response.dataFreshness.containsConflict ? ' Hay fuentes que no coinciden.' : ''}
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
