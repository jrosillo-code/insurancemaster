import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  LOCALE_COOKIE,
  type Locale,
  clientDictionary,
  isLocale,
  resolveLocale,
} from '@rosillo/i18n';
import { getSession } from './session';

/**
 * The active locale for this request.
 *
 * Order: an explicit toggle, then the account's recorded preference, then Spanish.
 * The toggle wins over the account record on purpose — a stored preference is a
 * sensible default, not a decision the person cannot revise.
 *
 * Read on every render rather than cached: it is one cookie lookup, and a stale
 * locale is the kind of bug where half the page is in the wrong language.
 */
export async function locale(): Promise<Locale> {
  const jar = await cookies();
  const session = await getSession();
  return resolveLocale(jar.get(LOCALE_COOKIE)?.value, session?.account.preferredLanguage);
}

/** The active locale together with its dictionary, which is what most pages want. */
export async function localised() {
  const active = await locale();
  return { locale: active, t: clientDictionary(active) };
}

/**
 * Switch language. A server action rather than a link with a query parameter, so the
 * choice does not end up in the URL of a conversation someone might share.
 */
export async function setLocaleAction(formData: FormData): Promise<void> {
  'use server';
  const next = formData.get('locale');
  if (!isLocale(next)) return;
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, next, {
    httpOnly: false,
    sameSite: 'strict',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  // Not a security decision — it selects a language and nothing else, which is why it
  // is readable from script and carries no session meaning.
  redirect(String(formData.get('returnTo') ?? '/chat'));
}
