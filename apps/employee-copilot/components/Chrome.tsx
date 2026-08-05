import Link from 'next/link';
import { RosilloLockup } from '@rosillo/brand';
import { type Locale, employeeDictionary, otherLocale } from '@rosillo/i18n';
import type { Employee } from '@rosillo/auth';
import { hasPermission } from '@rosillo/auth';
import { setLocaleAction } from '../lib/locale';

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
      <div className="spacer" />
      <span className="who">
        {employee.name} · {employee.role}
      </span>
      <form action={setLocaleAction} className="locale-form">
        <input type="hidden" name="locale" value={otherLocale(locale)} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <button type="submit" className="locale-btn" aria-label={t['locale.label']}>
          {t['locale.switchTo']}
        </button>
      </form>
      <form action={signOutAction}>
        <button type="submit" className="btn secondary small">
          {t['nav.signOut']}
        </button>
      </form>
    </header>
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
