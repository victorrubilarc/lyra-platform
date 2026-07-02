/**
 * Catálogo de arranque de Órdenes de Trabajo (OT / PTW).
 * Valores REALISTAS alineados a la práctica de la industria (CMMS/EAM: SAP PM
 * order types, IBM Maximo work types, ISO 14224, minería/procesos). Todo es
 * configurable y editable desde la UI (mantenedor de catálogos); esto solo asegura
 * un punto de partida operable y profesional.
 */

/**
 * Flujo por defecto "OT — 4 puertas PTW" (fork W6): SE SIEMBRA COMO DATO
 * (WorkflowDefinition publicada), clonable y simplificable por el admin (una PYME
 * lo reduce a 1 puerta). S2 cablea el ejecutor + la PUERTA 1 (enviar → aprobar
 * [emite folio, firma Part 11] / rechazar [motivo obligatorio]); los estados y
 * transiciones de las Puertas 2–4 EXISTEN como dato desde ya, pero sus guards
 * (checklists/baseline/cierre) llegan en S3–S5.
 *
 * NOTA: la ANULACIÓN no es un estado del flujo — es el endpoint `cancel` con motivo
 * (lifecycle CANCELED), espejo exacto de Incidencias: el motor exige `fromStateId`
 * por transición, y "cancelar desde casi cualquier estado" se modela mejor como
 * acción transversal auditada (ver DECISIONS 2026-07-01 S2).
 */
export const WORK_ORDER_WORKFLOW = {
  key: "ot-4-puertas",
  name: "OT — 4 puertas PTW",
  description:
    "Ciclo de vida estándar de una orden de trabajo con permiso de trabajo: solicitud → aprobación (P1, emite folio) → preparación/checklists (P2) → planificación (P3) → ejecución → revisión y cierre (P4).",
  states: [
    { key: "borrador", name: "Borrador", order: 0, isInitial: true, isFinal: false, color: "#9AA3B8" },
    { key: "solicitada", name: "Solicitada", order: 1, isInitial: false, isFinal: false, color: "#6366F1" },
    { key: "aprobada", name: "Aprobada", order: 2, isInitial: false, isFinal: false, color: "#06B6D4" },
    { key: "en_preparacion", name: "En preparación", order: 3, isInitial: false, isFinal: false, color: "#EAB308" },
    { key: "checklists_ok", name: "Checklists OK", order: 4, isInitial: false, isFinal: false, color: "#84CC16" },
    { key: "en_planificacion", name: "En planificación", order: 5, isInitial: false, isFinal: false, color: "#EAB308" },
    { key: "plan_aprobado", name: "Plan aprobado", order: 6, isInitial: false, isFinal: false, color: "#06B6D4" },
    { key: "en_ejecucion", name: "En ejecución", order: 7, isInitial: false, isFinal: false, color: "#F97316" },
    { key: "en_revision_cierre", name: "En revisión de cierre", order: 8, isInitial: false, isFinal: false, color: "#84CC16" },
    { key: "cerrada", name: "Cerrada", order: 9, isInitial: false, isFinal: true, color: "#22C55E" },
    { key: "rechazada", name: "Rechazada", order: 10, isInitial: false, isFinal: true, color: "#EF4444" },
  ],
  transitions: [
    { key: "enviar", label: "Enviar solicitud", from: "borrador", to: "solicitada", requireSignature: false, signatureMeaning: null },
    // PUERTA 1: aprobar EMITE EL FOLIO (folioOnStateKey del tipo, default "aprobada") y exige firma.
    { key: "aprobar", label: "Aprobar solicitud", from: "solicitada", to: "aprobada", requireSignature: true, signatureMeaning: "Aprobación de la solicitud de trabajo (emisión de folio)" },
    { key: "rechazar", label: "Rechazar solicitud", from: "solicitada", to: "rechazada", requireSignature: false, signatureMeaning: null },
    { key: "preparar", label: "Iniciar preparación", from: "aprobada", to: "en_preparacion", requireSignature: false, signatureMeaning: null },
    // PUERTA 2 (guard de checklists en S3).
    { key: "revisar_checklists", label: "Aprobar checklists", from: "en_preparacion", to: "checklists_ok", requireSignature: true, signatureMeaning: "Revisión y aprobación de checklists / permisos de trabajo" },
    { key: "devolver", label: "Devolver a aprobada", from: "en_preparacion", to: "aprobada", requireSignature: false, signatureMeaning: null },
    { key: "planificar", label: "Iniciar planificación", from: "checklists_ok", to: "en_planificacion", requireSignature: false, signatureMeaning: null },
    // PUERTA 3 (congela baseline en S4; firma opcional por diseño — el admin la activa).
    { key: "autorizar_plan", label: "Autorizar plan", from: "en_planificacion", to: "plan_aprobado", requireSignature: false, signatureMeaning: null },
    { key: "devolver_plan", label: "Devolver plan", from: "en_planificacion", to: "en_preparacion", requireSignature: false, signatureMeaning: null },
    { key: "ejecutar", label: "Iniciar ejecución", from: "plan_aprobado", to: "en_ejecucion", requireSignature: false, signatureMeaning: null },
    { key: "solicitar_cierre", label: "Solicitar cierre", from: "en_ejecucion", to: "en_revision_cierre", requireSignature: false, signatureMeaning: null },
    // PUERTA 4 (guards de cierre en S5).
    { key: "cerrar", label: "Cerrar OT", from: "en_revision_cierre", to: "cerrada", requireSignature: true, signatureMeaning: "Cierre de la orden de trabajo" },
    { key: "reabrir", label: "Volver a ejecución", from: "en_revision_cierre", to: "en_ejecucion", requireSignature: false, signatureMeaning: null },
  ],
} as const;

