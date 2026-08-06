/** Small text helpers shared by matching, retrieval and the deterministic provider. */

/** Lowercase and strip accents so "póliza" and "poliza" match. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** "Hola", "buenas", "good morning" — an opening, with nothing asked yet. */
const GREETING =
  /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|hi|hello|good (morning|afternoon|evening))\b[\s!.,¡¿?]*$/;
/** "Gracias", "vale", "perfecto" — an acknowledgement, which is not a question. */
const COURTESY =
  /^(muchas |mil )?(gracias|ok|okay|vale|perfecto|genial|estupendo|de acuerdo|entendido|thanks|thank you|great|perfect|got it|understood)\b[\s!.,]*$/;

/**
 * A message that opens or closes a conversation without asking anything.
 *
 * Deliberately narrow: the whole message must be the greeting or the acknowledgement.
 * "Hola, ¿cuánto pago este año?" is a question with a greeting attached and is not
 * small talk. This decides whether a reply may drop its evidence caveat, so a loose
 * match here would let a real question be answered without one.
 *
 * It reads the client's own words, never a model's output — which is why the policy
 * layer can trust it.
 */
export function isSmallTalk(message: string): boolean {
  const text = normalise(message).trim();
  return GREETING.test(text) || COURTESY.test(text);
}

/** True when the whole message is a greeting rather than an acknowledgement. */
export function isGreeting(message: string): boolean {
  return GREETING.test(normalise(message).trim());
}

/** Escapes text for safe interpolation into HTML attributes or bodies. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Truncates on a word boundary, appending an ellipsis when it actually cut. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

/** Formats a EUR amount in Spanish convention, e.g. 1234.5 → "1.234,50 €". */
export function formatEur(amount: number): string {
  return `${amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** Formats an ISO date as "1 de octubre de 2026". */
export function formatSpanishDate(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
