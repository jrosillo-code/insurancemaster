import Link from 'next/link';
import { RosilloLockup } from '@rosillo/brand';
import { EMPLOYEE_ROLE_LABELS, type Locale, employeeDictionary } from '@rosillo/i18n';
import type { Employee } from '@rosillo/auth';
import { hasPermission } from '@rosillo/auth';
import { setLocaleAction } from '../lib/locale';

/**
 * The toolbar: brand, navigation, and everything about *you* behind your own name.
 *
 * It used to be six things in a row — mark, wordmark, Queue, Audit, "Ana Belén Ruiz ·
 * operator", a language switch and a Sign out button — separated by a flat 14px gap,
 * with a spacer div that never worked (it carried `className="spacer"` while the
 * stylesheet defined `.topbar-spacer`, so nothing was ever pushed right and the whole
 * row bunched to the left with a ragged tail).
 *
 * What is left is what an employee navigates with. Their name, their role, their
 * language and the way out are one menu behind their own name in the top right, which
 * is the client surface's arrangement and the place every interface of this kind has
 * trained people to look.
 */

export function TopBar({
  employee,
  signOutAction,
  locale,
  returnTo = '/',
}: {
  employee: Employee;
  signOutAction: () => Promise<void>;
  locale: Locale;
  returnTo?: string;
}) {
  const t = employeeDictionary(locale);
  return (
    <header className="topbar">
      <Link href="/" className="brand" aria-label={t['brand.home']}>
        <RosilloLockup qualifier={t['brand.qualifier']} size={24} idPrefix="topbar" />
      </Link>
      <nav>
        <Link href="/">{t['nav.queue']}</Link>
        {hasPermission(employee.role, 'audit.read') ? (
          <Link href="/auditoria">{t['nav.audit']}</Link>
        ) : null}
      </nav>
      <div className="topbar-spacer" />
      <AccountMenu
        employee={employee}
        locale={locale}
        returnTo={returnTo}
        signOutAction={signOutAction}
      />
    </header>
  );
}

/**
 * A <details> rather than a popover: no client JavaScript, it works before hydration,
 * and Escape and click-outside are the browser's problem rather than mine.
 *
 * Who you are signed in as still matters in a workspace where the role decides which
 * decisions you may take, so the role stays visible — but as a translated word under
 * your name rather than the raw union member (`claims_specialist`, underscore and all)
 * printed in the toolbar.
 */
export function AccountMenu({
  employee,
  locale,
  returnTo,
  signOutAction,
}: {
  employee: Employee;
  locale: Locale;
  returnTo: string;
  signOutAction: () => Promise<void>;
}) {
  const t = employeeDictionary(locale);
  const shortName = employee.name.split(' ')[0] ?? employee.name;
  return (
    <details className="account-menu">
      <summary aria-label={employee.name}>{shortName}</summary>
      <div className="account-panel">
        <div className="account-who">
          <strong>{employee.name}</strong>
          <span>{EMPLOYEE_ROLE_LABELS[locale][employee.role]}</span>
        </div>
        {/*
          Language is a preference somebody sets once. It was taking a permanent slot
          in the toolbar to do it, next to the two links that are actually navigation.
        */}
        <div className="account-locale">
          <span>{t['locale.label']}</span>
          <form action={setLocaleAction} className="locale-toggle" aria-label={t['locale.label']}>
            <input type="hidden" name="returnTo" value={returnTo} />
            {(['es', 'en'] as const).map((value) => (
              <button
                key={value}
                type="submit"
                name="locale"
                value={value}
                className={`locale-seg${value === locale ? ' is-current' : ''}`}
                aria-pressed={value === locale}
              >
                {value.toUpperCase()}
              </button>
            ))}
          </form>
        </div>
        <form action={signOutAction}>
          <button type="submit" className="link-btn">
            {t['nav.signOut']}
          </button>
        </form>
      </div>
    </details>
  );
}

/**
 * The standing reminder of what this workspace cannot do.
 *
 * Prohibited actions are absent from the interface rather than disabled
 * (blueprint §13.3); this states the boundary so an employee is never left
 * wondering whether a missing button is a bug.
 */
export function ControlBoundary({ locale }: { locale: Locale }) {
  return <p className="boundary">{employeeDictionary(locale)['boundary.text']}</p>;
}
