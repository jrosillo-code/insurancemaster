/**
 * Locale plumbing.
 *
 * The platform is Spanish-first because Rosillo's clients are, but every surface has
 * to be fully readable in English — chrome, answers, evidence labels, employee
 * workspace, the lot. One locale value drives all of it, including the language the
 * model is asked to reply in, so there is no state in which the interface is English
 * and the answer inside it is not.
 *
 * The choice is a cookie rather than a URL segment. A path prefix would change every
 * route and every link for a preference that is not addressable content — the same
 * conversation in English is the same conversation.
 */

export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'es';

/** Read by both applications; set by the toggle in either. */
export const LOCALE_COOKIE = 'rosillo_locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * The locale to use, in order of precedence: an explicit choice, then whatever the
 * client's record says they prefer, then Spanish.
 *
 * An explicit choice wins over the account preference on purpose. Sophie's record
 * says English; if she switches to Spanish, the switch has to hold — a preference
 * stored upstream is a default, not an override.
 */
export function resolveLocale(cookie: string | undefined, preferred?: string | undefined): Locale {
  if (isLocale(cookie)) return cookie;
  if (isLocale(preferred)) return preferred;
  return DEFAULT_LOCALE;
}

/** The other one. Used by the toggle, which is always a single button. */
export function otherLocale(locale: Locale): Locale {
  return locale === 'es' ? 'en' : 'es';
}

const DATE_TAG: Record<Locale, string> = { es: 'es-ES', en: 'en-GB' };

/**
 * A date as a person reads it, in their language.
 *
 * UTC throughout: these are effectivity dates on insurance documents, not moments.
 * Rendering `2026-01-01` as "31 December 2025" for a reader west of Greenwich would
 * be a factual error about when a cover began.
 */
export function formatDate(iso: string, locale: Locale): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(DATE_TAG[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Percentages and counts follow the locale too, or the interface reads half-translated. */
export function formatNumber(value: number, locale: Locale): string {
  return value.toLocaleString(DATE_TAG[locale]);
}
