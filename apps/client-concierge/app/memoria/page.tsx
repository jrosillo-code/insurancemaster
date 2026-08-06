import Link from 'next/link';
import {
  MEMORY_PURPOSES,
  type MemoryPurpose,
  attribution,
  consentAllows,
  isStale,
  usableFor,
} from '@rosillo/relationship';
import { type ClientKey, clientDictionary, formatDate } from '@rosillo/i18n';
import { TopBar } from '../../components/Chrome';
import { DEMO_TODAY, platform } from '../../lib/platform';
import { locale } from '../../lib/locale';
import { requireSession } from '../../lib/session';
import { confirmMemory, correctMemory, forgetMemory, saveConsent } from './actions';

/**
 * "What Rosillo remembers about you" (ADR-0014).
 *
 * This page is what makes the rest of the relationship layer defensible. A system
 * that claims to know you and cannot show you what it holds is asking for trust it
 * has not earned, and GDPR Articles 15–17 turn that from a design opinion into an
 * obligation: access, rectification, erasure.
 *
 * Three choices here matter more than the layout.
 *
 * **Every memory shows its attribution.** Not "we know this" but "you told us on 12
 * February". The sentence is rendered by `attribution()` rather than phrased by a
 * model, because a model asked where something came from will eventually produce
 * something plausible rather than something true.
 *
 * **Deletion is one click and needs no reason.** There is no "are you sure you want
 * to lose this useful feature" step. A right you have to argue for is not a right.
 *
 * **Consent defaults to off and every switch says what it actually does.** The help
 * text under each is written in terms of what happens to the person reading it, not
 * in terms of what the platform gets to do.
 */

export const dynamic = 'force-dynamic';

const PURPOSE_KEY: Record<MemoryPurpose, ClientKey> = {
  ANSWER_IN_CONVERSATION: 'consent.ANSWER_IN_CONVERSATION',
  COVERAGE_REVIEW: 'consent.COVERAGE_REVIEW',
  PROACTIVE_CONTACT: 'consent.PROACTIVE_CONTACT',
  ADVISER_CONTEXT: 'consent.ADVISER_CONTEXT',
};

const PURPOSE_HELP_KEY: Record<MemoryPurpose, ClientKey> = {
  ANSWER_IN_CONVERSATION: 'consent.ANSWER_IN_CONVERSATION.help',
  COVERAGE_REVIEW: 'consent.COVERAGE_REVIEW.help',
  PROACTIVE_CONTACT: 'consent.PROACTIVE_CONTACT.help',
  ADVISER_CONTEXT: 'consent.ADVISER_CONTEXT.help',
};

