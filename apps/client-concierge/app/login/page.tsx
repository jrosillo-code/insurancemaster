import { redirect } from 'next/navigation';
import { RosilloMark } from '@rosillo/brand';
import { type ClientKey, clientDictionary, otherLocale } from '@rosillo/i18n';
import { DEMO_PASSWORD } from '@rosillo/auth';
import { locale, setLocaleAction } from '../../lib/locale';
import { getSession, signIn } from '../../lib/session';

/**
 * Prototype login (ADR-0004).
 *
 * Shared demo password over seeded synthetic accounts. This is not production
 * authentication and is labelled as such on the page — a pilot uses the existing
 * Rosillo app identity (blueprint §11.3).
 */

export const dynamic = 'force-dynamic';

const DEMO_ACCOUNTS: [string, ClientKey][] = [
  ['ana@cliente.test', 'demo.ana'],
  ['carlos@cliente.test', 'demo.carlos'],
  ['elena@cliente.test', 'demo.elena'],
  ['javier@cliente.test', 'demo.javier'],
  ['rosa@cliente.test', 'demo.rosa'],
  ['miguel@cliente.test', 'demo.miguel'],
  ['tomas@cliente.test', 'demo.tomas'],
  ['sophie@cliente.test', 'demo.sophie'],
];

async function loginAction(formData: FormData): Promise<void> {
  'use server';
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const error = await signIn(email, password);
  if (error) redirect(`/login?error=${encodeURIComponent(error)}`);
  redirect('/chat');
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSession()) redirect('/chat');
  const params = await searchParams;
  const active = await locale();
  const t = clientDictionary(active);

  return (
    <main className="login-wrap">
      <form action={setLocaleAction} className="locale-form login-locale">
        <input type="hidden" name="locale" value={otherLocale(active)} />
        <input type="hidden" name="returnTo" value="/login" />
        <button type="submit" className="locale-btn" aria-label={t['locale.label']}>
          {t['locale.switchTo']}
        </button>
      </form>

      <RosilloMark size={56} idPrefix="login" className="login-mark" />
      <h1>
        Rosillo <span>· {t['brand.qualifier']}</span>
      </h1>
      <p>{t['login.intro']}</p>

      {params.error ? (
        <div className="error" role="alert">
          {params.error}
        </div>
      ) : null}

      <form action={loginAction}>
        <label className="field">
          <span>{t['login.email']}</span>
          <input type="email" name="email" defaultValue="ana@cliente.test" required autoComplete="username" />
        </label>
        <label className="field">
          <span>{t['login.password']}</span>
          <input
            type="password"
            name="password"
            defaultValue={DEMO_PASSWORD}
            required
            autoComplete="current-password"
          />
        </label>
        <button type="submit" className="btn" style={{ width: '100%' }}>
          {t['login.submit']}
        </button>
      </form>

      <div className="demo-users">
        <strong>{t['login.demoTitle']}</strong> — {t['login.demoPassword']}{' '}
        <code>{DEMO_PASSWORD}</code> {t['login.demoForAll']}
        <table>
          <thead>
            <tr>
              <th>{t['login.colAccount']}</th>
              <th>{t['login.colScenario']}</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_ACCOUNTS.map(([email, key]) => (
              <tr key={email}>
                <td>
                  <code>{email}</code>
                </td>
                <td>{t[key]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
