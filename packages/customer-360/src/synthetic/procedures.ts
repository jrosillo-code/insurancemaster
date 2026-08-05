import type { ApprovedProcedure } from '../model';

/**
 * Approved Rosillo procedures — knowledge tier C (blueprint §9.4).
 *
 * These may answer a client directly, but only when labelled as a procedure. A
 * procedure describes how Rosillo works; it never states what a policy covers.
 * Draft knowledge is not represented here at all: only approved, versioned
 * procedures reach the retrieval layer (blueprint §6.4 control boundary).
 */
export const APPROVED_PROCEDURES: ApprovedProcedure[] = [
  {
    id: 'proc_declarar_siniestro_auto',
    title: 'Cómo declarar un siniestro de auto',
    topics: ['siniestro', 'accidente', 'auto', 'coche', 'parte amistoso', 'golpe', 'colisión'],
    steps: [
      'Comprobar primero que nadie ha resultado herido y, si lo hay, llamar al 112.',
      'Recoger los datos del otro vehículo: matrícula, aseguradora y número de póliza.',
      'Rellenar el parte amistoso si ambas partes están de acuerdo, o avisar a la policía si no lo están.',
      'Hacer fotografías de los daños, de la posición de los vehículos y del entorno.',
      'Enviar el parte y las fotografías a Rosillo para la apertura del expediente.',
    ],
    requiredDocuments: [
      'Parte amistoso de accidente o atestado policial',
      'Fotografías de los daños',
      'Datos del tercero implicado',
    ],
    responsibleTeam: 'Siniestros',
    serviceExpectation: 'Rosillo abre el expediente y confirma su número en un día laborable.',
    version: 'v1',
    approvedAt: '2026-01-20',
    approvedBy: 'Dirección de Siniestros',
  },
  {
    id: 'proc_solicitar_certificado',
    title: 'Cómo solicitar un certificado de seguro',
    topics: ['certificado', 'justificante', 'prueba de seguro', 'casero', 'arrendador', 'propietario'],
    steps: [
      'Indicar para qué se necesita el certificado y a nombre de quién debe emitirse.',
      'Confirmar la póliza y el periodo que debe acreditarse.',
      'Rosillo comprueba si el certificado estándar de la aseguradora es suficiente.',
      'Si se necesita un texto específico, el equipo lo solicita a la aseguradora.',
    ],
    requiredDocuments: ['Datos del destinatario del certificado'],
    responsibleTeam: 'Atención al cliente',
    serviceExpectation:
      'El certificado estándar suele estar disponible de inmediato; uno a medida puede requerir dos o tres días laborables.',
    version: 'v1',
    approvedAt: '2026-02-02',
    approvedBy: 'Dirección de Operaciones',
  },
  {
    id: 'proc_dar_de_baja',
    title: 'Cómo tramitar la baja de una póliza',
    topics: ['baja', 'anular', 'cancelar', 'dar de baja', 'no renovar'],
    steps: [
      'Confirmar la póliza concreta y el motivo de la baja.',
      'Comprobar el plazo de preaviso que exige la aseguradora y la fecha de efecto posible.',
      'Recoger la documentación acreditativa cuando la baja es por venta o siniestro total.',
      'Un empleado de Rosillo verifica los requisitos y tramita la baja con la aseguradora.',
    ],
    requiredDocuments: [
      'Solicitud firmada de baja',
      'Contrato de compraventa o baja en tráfico, si procede',
    ],
    responsibleTeam: 'Suplementos',
    serviceExpectation:
      'Rosillo confirma la fecha de efecto una vez la aseguradora acepta la solicitud. La baja nunca es automática.',
    version: 'v1',
    approvedAt: '2026-02-10',
    approvedBy: 'Dirección de Operaciones',
  },
  {
    id: 'proc_danos_por_agua',
    title: 'Qué hacer ante un daño por agua en el hogar',
    topics: ['agua', 'fuga', 'escape', 'humedad', 'inundación', 'hogar'],
    steps: [
      'Cerrar la llave de paso para detener la fuga.',
      'Fotografiar los daños antes de retirar o reparar nada.',
      'Comunicar el siniestro a Rosillo indicando la fecha y el origen del agua.',
      'Conservar las facturas de las reparaciones urgentes.',
      'Si hay daños a vecinos, indicarlo desde el principio.',
    ],
    requiredDocuments: [
      'Fotografías de los daños',
      'Factura de la reparación de la avería',
      'Datos del vecino afectado, si procede',
    ],
    responsibleTeam: 'Siniestros',
    serviceExpectation: 'La aseguradora suele asignar perito en 48-72 horas cuando la valoración lo requiere.',
    version: 'v1',
    approvedAt: '2026-03-05',
    approvedBy: 'Dirección de Siniestros',
  },
  {
    id: 'proc_recibo_devuelto',
    title: 'Qué ocurre cuando se devuelve un recibo',
    topics: ['recibo', 'devuelto', 'impago', 'domiciliación', 'cobro', 'pago'],
    steps: [
      'Comprobar el recibo devuelto y el periodo al que corresponde.',
      'Confirmar la cuenta bancaria en la que debe volver a presentarse.',
      'Rosillo solicita a la aseguradora la nueva presentación del recibo.',
      'Verificar que la póliza se mantiene en vigor durante el proceso.',
    ],
    requiredDocuments: ['Confirmación de la cuenta bancaria'],
    responsibleTeam: 'Atención al cliente',
    serviceExpectation: 'La nueva presentación suele realizarse en el siguiente ciclo de cobro.',
    version: 'v1',
    approvedAt: '2026-03-18',
    approvedBy: 'Dirección de Operaciones',
  },
  {
    id: 'proc_hablar_con_asesor',
    title: 'Cómo se traslada una consulta a un asesor de Rosillo',
    topics: ['hablar', 'asesor', 'persona', 'alguien', 'llamar', 'contactar', 'humano', 'agente'],
    steps: [
      'Recoger la consulta exacta del cliente y las pólizas relacionadas.',
      'Comprobar el canal de contacto preferido y el horario indicado.',
      'Crear la tarea en la cola del equipo correspondiente con el contexto completo.',
      'El asesor asignado revisa la consulta y contacta con el cliente.',
    ],
    requiredDocuments: [],
    responsibleTeam: 'Atención al cliente',
    serviceExpectation: 'Un asesor contacta dentro del siguiente día laborable.',
    version: 'v1',
    approvedAt: '2026-01-15',
    approvedBy: 'Dirección de Operaciones',
  },
  {
    id: 'proc_cambio_en_poliza',
    title: 'Cómo solicitar un cambio en una póliza',
    topics: ['cambio', 'modificar', 'añadir', 'conductor', 'dirección', 'beneficiario', 'suplemento'],
    steps: [
      'Identificar la póliza y el dato concreto que debe cambiar.',
      'Recoger la documentación acreditativa del cambio y la fecha de efecto deseada.',
      'Rosillo prepara el suplemento y lo remite a la aseguradora.',
      'El cambio surte efecto cuando la aseguradora lo confirma, no antes.',
    ],
    requiredDocuments: ['Documentación acreditativa del cambio solicitado'],
    responsibleTeam: 'Suplementos',
    serviceExpectation: 'La confirmación de la aseguradora suele llegar en dos a cinco días laborables.',
    version: 'v1',
    approvedAt: '2026-02-14',
    approvedBy: 'Dirección de Operaciones',
  },
  {
    id: 'proc_nuevo_riesgo',
    title: 'Cómo se prepara un presupuesto para un riesgo nuevo',
    topics: ['presupuesto', 'cotizar', 'cotización', 'contratar', 'nuevo', 'asegurar', 'precio'],
    steps: [
      'Recoger los datos del riesgo: qué es, dónde está y cómo se usa.',
      'Confirmar las coberturas que interesan al cliente y la fecha de efecto deseada.',
      'El equipo comercial consulta las compañías a través de los canales aprobados.',
      'El asesor presenta las opciones y explica las diferencias antes de contratar.',
    ],
    requiredDocuments: ['Datos identificativos del riesgo a asegurar'],
    responsibleTeam: 'Comercial',
    serviceExpectation: 'Las opciones se presentan normalmente en dos o tres días laborables.',
    version: 'v1',
    approvedAt: '2026-02-20',
    approvedBy: 'Dirección Comercial',
  },
  {
    id: 'proc_cambio_vital',
    title: 'Qué hacer cuando cambia una circunstancia personal o de la empresa',
    topics: [
      'mudanza', 'mudar', 'casarse', 'boda', 'hijo', 'hija', 'estudiar', 'extranjero',
      'viaje', 'comprar', 'vender', 'empresa', 'contratar personal', 'almacén', 'nave',
    ],
    steps: [
      'Anotar el cambio tal y como lo describe el cliente, sin interpretarlo.',
      'Identificar qué pólizas de la cartera podrían verse afectadas.',
      'Recoger los datos concretos del cambio: fechas, lugares, personas y valores.',
      'Crear una revisión para el asesor correspondiente, que decide qué procede.',
    ],
    requiredDocuments: [],
    responsibleTeam: 'Comercial',
    serviceExpectation:
      'Un asesor revisa las implicaciones y contacta con el cliente antes de proponer ningún cambio.',
    version: 'v1',
    approvedAt: '2026-03-25',
    approvedBy: 'Dirección Comercial',
  },
  {
    id: 'proc_revision_renovacion',
    title: 'Cómo pedir una revisión de la renovación',
    topics: ['renovación', 'renovar', 'subida', 'prima', 'revisión', 'alternativa'],
    steps: [
      'Identificar la póliza y el importe anterior y el nuevo.',
      'Recoger cualquier cambio conocido en el riesgo desde la última renovación.',
      'Crear una revisión para el equipo comercial con los datos aprobados.',
      'El asesor prepara alternativas y las comenta con el cliente.',
    ],
    requiredDocuments: ['Aviso de renovación recibido, si el cliente lo tiene'],
    responsibleTeam: 'Comercial',
    serviceExpectation:
      'Un asesor contacta antes de la fecha de renovación siempre que quede margen suficiente.',
    version: 'v1',
    approvedAt: '2026-04-01',
    approvedBy: 'Dirección Comercial',
  },
];

/**
 * Deterministic intent → procedure mapping.
 *
 * Keyword matching alone is not reliable enough to guarantee that a human-routed
 * answer is grounded, and an ungrounded procedural answer is exactly what the
 * evidence contract exists to prevent. This map ensures every intent the platform
 * routes to a human can always cite an approved procedure (knowledge tier C).
 */
export const PROCEDURE_FOR_INTENT: Record<string, string> = {
  CLAIM_START: 'proc_declarar_siniestro_auto',
  CLAIM_STATUS: 'proc_declarar_siniestro_auto',
  DOCUMENT_REQUEST: 'proc_solicitar_certificado',
  CANCELLATION_REQUEST: 'proc_dar_de_baja',
  PAYMENT_QUESTION: 'proc_recibo_devuelto',
  RENEWAL_REVIEW: 'proc_revision_renovacion',
  HUMAN_REQUEST: 'proc_hablar_con_asesor',
  POLICY_CHANGE: 'proc_cambio_en_poliza',
  QUOTE_REQUEST: 'proc_nuevo_riesgo',
  LIFE_EVENT: 'proc_cambio_vital',
  EMERGENCY: 'proc_declarar_siniestro_auto',
  UNKNOWN: 'proc_hablar_con_asesor',
};