export default async function MemoryPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; edit?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const active = await locale();
  const t = clientDictionary(active);
  const store = platform().store;

  const all = await store.listMemories(session.account.id);
  const consent = await store.getConsent(session.account.id);
  // Tombstones stay in the store so erasure is demonstrable, but the client has
  // already asked not to see them.
  const memories = all.filter((memory) => !memory.forgottenAt);

  return (
    <>
      <TopBar
        locale={active}
        contexts={session.availableContexts}
        activeContextId={session.contextId}
      />

      <main className="content">
        <h1>{t['memory.title']}</h1>
        <p>{t['memory.intro']}</p>

        {params.ok ? (
          <div className="notice-ok" role="status">
            {params.ok === 'forgotten' ? t['memory.forgotten'] : t['consent.saved']}
          </div>
        ) : null}

        {memories.length === 0 ? (
          <p className="empty">{t['memory.empty']}</p>
        ) : (
          <ul className="memory-list">
            {memories.map((memory) => {
              const editing = params.edit === memory.id;
              const stale = isStale(memory, DEMO_TODAY);
              // What this memory is actually usable for, right now — the per-record
              // grant AND the account switch, which is the same check the engine makes.
              const purposes = MEMORY_PURPOSES.filter(
                (purpose) =>
                  usableFor(memory, purpose as MemoryPurpose) &&
                  consentAllows(consent, purpose as MemoryPurpose),
              );
              return (
                <li className="memory-item" key={memory.id}>
                  <div className="memory-head">
                    <strong>{memory.label}</strong>
                    {memory.aboutThirdParty ? (
                      <span className="chip">{t['memory.aboutOther']}</span>
                    ) : null}
                    {memory.specialCategory ? (
                      <span className="chip sensitive">{t['memory.special']}</span>
                    ) : null}
                    {stale ? <span className="chip stale">{t['memory.stale']}</span> : null}
                  </div>

                  {editing ? (
                    <form action={correctMemory} className="memory-edit">
                      <input type="hidden" name="memoryId" value={memory.id} />
                      <input
                        type="text"
                        name="value"
                        defaultValue={memory.value}
                        maxLength={400}
                        required
                        aria-label={memory.label}
                      />
                      <button type="submit" className="btn small">
                        {t['memory.save']}
                      </button>
                      <Link href="/memoria" className="btn secondary small">
                        {t['memory.cancel']}
                      </Link>
                    </form>
                  ) : (
                    <p className="memory-value">{memory.value}</p>
                  )}

                  {/* Where it came from, always, and never phrased by a model. */}
                  <p className="memory-prov">
                    {attribution(memory, active)}
                    {memory.confirmedAt
                      ? ` · ${t['memory.confirmed']} ${formatDate(memory.confirmedAt.slice(0, 10), active)}`
                      : ''}
                  </p>

                  {purposes.length > 0 ? (
                    <p className="memory-prov">
                      {t['memory.usedFor']}:{' '}
                      {purposes.map((purpose) => t[PURPOSE_KEY[purpose as MemoryPurpose]]).join(' · ')}
                    </p>
                  ) : null}

                  {editing ? null : (
                    <div className="memory-actions">
                      <Link href={`/memoria?edit=${memory.id}`} className="btn secondary small">
                        {t['memory.edit']}
                      </Link>
                      {stale ? (
                        <form action={confirmMemory}>
                          <input type="hidden" name="memoryId" value={memory.id} />
                          <button type="submit" className="btn secondary small">
                            {t['memory.confirm']}
                          </button>
                        </form>
                      ) : null}
                      {/* No confirmation step and no reason required. */}
                      <form action={forgetMemory}>
                        <input type="hidden" name="memoryId" value={memory.id} />
                        <button type="submit" className="btn danger small">
                          {t['memory.forget']}
                        </button>
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <h2>{t['consent.title']}</h2>
        <p>{t['consent.intro']}</p>

        <form action={saveConsent} className="consent-form">
          {MEMORY_PURPOSES.map((purpose) => {
            const granted = consentAllows(consent, purpose as MemoryPurpose);
            const since = consent.grantedAt[purpose];
            return (
              <label className="consent-row" key={purpose}>
                <input type="checkbox" name={`purpose:${purpose}`} defaultChecked={granted} />
                <span>
                  <strong>{t[PURPOSE_KEY[purpose as MemoryPurpose]]}</strong>
                  <span className="consent-help">
                    {t[PURPOSE_HELP_KEY[purpose as MemoryPurpose]]}
                    {granted && since
                      ? ` — ${t['consent.grantedOn']} ${formatDate(since.slice(0, 10), active)}`
                      : ''}
                  </span>
                </span>
              </label>
            );
          })}

          <fieldset className="quiet-hours">
            <legend>{t['consent.quietTitle']}</legend>
            <p className="consent-help">{t['consent.quietHelp']}</p>
            <label>
              <span>{t['consent.quietFrom']}</span>
              <input
                type="number"
                name="quietFrom"
                min={0}
                max={23}
                defaultValue={consent.quietHours?.fromHour ?? 22}
              />
            </label>
            <label>
              <span>{t['consent.quietTo']}</span>
              <input
                type="number"
                name="quietTo"
                min={0}
                max={23}
                defaultValue={consent.quietHours?.toHour ?? 9}
              />
            </label>
          </fieldset>

          <button type="submit" className="btn">
            {t['consent.save']}
          </button>
        </form>

        <p style={{ marginTop: 28 }}>
          <Link href="/chat">{t['memory.back']}</Link>
        </p>
      </main>
    </>
  );
}
