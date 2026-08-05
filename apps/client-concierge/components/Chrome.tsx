import Link from 'next/link';
import type { ContextType } from '@rosillo/domain';

/**
 * Shared chrome: brand, active person/company context, and the AI disclosure.
 *
 * The disclosure is not a footnote. EU AI Act Article 50 transparency obligations
 * for direct interaction with an AI system apply from 2 August 2026 (blueprint
 * §12.1), so the statement and the route to a human sit above the conversation on
 * every screen rather than behind a link.
 */

export interface ContextOption {
  type: ContextType;
  id: string;
  label: string;
}

export function TopBar({
  contexts,
  activeContextId,
  switchAction,
}: {
  contexts: ContextOption[];
  activeContextId: string;
  switchAction?: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <header className="topbar">
      <Link href="/chat" className="brand">
        ROSILLO <span>· Asistente</span>
      </Link>
      <div className="topbar-spacer" />
      {contexts.length > 1 && switchAction ? (
        <form action={switchAction} className="context-form">
          <label htmlFor="contextId" style={{ fontSize: 13, color: 'var(--ink-faint)' }}>
            Contexto
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
            Cambiar
          </button>
        </form>
      ) : (
        <span style={{ fontSize: 13, color: 'var(--ink-faint)' }}>
          {contexts[0]?.label ?? ''}
        </span>
      )}
    </header>
  );
}

export function AiDisclosure() {
  return (
    <div className="disclosure">
      <div>
        <strong>Estás hablando con un asistente de IA de Rosillo.</strong>
        No toma decisiones sobre tus seguros: prepara la información y la revisa una persona.
      </div>
      <Link href="/chat?prompt=humano" className="human-link">
        Hablar con una persona
      </Link>
    </div>
  );
}

export function FooterLinks() {
  return (
    <nav className="footer-links">
      <Link href="/conversaciones">Mis consultas</Link>
      <Link href="/limitaciones">Qué NO hace este prototipo</Link>
      <form action="/api/health" style={{ display: 'none' }} />
    </nav>
  );
}
