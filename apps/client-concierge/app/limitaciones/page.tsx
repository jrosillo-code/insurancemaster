import Link from 'next/link';

/**
 * "What this prototype does not do" (blueprint §21 Security and Privacy).
 *
 * Required by the build specification and, more usefully, by the product itself:
 * a client who knows the boundary trusts the answers inside it more.
 */

export const metadata = { title: 'Qué NO hace este prototipo · Rosillo' };

export default function LimitationsPage() {
  return (
    <main className="content">
      <h1>Qué hace y qué no hace este prototipo</h1>
      <p>
        Este asistente es un prototipo interno de Rosillo Hermanos construido íntegramente sobre
        datos sintéticos. No contiene, ni debe contener nunca, información real de clientes.
      </p>

      <h2>Lo que sí hace</h2>
      <ul className="can-list">
        <li>Responde sobre las pólizas, recibos, documentos y siniestros de tu cartera autorizada.</li>
        <li>Cita siempre la fuente concreta de cada dato y la fecha en que se consultó.</li>
        <li>Explica lo que dice tu documentación, distinguiéndolo de lo que debe confirmar un asesor.</li>
        <li>Localiza los documentos que ya existen en tu expediente.</li>
        <li>Prepara consultas y tareas internas para que las revise una persona de Rosillo.</li>
        <li>Dice claramente cuándo no puede confirmar algo, en lugar de improvisar una respuesta.</li>
      </ul>

      <h2>Lo que no hace, por diseño</h2>
      <ul className="cannot-list">
        <li>No contrata, emite ni modifica ninguna póliza.</li>
        <li>No tramita bajas: puede prepararlas, pero las verifica y ejecuta un empleado.</li>
        <li>No aprueba ni rechaza siniestros, ni determina indemnizaciones.</li>
        <li>No tarifica riesgos de vida ni de salud.</li>
        <li>No cambia de aseguradora por su cuenta.</li>
        <li>No envía ningún mensaje ni documento fuera de Rosillo.</li>
        <li>No escribe en el sistema de gestión: solo lee.</li>
        <li>No da asesoramiento fiscal, legal ni de inversión.</li>
        <li>No accede a datos de ningún otro cliente, aunque comparta apellidos contigo.</li>
      </ul>

      <h2>Cómo trata tu información</h2>
      <p>
        Solo consulta lo que tu sesión está autorizada a ver. Compartir apellido, domicilio o
        empresa con otra persona no da acceso a sus datos: hace falta una autorización registrada, y
        esa autorización puede ser parcial (por ejemplo, ver pólizas pero no siniestros).
      </p>
      <p>
        Todo lo que ocurre en una conversación queda registrado de forma inalterable: qué se
        consultó, qué decidió el sistema y qué revisó una persona.
      </p>

      <h2>Sobre la inteligencia artificial</h2>
      <p>
        Estás interactuando con un sistema de IA. El modelo se usa para entender lo que escribes y
        para redactar la respuesta; no decide qué datos se consultan, qué acciones están permitidas
        ni qué información falta. Eso lo determinan reglas revisadas y personas de Rosillo.
      </p>
      <p>Puedes pedir hablar con una persona en cualquier momento.</p>

      <p style={{ marginTop: 28 }}>
        <Link href="/chat">← Volver al asistente</Link>
      </p>
    </main>
  );
}
