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
}: {
  locale: Locale;
  contexts: ContextOption[];
  activeContextId: string;
  switchAction?: (formData: FormData) => void | Promise<void>;
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
      <LocaleToggle locale={locale} returnTo="/chat" />
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
 * Account and navigation in one row. Previously three separate blocks — footer links,
 * an account bar and a sign-out — below a screen that was meant to be nearly empty.
 */
export function FooterBar({
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
  return (
    <nav className="footer-bar">
      <span className="who">{displayName}</span>
      {showPrevious ? <Link href="/conversaciones">{t['account.previous']}</Link> : null}
      <Link href="/memoria">{t['footer.memory']}</Link>
      <Link href="/limitaciones">{t['footer.limitations']}</Link>
      <span className="spacer" />
      <form action={signOutAction}>
        <button type="submit" className="link-btn">
          {t['account.signOut']}
        </button>
      </form>
    </nav>
  );
}
