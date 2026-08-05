import Link from 'next/link';
import type { Locale } from '@rosillo/i18n';
import { clientDictionary } from '@rosillo/i18n';
import { locale } from '../../lib/locale';

/**
 * "What this prototype does not do" (blueprint §21 Security and Privacy).
 *
 * Required by the build specification and, more usefully, by the product itself:
 * a client who knows the boundary trusts the answers inside it more.
 *
 * The prose lives here rather than in the shared dictionary because it is a document,
 * not a set of interface strings — two whole versions of a page read better than
 * twenty-five numbered fragments, and a translator can see the argument they are
 * translating.
 */

export const dynamic = 'force-dynamic';

interface Content {
  title: string;
  intro: string;
  doesTitle: string;
  does: string[];
  notTitle: string;
  not: string[];
  dataTitle: string;
  data: string[];
  aiTitle: string;
  ai: string[];
  back: string;
}

const CONTENT: Record<Locale, Content> = {
  es: {
    title: 'Qué hace y qué no hace este prototipo',
    intro:
      'Este asistente es un prototipo interno de Rosillo Hermanos construido íntegramente sobre datos sintéticos. No contiene, ni debe contener nunca, información real de clientes.',
    doesTitle: 'Lo que sí hace',
    does: [
      'Responde sobre las pólizas, recibos, documentos y siniestros de tu cartera autorizada.',
      'Cita siempre la fuente concreta de cada dato y la fecha en que se consultó.',
      'Explica lo que dice tu documentación, distinguiéndolo de lo que debe confirmar un asesor.',
      'Localiza los documentos que ya existen en tu expediente.',
      'Prepara consultas y tareas internas para que las revise una persona de Rosillo.',
      'Dice claramente cuándo no puede confirmar algo, en lugar de improvisar una respuesta.',
    ],
    notTitle: 'Lo que no hace, por diseño',
    not: [
      'No contrata, emite ni modifica ninguna póliza.',
      'No tramita bajas: puede prepararlas, pero las verifica y ejecuta un empleado.',
      'No aprueba ni rechaza siniestros, ni determina indemnizaciones.',
      'No tarifica riesgos de vida ni de salud.',
      'No cambia de aseguradora por su cuenta.',
      'No envía ningún mensaje ni documento fuera de Rosillo.',
      'No escribe en el sistema de gestión: solo lee.',
      'No da asesoramiento fiscal, legal ni de inversión.',
      'No accede a datos de ningún otro cliente, aunque comparta apellidos contigo.',
    ],
    dataTitle: 'Cómo trata tu información',
    data: [
      'Solo consulta lo que tu sesión está autorizada a ver. Compartir apellido, domicilio o empresa con otra persona no da acceso a sus datos: hace falta una autorización registrada, y esa autorización puede ser parcial (por ejemplo, ver pólizas pero no siniestros).',
      'Todo lo que ocurre en una conversación queda registrado de forma inalterable: qué se consultó, qué decidió el sistema y qué revisó una persona.',
    ],
    aiTitle: 'Sobre la inteligencia artificial',
    ai: [
      'Estás interactuando con un sistema de IA. El modelo se usa para entender lo que escribes y para redactar la respuesta; no decide qué datos se consultan, qué acciones están permitidas ni qué información falta. Eso lo determinan reglas revisadas y personas de Rosillo.',
      'Puedes pedir hablar con una persona en cualquier momento.',
    ],
    back: '← Volver al asistente',
  },
  en: {
    title: 'What this prototype does, and what it does not',
    intro:
      'This assistant is an internal Rosillo Hermanos prototype built entirely on synthetic data. It contains no real client information, and never should.',
    doesTitle: 'What it does',
    does: [
      'Answers questions about the policies, receipts, documents and claims you are authorised to see.',
      'Always cites the specific source of each fact, and the date it was read.',
      'Explains what your documents say, kept separate from what an adviser has to confirm.',
      'Finds the documents already held in your file.',
      'Prepares requests and internal tasks for a person at Rosillo to review.',
      'Says plainly when it cannot confirm something, rather than improvising an answer.',
    ],
    notTitle: 'What it does not do, by design',
    not: [
      'It does not buy, issue or amend any policy.',
      'It does not process cancellations: it can prepare one, but an employee verifies and carries it out.',
      'It does not approve or reject claims, or decide what is paid.',
      'It does not price life or health risks.',
      'It does not move you to a different insurer on its own.',
      'It sends no message and no document outside Rosillo.',
      'It does not write to the management system: it only reads.',
      'It gives no tax, legal or investment advice.',
      'It reaches no other client’s data, even someone who shares your surname.',
    ],
    dataTitle: 'How it treats your information',
    data: [
      'It reads only what your session is authorised to see. Sharing a surname, an address or a company with somebody else grants no access to their data: that needs a recorded authorisation, and such an authorisation can be partial — seeing policies but not claims, for instance.',
      'Everything that happens in a conversation is recorded so that it cannot be altered afterwards: what was read, what the system decided, and what a person reviewed.',
    ],
    aiTitle: 'About the artificial intelligence',
    ai: [
      'You are interacting with an AI system. The model is used to understand what you write and to draft the reply; it does not decide which data is read, which actions are permitted, or what information is missing. Reviewed rules and people at Rosillo determine that.',
      'You can ask to speak to a person at any point.',
    ],
    back: '← Back to the assistant',
  },
};

export default async function LimitationsPage() {
  const active = await locale();
  const c = CONTENT[active];
  const t = clientDictionary(active);

  return (
    <main className="content">
      <h1>{c.title}</h1>
      <p>{c.intro}</p>

      <h2>{c.doesTitle}</h2>
      <ul className="can-list">
        {c.does.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <h2>{c.notTitle}</h2>
      <ul className="cannot-list">
        {c.not.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <h2>{c.dataTitle}</h2>
      {c.data.map((line) => (
        <p key={line}>{line}</p>
      ))}

      <h2>{c.aiTitle}</h2>
      {c.ai.map((line) => (
        <p key={line}>{line}</p>
      ))}

      <p style={{ marginTop: 28 }}>
        <Link href="/chat">{c.back}</Link>
      </p>
      <p className="visually-hidden" style={{ display: 'none' }}>
        {t['limits.title']}
      </p>
    </main>
  );
}