export interface WorkOrderTypeSeed {
  key: string;
  name: string;
  description: string;
  color: string;
  requiresPtwDefault: boolean;
  criticalityDefault: number | null;
  sortOrder: number;
}

export interface WorkOrderTagSeed {
  key: string;
  name: string;
  description: string;
  color: string;
  sortOrder: number;
}

/**
 * TIPOS de OT — equivalentes a los "order types" de SAP PM (PM01 correctiva,
 * PM02 planificada, PM03 preventiva, refurbishment) y los "work types" de Maximo
 * (CM correctivo, PM preventivo, EM emergencia, CAL calibración).
 */
export const WORK_ORDER_TYPES: WorkOrderTypeSeed[] = [
  { key: "correctiva", name: "Correctiva", description: "Reparación de una falla o avería detectada (SAP PM01 / Maximo CM).", color: "#F97316", requiresPtwDefault: false, criticalityDefault: 3, sortOrder: 10 },
  { key: "correctiva-emergencia", name: "Correctiva de emergencia", description: "Avería con detención no programada; requiere atención inmediata (Maximo EM).", color: "#EF4444", requiresPtwDefault: false, criticalityDefault: 5, sortOrder: 20 },
  { key: "preventiva", name: "Preventiva", description: "Mantenimiento programado por frecuencia o uso según plan (SAP PM02 / Maximo PM).", color: "#22C55E", requiresPtwDefault: false, criticalityDefault: 2, sortOrder: 30 },
  { key: "predictiva", name: "Predictiva (basada en condición)", description: "Intervención gatillada por condición monitoreada (vibración, termografía, aceite) — RCM/PdM.", color: "#06B6D4", requiresPtwDefault: false, criticalityDefault: 2, sortOrder: 40 },
  { key: "inspeccion", name: "Inspección", description: "Inspección o monitoreo de condición sin intervención mayor (rutas, checklists).", color: "#06B6D4", requiresPtwDefault: false, criticalityDefault: 2, sortOrder: 50 },
  { key: "lubricacion", name: "Lubricación", description: "Rutas de lubricación y engrase programado.", color: "#84CC16", requiresPtwDefault: false, criticalityDefault: 1, sortOrder: 60 },
  { key: "calibracion", name: "Calibración", description: "Calibración y verificación de instrumentos y lazos de control (Maximo CAL).", color: "#06B6D4", requiresPtwDefault: false, criticalityDefault: 2, sortOrder: 70 },
  { key: "overhaul", name: "Mantención mayor / Overhaul", description: "Detención mayor programada: reacondicionamiento o reemplazo de componentes (SAP refurbishment).", color: "#6366F1", requiresPtwDefault: true, criticalityDefault: 3, sortOrder: 80 },
  { key: "mejora", name: "Mejora / Proyecto", description: "Modificación o mejora de un activo o instalación (gestión del cambio / MOC).", color: "#6366F1", requiresPtwDefault: false, criticalityDefault: 2, sortOrder: 90 },
  { key: "ptw-alto-riesgo", name: "Permiso de Alto Riesgo (PTW)", description: "Trabajo con permiso: bloqueo de energías (LOTO), altura, espacio confinado, trabajo en caliente.", color: "#EF4444", requiresPtwDefault: true, criticalityDefault: 4, sortOrder: 100 },
];

/**
 * ESPECIALIDADES / disciplinas — equivalentes a los "crafts" de Maximo y los
 * "work centers" de SAP PM (cuadrillas por oficio).
 */
