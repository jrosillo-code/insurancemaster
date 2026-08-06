import Link from 'next/link';
import { RosilloLockup } from '@rosillo/brand';
import { type Locale, clientDictionary, otherLocale } from '@rosillo/i18n';
import type { ContextType } from '@rosillo/domain';
import { setLocaleAction } from '../lib/locale';

/**
 * Shared chrome: brand, language, active context, the AI disclosure, and the account
 * row.
 *
 * The disclosure is not a footnote and not a panel either. EU AI Act Article 50
 * transparency obligations for direct interaction with an AI system apply from
 * 2 August 2026 (blueprint §12.1), so the statement and the route to a person are on
 * every screen — but as one quiet line beneath the composer rather than a bordered
 * block above the conversation. The obligation is that it is present and legible, not
 * that it dominates a screen whose whole job is to be a place to type.
 */

export interface ContextOption {
  type: ContextType;
  id: string;
  label: string;
}

/**
 * A two-segment control rather than a button that says the name of the other
 * language.
 *
 * "English" as a lone button is ambiguous — it could equally mean "you are in
 * English" or "switch to English" — and a person has to click it to find out. Showing
 * both options with the current one marked removes the question, and `aria-pressed`
 * gives a screen reader the same information the highlight gives everyone else.
 */
export function LocaleToggle({ locale, returnTo }: { locale: Locale; returnTo: string }) {
  const t = clientDictionary(locale);
  const LOCALES: { value: Locale; short: string }[] = [
    { value: 'es', short: 'ES' },
    { value: 'en', short: 'EN' },
  ];
  return (
    <form action={setLocaleAction} className="locale-toggle" aria-label={t['locale.label']}>
      <input type="hidden" name="returnTo" value={returnTo} />
      {LOCALES.map(({ value, short }) => (
        <button
          key={value}
          type="submit"
          name="locale"
          value={value}
          className={`locale-seg${value === locale ? ' is-current' : ''}`}
          aria-pressed={value === locale}
        >
          {short}
        </button>
      ))}
    </form>
  );
}

export function TopBar({
  locale,
  contexts,
  activeContextId,
  switchAction,
  account,
}: {
  locale: Locale;
  contexts: ContextOption[];
  activeContextId: string;
  switchAction?: (formData: FormData) => void | Promise<void>;
  /** Omitted on pages that are not the conversation, where there is nothing to leave. */
  account?: {
    displayName: string;
    showPrevious: boolean;
    signOutAction: () => Promise<void>;
  };
}) {
  const t = clientDictionary(locale);
  return (
    <header className="topbar">
      <Link href="/chat" className="brand" aria-label={t['brand.home']}>
        <RosilloLockup qualifier={t['brand.qualifier']} size={25} idPrefix="topbar" />
      </Link>
      <div className="topbar-spacer" />
      {contexts.length > 1 && switchAction ? (
        <form action={switchAction} className="context-form">
          <label htmlFor="contextId" className="visually-hidden" style={{ display: 'none' }}>
            {t['topbar.activeContext']}
          </label>
          <select
            id="contextId"
            name="contextId"
            defaultValue={activeContextId}
            className="context-select"
          >
            {contexts.map((context) => (
              <option key={context.id} value={context.id}>
                {context.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn secondary small">
            {t['topbar.switch']}
          </button>
        </form>
      ) : null}
      {account ? (
        <AccountMenu
          locale={locale}
          displayName={account.displayName}
          showPrevious={account.showPrevious}
          signOutAction={account.signOutAction}
        />
      ) : null}
    </header>
  );
}

export function AiDisclosure({ locale }: { locale: Locale }) {
  const t = clientDictionary(locale);
  return (
    <p className="disclosure">
      <span>{t['disclosure.title']}</span> {t['disclosure.body']}{' '}
      <Link href="/chat?prompt=humano">{t['disclosure.human']}</Link>
    </p>
  );
}

/**
 * The account menu, in the toolbar.
 *
 * These four links spent their life as a row of small grey text under the composer —
 * the least looked-at strip on the page, which is a strange home for "everything we
 * remember about you" and "sign out". They are now behind the person's own name in
 * the top right, which is where every interface of this kind has trained people to
 * look for exactly this set of things.
 *
 * A <details> rather than a popover: it needs no client JavaScript, it works before
 * hydration, and Escape and click-outside are the browser's problem rather than mine.
 */
export function AccountMenu({
  locale,
  displayName,
  showPrevious,
  signOutAction,
}: {
  locale: Locale;
  displayName: string;
  showPrevious: boolean;
  signOutAction: () => Promise<void>;
}) {
  const t = clientDictionary(locale);
  // First name only: the toolbar is not the place for a full legal name, and the
  // menu is identified by whose it is rather than by labelling itself "Account".
  const shortName = displayName.split(' ')[0] ?? displayName;
  return (
    <details className="account-menu">
      <summary aria-label={displayName}>{shortName}</summary>
      <div className="account-panel">
        {/*
          Language sits with the other preferences rather than in the toolbar. It is a
          setting somebody changes once, and it was taking a permanent corner next to
          the brand to do it — the same corner an account control needs.
        */}
        <div className="account-locale">
          <span>{t['locale.label']}</span>
          <LocaleToggle locale={locale} returnTo="/chat" />
        </div>
        {showPrevious ? <Link href="/conversaciones">{t['account.previous']}</Link> : null}
        <Link href="/memoria">{t['footer.memory']}</Link>
        <Link href="/limitaciones">{t['footer.limitations']}</Link>
        <form action={signOutAction}>
          <button type="submit" className="link-btn">
            {t['account.signOut']}
          </button>
        </form>
      </div>
    </details>
  );
}
