import type { Locale } from './locale';

/**
 * Every string the Employee Copilot shows a person.
 *
 * Same parity guarantee as the client dictionary: Spanish defines the key set, English
 * is typed against it, and a missing translation fails the build.
 *
 * This surface is a review tool, so the English is deliberately plain rather than
 * friendly. An adviser is deciding whether to act on somebody's insurance; the words
 * that matter are the ones separating what Rosillo verified from what the client
 * merely said, and those must not soften in either language.
 */

const ES = {
  'meta.title': 'Rosillo · Empleado',
  'meta.description': 'Espacio interno de revisión. Datos sintéticos únicamente.',

  'banner.text':
    'PROTOTIPO INTERNO · DATOS SINTÉTICOS · Sin conexión a segElevia, correo ni aseguradoras · Ninguna acción sale de Rosillo',

  'brand.qualifier': 'Empleado',
  'brand.home': 'Rosillo · Empleado — ir a la cola',
  'nav.queue': 'Cola',
  'nav.audit': 'Auditoría',
  'nav.signOut': 'Salir',

  'locale.switchTo': 'English',
  'locale.label': 'Idioma',

  'queue.title': 'Cola de tareas',
  'queue.subtitle': 'Consultas que el asistente ha preparado para revisión humana.',
  'queue.seesAll': 'Ves todas las colas.',
  'queue.seesOwn': 'Ves tus colas:',
  'queue.none': 'ninguna',
  'queue.pending': 'Pendientes',
  'queue.decided': 'Decididas',
  'queue.empty':
    'No hay tareas pendientes. Abre el asistente de cliente y envía una consulta para generar una.',
  'queue.requiredOutstanding': 'dato(s) obligatorio(s) pendiente(s)',
  'queue.relatedPolicies': 'póliza(s) relacionada(s)',

  'error.noPermission': 'No tienes permiso para acceder a esa sección.',
  'error.otherQueue': 'Esa tarea pertenece a una cola que no gestionas.',
  'error.notAllowed': 'Acción no permitida.',

  'task.back': '← Volver a la cola',
  'task.createdOn': 'Creada el',
  'task.proposedAction': 'Acción propuesta',
  'task.decisionRecorded': 'Decisión registrada.',
  'task.riskFlags': 'Señales de riesgo:',
  'task.exactRequest': 'Petición exacta del cliente',
  'task.seeConversation': 'Ver la conversación completa',
  'task.identity': 'Identidad y autorización',
  'task.client': 'Cliente',
  'task.actingFor': 'Actúa por',
  'task.authorityBasis': 'Base de la autorización',
  'task.preferredChannel': 'Canal preferido',
  'task.clientSays': 'Lo que dice el cliente (sin verificar)',
  'task.clientSaysTag': 'Declarado por el cliente · no verificado',
  'task.noStatements': 'Sin declaraciones registradas.',
  'task.conversation': 'Conversación',
  'task.noMessages': 'Sin mensajes.',
  'task.roleClient': 'Cliente',
  'task.roleAssistant': 'Asistente',
  'task.answerType': 'Tipo de respuesta',
  'task.verifiedFacts': 'Datos verificados',
  'task.noVerifiedFacts': 'Ningún dato verificado todavía.',
  'task.source': 'Fuente',
  'task.checked': 'consultado',
  'task.confidence': 'confianza',
  'task.unresolvedConflict': 'Conflicto sin resolver:',
  'task.otherSource': 'otra fuente',
  'task.missingInfo': 'Información pendiente',
  'task.nothingMissing': 'Nada pendiente según las reglas aprobadas.',
  'task.evidenceUsed': 'Evidencia utilizada',
  'task.noEvidence': 'Sin evidencia citada.',
  'task.relatedPolicies': 'Pólizas relacionadas',
  'task.noPolicies': 'Ninguna.',

  'task.summary': 'Resumen',
  'task.outstanding': 'obligatorio(s) sin resolver',
  'task.allResolved': 'Sin datos obligatorios pendientes',
  'task.showConversation': 'Ver la conversación',
  'task.showEvidence': 'Ver la evidencia citada',
  'task.showHistory': 'Ver el historial de versiones',
  'task.showPolicies': 'Pólizas relacionadas',
  'task.theCase': 'El caso',
  'task.theAnalysis': 'Lo que ha preparado el asistente',

  'decision.heading': 'Decisión',
  'decision.proposedOutcome': 'Resultado propuesto',
  'decision.alreadyDecided': 'Tarea ya decidida. El cliente ve:',
  'decision.by': 'por',
  'decision.on': 'el',
  'decision.note': 'Nota',
  'decision.overrideReason': 'Motivo de excepción',
  'decision.edits': 'Correcciones',
  'decision.cannotDecide': 'puede consultar esta tarea pero no decidir sobre ella.',
  'decision.yourRole': 'Tu rol',
  'decision.claim': 'Tomar la tarea (pasa a revisión)',
  'decision.missingWarnA': 'Faltan',
  'decision.missingWarnB': 'dato(s) obligatorio(s). Aprobar así exige un motivo de excepción',
  'decision.missingWarnSupervisor': 'y el rol de supervisor (el tuyo no lo permite).',
  'decision.editFacts': 'Corregir datos (opcional)',
  'decision.internalNote': 'Nota interna',
  'decision.internalNotePlaceholder': 'Qué has comprobado y qué procede hacer.',
  'decision.overrideRequired': '(obligatorio para aprobar)',
  'decision.overrideOptional': '(si procede)',
  'decision.overridePlaceholder': 'Por qué se puede continuar sin la información pendiente.',
  'decision.approve': 'Aprobar',
  'decision.approveWithEdits': 'Aprobar con correcciones',
  'decision.escalate': 'Escalar',
  'decision.reject': 'Rechazar',

  'versions.heading': 'Historial de versiones (inmutable)',
  'versions.note': 'Cada revisión crea una versión nueva; ninguna sustituye a la anterior.',
  'versions.state': 'estado',
  'versions.verifiedCount': 'dato(s) verificado(s)',
  'versions.missingCount': 'pendiente(s)',

  'boundary.text':
    'Este espacio prepara y registra decisiones. No envía correos, no comunica nada a las aseguradoras y no escribe en el sistema de gestión. La tramitación se hace por los canales habituales de Rosillo.',

  'audit.title': 'Auditoría',
  'audit.subtitle': 'Registro append-only encadenado por hash. Ninguna fila puede modificarse.',
  'audit.verified': 'Cadena de integridad verificada',
  'audit.events': 'evento(s), sin alteraciones.',
  'audit.broken': 'La cadena de integridad NO verifica.',
  'audit.colTime': 'Momento',
  'audit.colActor': 'Actor',
  'audit.colAction': 'Acción',
  'audit.colSubject': 'Sujeto',
  'audit.colTrace': 'Traza',
  'audit.colMetadata': 'Metadatos',
  'audit.empty': 'Sin eventos registrados.',
  'audit.noContent':
    'Los eventos no contienen el texto de los mensajes ni el contenido de las pólizas: solo identificadores, verdictos y metadatos no sensibles.',

  'login.title': 'Rosillo · Empleado',
  'login.subtitle': 'Revisión de las tareas que prepara el asistente. Datos sintéticos.',
  'login.email': 'Correo',
  'login.password': 'Contraseña',
  'login.submit': 'Entrar',
  'login.demoTitle': 'Usuarios de prueba',
  'login.demoPassword': 'contraseña',
  'login.colEmail': 'Correo',
  'login.colRole': 'Rol',
  'login.colQueues': 'Colas',
} as const;

