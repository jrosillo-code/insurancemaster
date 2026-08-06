import { redirect } from 'next/navigation';
import { RosilloMark } from '@rosillo/brand';
import { employeeDictionary } from '@rosillo/i18n';
import { DEMO_PASSWORD, EMPLOYEES } from '@rosillo/auth';
import { locale, setLocaleAction } from '../../lib/locale';
import { getEmployee, signIn } from '../../lib/session';

/** Prototype employee login (ADR-0004). A pilot requires passkeys or strong MFA. */
export const dynamic = 'force-dynamic';

async function loginAction(formData: FormData): Promise<void> {
  'use server';
  const error = await signIn(String(formData.get('email') ?? ''), String(formData.get('password') ?? ''));
  if (error) redirect(`/login?error=${encodeURIComponent(error)}`);
  redirect('/');
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getEmployee()) redirect('/');
  const params = await searchParams;
  const active = await locale();
  const t = employeeDictionary(active);

  return (
    <main className="login-wrap">
      <div className="login-head">
        <RosilloMark size={48} className="login-mark" />
        <span className="spacer" />
        <form action={setLocaleAction} className="locale-toggle" aria-label={t['locale.label']}>
          <input type="hidden" name="returnTo" value="/login" />
          {(['es', 'en'] as const).map((value) => (
            <button
              key={value}
              type="submit"
              name="locale"
              value={value}
              className={`locale-seg${value === active ? ' is-current' : ''}`}
              aria-pressed={value === active}
            >
              {value.toUpperCase()}
            </button>
          ))}
        </form>
      </div>
      <h1>
        Rosillo <span>· {t['brand.qualifier']}</span>
      </h1>
      <p className="subtitle">{t['login.subtitle']}</p>
      {params.error ? <div className="notice error">{params.error}</div> : null}
      <form action={loginAction}>
        <label className="field">
          <span>{t['login.email']}</span>
          <input type="email" name="email" defaultValue="ana@rosillo.test" required autoComplete="username" />
        </label>
        <label className="field">
          <span>{t['login.password']}</span>
          <input type="password" name="password" defaultValue={DEMO_PASSWORD} required autoComplete="current-password" />
        </label>
        <button type="submit" className="btn" style={{ width: '100%' }}>{t['login.submit']}</button>
      </form>
      <div className="demo-users">
        <strong>{t['login.demoTitle']}</strong> — {t['login.demoPassword']}{' '}
        <code>{DEMO_PASSWORD}</code>.
        <table>
          <thead>
            <tr>
              <th>{t['login.colEmail']}</th>
              <th>{t['login.colRole']}</th>
              <th>{t['login.colQueues']}</th>
            </tr>
          </thead>
          <tbody>
            {EMPLOYEES.map((e) => (
              <tr key={e.id}>
                <td><code>{e.email}</code></td>
                <td>{e.role}</td>
                <td>{e.queues.length > 0 ? e.queues.join(', ') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
