import { redirect } from 'next/navigation';
import { DEMO_PASSWORD, EMPLOYEES } from '@rosillo/auth';
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

  return (
    <main className="login-wrap">
      <h1>Espacio del empleado</h1>
      <p className="subtitle">Revisión de las tareas que prepara el asistente. Datos sintéticos.</p>
      {params.error ? <div className="notice error">{params.error}</div> : null}
      <form action={loginAction}>
        <label className="field">
          <span>Correo</span>
          <input type="email" name="email" defaultValue="ana@rosillo.test" required autoComplete="username" />
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input type="password" name="password" defaultValue={DEMO_PASSWORD} required autoComplete="current-password" />
        </label>
        <button type="submit" className="btn" style={{ width: '100%' }}>Entrar</button>
      </form>
      <div className="demo-users">
        <strong>Usuarios de prueba</strong> — contraseña <code>{DEMO_PASSWORD}</code>.
        <table>
          <thead><tr><th>Correo</th><th>Rol</th><th>Colas</th></tr></thead>
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
