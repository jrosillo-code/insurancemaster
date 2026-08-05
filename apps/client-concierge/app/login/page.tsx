import { redirect } from 'next/navigation';
import { RosilloMark } from '@rosillo/brand';
import { DEMO_PASSWORD } from '@rosillo/auth';
import { getSession, signIn } from '../../lib/session';

/**
 * Prototype login (ADR-0004).
 *
 * Shared demo password over seeded synthetic accounts. This is not production
 * authentication and is labelled as such on the page — a pilot uses the existing
 * Rosillo app identity (blueprint §11.3).
 */

export const dynamic = 'force-dynamic';

const DEMO_ACCOUNTS = [
  ['ana@cliente.test', 'Cartera familiar: auto, hogar, salud + acceso delegado a las pólizas de Luis'],
  ['carlos@cliente.test', 'Mismo apellido que Ana, sin ninguna relación con ella'],
  ['elena@cliente.test', 'Administradora de Talleres Serrano S.L. (acceso completo de empresa)'],
  ['javier@cliente.test', 'Empleado de Talleres Serrano (solo pólizas, sin siniestros ni recibos)'],
  ['rosa@cliente.test', 'Prima con dos fuentes que no coinciden'],
  ['miguel@cliente.test', 'Franquicia modificada por un suplemento posterior'],
  ['tomas@cliente.test', 'Responsable de flota de Translog Ibérica S.L.'],
  ['sophie@cliente.test', 'Estudiante internacional (respuestas en inglés)'],
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

  return (
    <main className="login-wrap">
      <RosilloMark size={56} idPrefix="login" className="login-mark" />
      <h1>
        Rosillo <span>· Asistente</span>
      </h1>
      <p>
        Prototipo interno con datos sintéticos. Accede con una de las cuentas de prueba para ver
        cómo responde el asistente a distintos perfiles de cartera y de permisos.
      </p>

      {params.error ? (
        <div className="error" role="alert">
          {params.error}
        </div>
      ) : null}

      <form action={loginAction}>
        <label className="field">
          <span>Correo electrónico</span>
          <input type="email" name="email" defaultValue="ana@cliente.test" required autoComplete="username" />
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input
            type="password"
            name="password"
            defaultValue={DEMO_PASSWORD}
            required
            autoComplete="current-password"
          />
        </label>
        <button type="submit" className="btn" style={{ width: '100%' }}>
          Entrar
        </button>
      </form>

      <div className="demo-users">
        <strong>Cuentas de prueba</strong> — contraseña <code>{DEMO_PASSWORD}</code> para todas.
        <table>
          <thead>
            <tr>
              <th>Cuenta</th>
              <th>Escenario</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_ACCOUNTS.map(([email, description]) => (
              <tr key={email}>
                <td>
                  <code>{email}</code>
                </td>
                <td>{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
