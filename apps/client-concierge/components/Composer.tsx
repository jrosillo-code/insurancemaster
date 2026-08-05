'use client';

import { useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * The message composer.
 *
 * The only client component in the application, and it earns that for one reason: a
 * server action re-renders the whole page, so between pressing Send and the answer
 * appearing there is a second or so in which nothing visibly happens. Without
 * feedback that reads as a broken button, and the honest fix is to say the request
 * was received.
 *
 * It holds no data and calls nothing — the action is a server action passed in, and
 * every decision still happens on the server. What lives here is presentation of
 * *pending*, which is not something the server can express in a static render.
 */

const MAX_HEIGHT = 180;

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn" disabled={pending}>
      {pending ? 'Enviando…' : 'Enviar'}
    </button>
  );
}

function Thinking() {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    // aria-live so a screen-reader user hears that the request is in flight rather
    // than sitting in silence waiting for a page that is being rebuilt.
    <p className="thinking" role="status" aria-live="polite">
      <span className="thinking-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      Consultando tu documentación en Rosillo…
    </p>
  );
}

function MessageField({ defaultValue }: { defaultValue: string }) {
  const { pending } = useFormStatus();
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grows with the message instead of becoming a two-line scroll box.
  const resize = () => {
    const field = ref.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, MAX_HEIGHT)}px`;
  };

  useEffect(resize, []);

  return (
    <textarea
      ref={ref}
      id="message"
      name="message"
      rows={1}
      placeholder="Escribe tu consulta…"
      defaultValue={defaultValue}
      maxLength={4000}
      required
      disabled={pending}
      onInput={resize}
      onKeyDown={(event) => {
        // Enter sends, Shift+Enter breaks the line. On a phone the on-screen keyboard
        // sends a newline rather than a key event, so the button stays the main route.
        if (event.key !== 'Enter' || event.shiftKey) return;
        event.preventDefault();
        event.currentTarget.form?.requestSubmit();
      }}
    />
  );
}

export function Composer({
  action,
  conversationId,
  prefill,
}: {
  action: (formData: FormData) => void | Promise<void>;
  conversationId: string;
  prefill: string;
}) {
  return (
    <div className="composer">
      <form action={action}>
        <input type="hidden" name="conversationId" value={conversationId} />
        <label htmlFor="message" className="visually-hidden" style={{ display: 'none' }}>
          Escribe tu consulta
        </label>
        <MessageField defaultValue={prefill} />
        <SendButton />
      </form>
      <Thinking />
      <p className="composer-hint">
        Este asistente no contrata, no da de baja ni resuelve siniestros. Prepara la información y
        la revisa una persona de Rosillo.
      </p>
    </div>
  );
}