export type EmployeeKey = keyof typeof ES;

const EN: Record<EmployeeKey, string> = {
  'meta.title': 'Rosillo · Staff',
  'meta.description': 'Internal review workspace. Synthetic data only.',

  'banner.text':
    'INTERNAL PROTOTYPE · SYNTHETIC DATA · No connection to segElevia, email or insurers · No action leaves Rosillo',

  'brand.qualifier': 'Staff',
  'brand.home': 'Rosillo · Staff — go to the queue',
  'nav.queue': 'Queue',
  'nav.audit': 'Audit',
  'nav.signOut': 'Sign out',

  'locale.switchTo': 'Español',
  'locale.label': 'Language',

  'queue.title': 'Task queue',
  'queue.subtitle': 'Requests the assistant has prepared for human review.',
  'queue.seesAll': 'You see every queue.',
  'queue.seesOwn': 'You see your queues:',
  'queue.none': 'none',
  'queue.pending': 'Pending',
  'queue.decided': 'Decided',
  'queue.empty':
    'No pending tasks. Open the client assistant and send a request to generate one.',
  'queue.requiredOutstanding': 'required detail(s) outstanding',
  'queue.relatedPolicies': 'related polic(ies)',

  'error.noPermission': 'You do not have permission to open that section.',
  'error.otherQueue': 'That task belongs to a queue you do not handle.',
  'error.notAllowed': 'Action not permitted.',

  'task.back': '← Back to the queue',
  'task.createdOn': 'Created on',
  'task.proposedAction': 'Proposed action',
  'task.decisionRecorded': 'Decision recorded.',
  'task.riskFlags': 'Risk signals:',
  'task.exactRequest': "The client's exact request",
  'task.seeConversation': 'See the whole conversation',
  'task.identity': 'Identity and authorisation',
  'task.client': 'Client',
  'task.actingFor': 'Acting for',
  'task.authorityBasis': 'Basis of authorisation',
  'task.preferredChannel': 'Preferred channel',
  'task.clientSays': 'What the client says (unverified)',
  'task.clientSaysTag': 'Stated by the client · not verified',
  'task.noStatements': 'No statements recorded.',
  'task.conversation': 'Conversation',
  'task.noMessages': 'No messages.',
  'task.roleClient': 'Client',
  'task.roleAssistant': 'Assistant',
  'task.answerType': 'Answer type',
  'task.verifiedFacts': 'Verified facts',
  'task.noVerifiedFacts': 'Nothing verified yet.',
  'task.source': 'Source',
  'task.checked': 'checked',
  'task.confidence': 'confidence',
  'task.unresolvedConflict': 'Unresolved conflict:',
  'task.otherSource': 'other source',
  'task.missingInfo': 'Outstanding information',
  'task.nothingMissing': 'Nothing outstanding under the approved rules.',
  'task.evidenceUsed': 'Evidence used',
  'task.noEvidence': 'No evidence cited.',
  'task.relatedPolicies': 'Related policies',
  'task.noPolicies': 'None.',

  'task.summary': 'Summary',
  'task.outstanding': 'required item(s) outstanding',
  'task.allResolved': 'Nothing required is outstanding',
  'task.showConversation': 'Show the conversation',
  'task.showEvidence': 'Show the evidence cited',
  'task.showHistory': 'Show the version history',
  'task.showPolicies': 'Related policies',
  'task.theCase': 'The case',
  'task.theAnalysis': 'What the assistant prepared',

  'decision.heading': 'Decision',
  'decision.proposedOutcome': 'Proposed outcome',
  'decision.alreadyDecided': 'Already decided. The client sees:',
  'decision.by': 'by',
  'decision.on': 'on',
  'decision.note': 'Note',
  'decision.overrideReason': 'Override reason',
  'decision.edits': 'Corrections',
  'decision.cannotDecide': 'can open this task but cannot decide on it.',
  'decision.yourRole': 'Your role',
  'decision.claim': 'Take the task (moves to in review)',
  'decision.missingWarnA': 'Missing',
  'decision.missingWarnB': 'required detail(s). Approving anyway requires an override reason',
  'decision.missingWarnSupervisor': 'and the supervisor role (yours does not allow it).',
  'decision.editFacts': 'Correct the facts (optional)',
  'decision.internalNote': 'Internal note',
  'decision.internalNotePlaceholder': 'What you checked and what should happen next.',
  'decision.overrideRequired': '(required in order to approve)',
  'decision.overrideOptional': '(if applicable)',
  'decision.overridePlaceholder': 'Why this can proceed without the outstanding information.',
  'decision.approve': 'Approve',
  'decision.approveWithEdits': 'Approve with corrections',
  'decision.escalate': 'Escalate',
  'decision.reject': 'Reject',

  'versions.heading': 'Version history (immutable)',
  'versions.note': 'Each review creates a new version; none replaces the one before it.',
  'versions.state': 'state',
  'versions.verifiedCount': 'verified fact(s)',
  'versions.missingCount': 'outstanding',

  'boundary.text':
    'This workspace prepares and records decisions. It sends no email, communicates nothing to insurers and writes nothing to the management system. Processing happens through Rosillo’s usual channels.',

  'audit.title': 'Audit',
  'audit.subtitle': 'Append-only log, chained by hash. No row can be modified.',
  'audit.verified': 'Integrity chain verified',
  'audit.events': 'event(s), unaltered.',
  'audit.broken': 'The integrity chain does NOT verify.',
  'audit.colTime': 'Time',
  'audit.colActor': 'Actor',
  'audit.colAction': 'Action',
  'audit.colSubject': 'Subject',
  'audit.colTrace': 'Trace',
  'audit.colMetadata': 'Metadata',
  'audit.empty': 'No events recorded.',
  'audit.noContent':
    'Events hold no message text and no policy content: identifiers, verdicts and non-sensitive metadata only.',

  'login.title': 'Rosillo · Staff',
  'login.subtitle': 'Review of the tasks the assistant prepares. Synthetic data.',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.demoTitle': 'Test users',
  'login.demoPassword': 'password',
  'login.colEmail': 'Email',
  'login.colRole': 'Role',
  'login.colQueues': 'Queues',
};

const EMPLOYEE_STRINGS: Record<Locale, Record<EmployeeKey, string>> = { es: ES, en: EN };

export function employeeText(locale: Locale, key: EmployeeKey): string {
  return EMPLOYEE_STRINGS[locale][key];
}

export function employeeDictionary(locale: Locale): Record<EmployeeKey, string> {
  return EMPLOYEE_STRINGS[locale];
}
