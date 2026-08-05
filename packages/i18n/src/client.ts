import type { Locale } from './locale';

/**
 * Every string the Client Concierge shows a person.
 *
 * Spanish is the source of truth for the key set — it is the original, and the
 * clients are Spanish. `EN` is then typed as `Record<ClientKey, string>`, so adding a
 * Spanish string without its English counterpart is a compile error rather than a
 * word that silently stays in the wrong language on a translated page. That is the
 * only mechanism here worth caring about: nothing else prevents a half-translated
 * interface, because a missing translation looks exactly like a deliberate one.
 */

const ES = {
  'meta.title': 'Rosillo · Asistente',
  'meta.description':
    'Prototipo de asistente conversacional de Rosillo Hermanos. Datos sintéticos únicamente.',

  'skip.toConversation': 'Saltar a la conversación',
  'banner.text': 'PROTOTIPO · DATOS SINTÉTICOS · Ningún dato real de clientes de Rosillo',
  'banner.link': 'Qué NO hace este prototipo',

  'brand.qualifier': 'Asistente',
  'brand.home': 'Rosillo · Asistente — ir al inicio',
  'topbar.activeContext': 'Contexto activo',
  'topbar.switch': 'Cambiar',

  'locale.switchTo': 'English',
  'locale.label': 'Cambiar idioma a inglés',
  'locale.current': 'Idioma: español',

  'disclosure.title': 'Estás hablando con un asistente de IA de Rosillo.',
  'disclosure.body':
    'No toma decisiones sobre tus seguros: prepara la información y la revisa una persona.',
  'disclosure.human': 'Hablar con una persona',

  'home.title': '¿En qué te puedo ayudar?',
  'home.body':
    'Pregúntame por tus pólizas, tus coberturas, tus recibos o tus siniestros. Te respondo con la documentación que Rosillo tiene registrada a tu nombre.',
  'home.examplesLabel': 'Prueba con',
  'home.example1': '¿Qué seguros tengo contratados?',
  'home.example2': '¿Cuál es la franquicia de mi coche?',
  'home.example3': '¿Estoy cubierto si me roban el móvil?',
  'home.example4': 'Necesito un certificado del seguro de hogar',

  'composer.placeholder': 'Escribe tu consulta…',
  'composer.label': 'Escribe tu consulta',
  'composer.send': 'Enviar',
  'composer.sending': 'Enviando…',
  'composer.thinking': 'Consultando tu documentación en Rosillo…',
  'composer.hint':
    'Este asistente no contrata, no da de baja ni resuelve siniestros. Prepara la información y la revisa una persona de Rosillo.',
  'composer.humanPrefill': 'Quiero hablar con una persona',

  'answer.evidenceHeading': 'En qué me baso',
  'answer.uncertaintyHeading': 'Lo que no puedo confirmar',
  'answer.field': 'Campo',
  'answer.passage': 'Pasaje',
  'answer.effectiveFrom': 'Vigente desde',
  'answer.effectiveTo': 'hasta',
  'answer.observedOn': 'Consultado el',
  'answer.actionPrepared': 'Preparado. Lo revisa una persona antes de dar ningún paso.',
  'answer.actionAvailable': 'Disponible ahora.',
  'answer.freshness': 'Datos consultados el',
  'answer.staleSource': 'Contiene documentación sustituida.',
  'answer.conflict': 'Hay fuentes que no coinciden.',

  'footer.myRequests': 'Mis consultas',
  'footer.limitations': 'Qué NO hace este prototipo',
  'account.sessionOf': 'Sesión de',
  'account.previous': 'Consultas anteriores',
  'account.signOut': 'Cerrar sesión',

  'login.intro':
    'Prototipo interno con datos sintéticos. Accede con una de las cuentas de prueba para ver cómo responde el asistente a distintos perfiles de cartera y de permisos.',
  'login.email': 'Correo electrónico',
  'login.password': 'Contraseña',
  'login.submit': 'Entrar',
  'login.demoTitle': 'Cuentas de prueba',
  'login.demoPassword': 'contraseña',
  'login.demoForAll': 'para todas.',
  'login.colAccount': 'Cuenta',
  'login.colScenario': 'Escenario',

  'demo.ana': 'Cartera familiar: auto, hogar, salud + acceso delegado a las pólizas de Luis',
  'demo.carlos': 'Mismo apellido que Ana, sin ninguna relación con ella',
  'demo.elena': 'Administradora de Talleres Serrano S.L. (acceso completo de empresa)',
  'demo.javier': 'Empleado de Talleres Serrano (solo pólizas, sin siniestros ni recibos)',
  'demo.rosa': 'Prima con dos fuentes que no coinciden',
  'demo.miguel': 'Franquicia modificada por un suplemento posterior',
  'demo.tomas': 'Responsable de flota de Translog Ibérica S.L.',
  'demo.sophie': 'Estudiante internacional (respuestas en inglés)',

  'error.generic': 'No he podido completar la acción.',
  'error.RATE_LIMITED':
    'Has enviado muchos mensajes seguidos. Espera un momento y vuelve a intentarlo.',
  'error.MESSAGE_TOO_LONG': 'El mensaje es demasiado largo. ¿Puedes resumirlo?',
  'error.CONTEXT_UNAVAILABLE': 'No puedo mostrar ese contexto con tu sesión actual.',
  'error.PROVIDER_TIMEOUT': 'No he podido procesar tu consulta a tiempo. Un asesor la revisará.',
  'error.PROVIDER_ERROR': 'No he podido procesar tu consulta. Un asesor la revisará.',
  'error.SCHEMA_VALIDATION_FAILED':
    'No he podido procesar tu consulta con seguridad. Un asesor la revisará.',

  'conversations.title': 'Consultas anteriores',
  'conversations.empty': 'Todavía no tienes consultas guardadas.',
  'conversations.back': '← Volver al asistente',

  'limits.title': 'Qué NO hace este prototipo',
} as const;