export const WORK_ORDER_SPECIALTIES: WorkOrderTagSeed[] = [
  { key: "mecanica", name: "Mecánica", description: "Mantenimiento mecánico general.", color: "#6366F1", sortOrder: 10 },
  { key: "electrica", name: "Eléctrica", description: "Media y baja tensión, motores, tableros.", color: "#EAB308", sortOrder: 20 },
  { key: "instrumentacion", name: "Instrumentación y control", description: "Instrumentos de campo, transmisores, lazos de control.", color: "#06B6D4", sortOrder: 30 },
  { key: "automatizacion", name: "Automatización (PLC/DCS)", description: "PLC, DCS, SCADA y redes industriales.", color: "#6366F1", sortOrder: 40 },
  { key: "soldadura", name: "Soldadura y calderería", description: "Soldadura, calderería y estructuras metálicas.", color: "#F97316", sortOrder: 50 },
  { key: "hidraulica", name: "Hidráulica", description: "Sistemas y componentes hidráulicos.", color: "#22C55E", sortOrder: 60 },
  { key: "neumatica", name: "Neumática", description: "Aire comprimido y actuadores neumáticos.", color: "#22C55E", sortOrder: 70 },
  { key: "lubricacion", name: "Lubricación", description: "Lubricación, engrase y análisis de aceite.", color: "#84CC16", sortOrder: 80 },
  { key: "refrigeracion", name: "Refrigeración y climatización (HVAC)", description: "Refrigeración industrial y climatización.", color: "#06B6D4", sortOrder: 90 },
  { key: "piping", name: "Cañerías / Piping", description: "Cañerías de proceso, fittings y válvulas.", color: "#6B7280", sortOrder: 100 },
  { key: "estructuras", name: "Estructuras y obras civiles", description: "Estructuras, hormigón y obras civiles.", color: "#84CC16", sortOrder: 110 },
  { key: "izaje", name: "Izaje y aparejo (rigging)", description: "Maniobras de izaje, grúas y aparejos.", color: "#F97316", sortOrder: 120 },
  { key: "pintura", name: "Pintura y anticorrosión", description: "Preparación de superficie, pintura y protección anticorrosiva.", color: "#EAB308", sortOrder: 130 },
];

/**
 * Checklists / PTW de arranque (Sesión 3 — Puerta 2 = AUTORIZACIÓN del permiso).
 * Cada checklist ES una plantilla del Form Builder (fork W5). La Puerta 2 es el momento
 * de AUTORIZAR el permiso ANTES de ejecutar (documental: peligros, plan de aislación,
 * personal competente) — NO la aplicación física de controles (poner candados, energía
 * cero, toma-5), que es de EJECUCIÓN por actividad (S4/S5, ligada a `WorkActivity`).
 * Por eso las preguntas están redactadas en modo AUTORIZACIÓN, no de aplicación.
 * Campos OPTATIVOS (el revisor marca la sección completa y sella sin fricción en la demo).
 * Ver DECISIONS 2026-07-02 (realineación PTW al estándar).
 */
export interface ChecklistSeedField {
  key: string;
  type: "BOOLEAN" | "TEXTAREA";
  dataType: "BOOLEAN" | "STRING";
  label: string;
  order: number;
}
export interface ChecklistTemplateSeed {
  name: string;
  description: string;
  sectionKey: string;
  sectionTitle: string;
  fields: ChecklistSeedField[];
}
export interface ChecklistRuleSeed {
  name: string;
  templateName: string; // enlaza con la plantilla sembrada por nombre
  mandatory: boolean;
  appliesToTypeKeys: string[]; // vacío = todos los tipos
  requiresPtw: boolean | null;
  sortOrder: number;
}

export const WORK_ORDER_CHECKLIST_TEMPLATES: ChecklistTemplateSeed[] = [
  {
    name: "Permiso de Trabajo — Aislación de energías (LOTO)",
    description:
      "AUTORIZACIÓN del permiso de aislación de energías peligrosas (LOTO) ANTES de ejecutar: peligros, plan de aislación, personal competente. La aplicación física (candados, energía cero) se registra al EJECUTAR, por actividad.",
    sectionKey: "autorizacion_loto",
    sectionTitle: "Autorización del permiso (aislación de energías)",
    fields: [
      { key: "fuentes_identificadas", type: "BOOLEAN", dataType: "BOOLEAN", label: "¿Se identificaron todas las fuentes de energía peligrosa a aislar?", order: 10 },
      { key: "procedimiento_definido", type: "BOOLEAN", dataType: "BOOLEAN", label: "¿Se definió el procedimiento y los puntos de bloqueo/aislación?", order: 20 },
      { key: "personal_competente", type: "BOOLEAN", dataType: "BOOLEAN", label: "¿El personal asignado está autorizado y es competente para el bloqueo?", order: 30 },
      { key: "coordinacion_operaciones", type: "BOOLEAN", dataType: "BOOLEAN", label: "¿Se coordinó la liberación/detención del equipo con Operaciones?", order: 40 },
      { key: "peligros_controles", type: "TEXTAREA", dataType: "STRING", label: "Peligros identificados y controles requeridos", order: 50 },
    ],
  },
];

export const WORK_ORDER_CHECKLIST_RULES: ChecklistRuleSeed[] = [
  {
    name: "Permiso obligatorio — Aislación de energías (LOTO)",
    templateName: "Permiso de Trabajo — Aislación de energías (LOTO)",
    mandatory: true,
    appliesToTypeKeys: [], // transversal: aplica a toda OT que llegue a preparación
    requiresPtw: null,
    sortOrder: 10,
  },
];

/**
 * Nombres del demo LEGADO de S3 (redactado en modo "aplicación física", incorrecto para
 * la Puerta 2 de AUTORIZACIÓN). Se retiran al re-sembrar (regla desactivada, plantilla
 * archivada) para no sugerir dos veces; no se borran (una OT en curso puede referenciarlos).
 */
export const LEGACY_CHECKLIST_TEMPLATE_NAME = "Checklist PTW — Bloqueo de energías (LOTO)";
export const LEGACY_CHECKLIST_RULE_NAME = "PTW obligatorio — Bloqueo de energías (LOTO)";
