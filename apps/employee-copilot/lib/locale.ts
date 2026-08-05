import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  LOCALE_COOKIE,
  type Locale,
  employeeDictionary,
  isLocale,
  resolveLocale,
} from '@rosillo/i18n';

/**
 * The active locale for this request.
 *
 * The employee workspace has no per-account preference to fall back on — an adviser
 * is not a record in the Customer 360 — so it is the cookie or Spanish. The cookie
 * name is shared with the client surface deliberately: on the same host, choosing a
 * language once should hold across both.
 */
export async function locale(): Promise<Locale> {
  const jar = await cookies();
  return resolveLocale(jar.get(LOCALE_COOKIE)?.value);
}

export async function localised() {
  const active = await locale();
  return { locale: active, t: employeeDictionary(active) };
}

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
  redirect(String(formData.get('returnTo') ?? '/'));
}