export type ClientKey = keyof typeof ES;

const EN: Record<ClientKey, string> = {
  'meta.title': 'Rosillo · Assistant',
  'meta.description':
    'Conversational assistant prototype for Rosillo Hermanos. Synthetic data only.',

  'skip.toConversation': 'Skip to the conversation',
  'banner.text': 'PROTOTYPE · SYNTHETIC DATA · No real Rosillo client data',
  'banner.link': 'What this prototype does NOT do',

  'brand.qualifier': 'Assistant',
  'brand.home': 'Rosillo · Assistant — go to the start',
  'topbar.activeContext': 'Active context',
  'topbar.switch': 'Switch',

  'locale.switchTo': 'Español',
  'locale.label': 'Change language to Spanish',
  'locale.current': 'Language: English',

  'disclosure.title': 'You are talking to a Rosillo AI assistant.',
  'disclosure.body':
    'It does not make decisions about your insurance: it prepares the information and a person reviews it.',
  'disclosure.human': 'Talk to a person',

  'home.title': 'How can I help?',
  'home.body':
    'Ask me about your policies, your cover, your receipts or your claims. I answer from the documents Rosillo holds in your name.',
  'home.examplesLabel': 'Try',
  'home.example1': 'What insurance do I have?',
  'home.example2': 'What is the excess on my car?',
  'home.example3': 'Am I covered if my phone is stolen?',
  'home.example4': 'I need a certificate for my home insurance',

  'composer.placeholder': 'Type your question…',
  'composer.label': 'Type your question',
  'composer.send': 'Send',
  'composer.sending': 'Sending…',
  'composer.thinking': 'Checking your documents at Rosillo…',
  'composer.hint':
    'This assistant does not buy cover, cancel policies or settle claims. It prepares the information and a person at Rosillo reviews it.',
  'composer.humanPrefill': 'I would like to speak to a person',

  'answer.evidenceHeading': 'What this is based on',
  'answer.uncertaintyHeading': 'What I cannot confirm',
  'answer.field': 'Field',
  'answer.passage': 'Passage',
  'answer.effectiveFrom': 'In force from',
  'answer.effectiveTo': 'until',
  'answer.observedOn': 'Checked on',
  'answer.actionPrepared': 'Prepared. A person reviews it before anything is done.',
  'answer.actionAvailable': 'Available now.',
  'answer.freshness': 'Data checked on',
  'answer.staleSource': 'Includes a document that has been superseded.',
  'answer.conflict': 'Some sources do not agree.',

  'footer.myRequests': 'My requests',
  'footer.limitations': 'What this prototype does NOT do',
  'account.sessionOf': 'Signed in as',
  'account.previous': 'Earlier requests',
  'account.signOut': 'Sign out',

  'login.intro':
    'Internal prototype with synthetic data. Sign in with one of the test accounts to see how the assistant responds to different portfolios and permissions.',
  'login.email': 'Email address',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.demoTitle': 'Test accounts',
  'login.demoPassword': 'password',
  'login.demoForAll': 'for all of them.',
  'login.colAccount': 'Account',
  'login.colScenario': 'Scenario',

  'demo.ana': 'Family portfolio: motor, home, health + delegated access to Luis’s policies',
  'demo.carlos': 'Same surname as Ana, no relationship to her at all',
  'demo.elena': 'Administrator of Talleres Serrano S.L. (full company access)',
  'demo.javier': 'Employee of Talleres Serrano (policies only, no claims or receipts)',
  'demo.rosa': 'A premium with two sources that disagree',
  'demo.miguel': 'An excess changed by a later endorsement',
  'demo.tomas': 'Fleet manager at Translog Ibérica S.L.',
  'demo.sophie': 'International student (answers in English)',

  'error.generic': 'I could not complete that.',
  'error.RATE_LIMITED': 'You have sent a lot of messages at once. Wait a moment and try again.',
  'error.MESSAGE_TOO_LONG': 'That message is too long. Could you shorten it?',
  'error.CONTEXT_UNAVAILABLE': 'I cannot show that context with your current session.',
  'error.PROVIDER_TIMEOUT': 'I could not process your question in time. An adviser will review it.',
  'error.PROVIDER_ERROR': 'I could not process your question. An adviser will review it.',
  'error.SCHEMA_VALIDATION_FAILED':
    'I could not process your question safely. An adviser will review it.',

  'conversations.title': 'Earlier requests',
  'conversations.empty': 'You have no saved requests yet.',
  'conversations.back': '← Back to the assistant',

  'limits.title': 'What this prototype does NOT do',
};

const CLIENT_STRINGS: Record<Locale, Record<ClientKey, string>> = { es: ES, en: EN };

/** Look up one string. Keys are checked at compile time, so this cannot miss. */
export function clientText(locale: Locale, key: ClientKey): string {
  return CLIENT_STRINGS[locale][key];
}

/**
 * A bound lookup, for components that would otherwise thread `locale` through every
 * call, and for the one client component — which cannot read a cookie and so is
 * handed its strings as props.
 */
export function clientDictionary(locale: Locale): Record<ClientKey, string> {
  return CLIENT_STRINGS[locale];
}
