/**
 * Catálogo de arranque de Órdenes de Trabajo (OT / PTW).
 * Valores REALISTAS alineados a la práctica de la industria (CMMS/EAM: SAP PM
 * order types, IBM Maximo work types, ISO 14224, minería/procesos). Todo es
 * configurable y editable desde la UI (mantenedor de catálogos); esto solo asegura
 * un punto de partida operable y profesional.
 */

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
 * ÁREAS funcionales / zonas de planta (minería-procesos). Es un eje de
 * CLASIFICACIÓN/enrutamiento, NO reemplaza al nodo de la estructura (ubicación+ABAC).
 */
export const WORK_ORDER_AREAS: WorkOrderTagSeed[] = [
  { key: "mina-rajo", name: "Mina / Rajo", description: "Operación mina: perforación, tronadura, carguío y transporte.", color: "#F97316", sortOrder: 10 },
  { key: "chancado", name: "Chancado", description: "Chancado primario, secundario y terciario.", color: "#EAB308", sortOrder: 20 },
  { key: "molienda", name: "Molienda", description: "Molinos SAG/bolas y clasificación.", color: "#06B6D4", sortOrder: 30 },
  { key: "flotacion", name: "Flotación", description: "Celdas de flotación y reactivos.", color: "#06B6D4", sortOrder: 40 },
  { key: "espesamiento", name: "Espesamiento y relaves", description: "Espesadores, manejo y disposición de relaves.", color: "#6B7280", sortOrder: 50 },
  { key: "correas", name: "Correas transportadoras", description: "Sistema de correas y transferencias.", color: "#EAB308", sortOrder: 60 },
  { key: "servicios", name: "Servicios / Utilidades", description: "Agua, aire comprimido, energía y combustibles.", color: "#22C55E", sortOrder: 70 },
  { key: "puerto", name: "Puerto / Embarque", description: "Almacenamiento y embarque de producto.", color: "#06B6D4", sortOrder: 80 },
  { key: "procesos", name: "Planta de procesos", description: "Áreas de proceso no clasificadas en otra zona.", color: "#6366F1", sortOrder: 90 },
  { key: "taller", name: "Taller de mantención", description: "Talleres y maestranza.", color: "#6366F1", sortOrder: 100 },
  { key: "civil", name: "Obras civiles", description: "Estructuras, caminos y obras civiles.", color: "#84CC16", sortOrder: 110 },
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
 * Claves de ÁREAS del set inicial antiguo (S1) que ahora son DISCIPLINAS
 * (especialidades), no zonas de planta. Se retiran del catálogo de áreas en el
 * seed SOLO si ninguna OT las referencia (arranque/dev). Ver seed.ts.
 */
export const RETIRED_AREA_KEYS = ["mecanica", "electrica"];
