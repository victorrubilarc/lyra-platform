/**
 * Datos semilla de Incidencias (Fase 4.0). Catálogos CONFIGURABLES (el cliente los
 * edita); aquí solo el set inicial razonable + un flujo de incidencias por defecto
 * (`incidencia-operacional`) que reutiliza `WorkflowDefinition`. Idempotente en seed.
 */

export const INCIDENT_WORKFLOW = {
  key: "incidencia-operacional",
  name: "Incidencia operacional (estándar)",
  description: "Ciclo de vida estándar de una incidencia: reporte → triage → asignación → progreso → verificación → cierre.",
  states: [
    { key: "reportada", name: "Reportada", order: 0, isInitial: true, isFinal: false, color: "#6366F1" },
    { key: "en_triage", name: "En triage", order: 1, isInitial: false, isFinal: false, color: "#06B6D4" },
    { key: "asignada", name: "Asignada", order: 2, isInitial: false, isFinal: false, color: "#EAB308" },
    { key: "en_progreso", name: "En progreso", order: 3, isInitial: false, isFinal: false, color: "#F97316" },
    { key: "en_verificacion", name: "En verificación", order: 4, isInitial: false, isFinal: false, color: "#84CC16" },
    { key: "cerrada", name: "Cerrada", order: 5, isInitial: false, isFinal: true, color: "#22C55E" },
  ],
  transitions: [
    { key: "a_triage", label: "Enviar a triage", from: "reportada", to: "en_triage" },
    { key: "asignar", label: "Asignar", from: "en_triage", to: "asignada" },
    { key: "iniciar", label: "Iniciar atención", from: "asignada", to: "en_progreso" },
    { key: "a_verificacion", label: "Enviar a verificación", from: "en_progreso", to: "en_verificacion" },
    { key: "cerrar", label: "Cerrar incidencia", from: "en_verificacion", to: "cerrada" },
    { key: "reabrir_tarea", label: "Volver a trabajo", from: "en_verificacion", to: "en_progreso" },
  ],
} as const;

export interface IncidentTypeSeed {
  key: string;
  name: string;
  description: string;
  color: string;
  requiresInvestigation: boolean;
  requiresCapa: boolean;
  reportableDefault: boolean;
  sortOrder: number;
}

export const INCIDENT_TYPES: IncidentTypeSeed[] = [
  { key: "seguridad", name: "Seguridad", description: "Eventos de seguridad: accidentes, cuasi-accidentes, condiciones/actos inseguros.", color: "#EF4444", requiresInvestigation: true, requiresCapa: true, reportableDefault: true, sortOrder: 0 },
  { key: "salud-ocupacional", name: "Salud ocupacional", description: "Exposición a agentes, ergonomía, fatiga, enfermedad profesional.", color: "#F97316", requiresInvestigation: true, requiresCapa: true, reportableDefault: false, sortOrder: 1 },
  { key: "medio-ambiente", name: "Medio ambiente", description: "Derrames, emisiones, residuos, incumplimientos ambientales.", color: "#22C55E", requiresInvestigation: true, requiresCapa: true, reportableDefault: true, sortOrder: 2 },
  { key: "operacional", name: "Operacional", description: "Desviación de proceso, detención no planificada, pérdida de producción.", color: "#06B6D4", requiresInvestigation: false, requiresCapa: false, reportableDefault: false, sortOrder: 3 },
  { key: "mantenimiento", name: "Mantenimiento", description: "Falla de equipo, fuga, vibración, temperatura anómala, daño a componente.", color: "#EAB308", requiresInvestigation: false, requiresCapa: false, reportableDefault: false, sortOrder: 4 },
  { key: "calidad", name: "Calidad", description: "Producto/medición fuera de especificación, no conformidad.", color: "#A855F7", requiresInvestigation: false, requiresCapa: true, reportableDefault: false, sortOrder: 5 },
  { key: "geomecanica", name: "Geomecánica", description: "Caída de roca, grieta, deformación, inestabilidad, fortificación deficiente.", color: "#F59E0B", requiresInvestigation: true, requiresCapa: true, reportableDefault: true, sortOrder: 6 },
  { key: "energia-electrica", name: "Energía / eléctrica", description: "Exposición a energía, fallas eléctricas, continuidad energética.", color: "#6366F1", requiresInvestigation: false, requiresCapa: false, reportableDefault: false, sortOrder: 7 },
  { key: "tecnologia-operacional", name: "Tecnología operacional", description: "Sensor/PLC/SCADA/telemetría/red industrial fuera de servicio.", color: "#06B6D4", requiresInvestigation: false, requiresCapa: false, reportableDefault: false, sortOrder: 8 },
  { key: "cumplimiento", name: "Cumplimiento", description: "Procedimiento no seguido, permiso/documentación/firma faltante, inspección vencida.", color: "#9AA3B8", requiresInvestigation: false, requiresCapa: true, reportableDefault: false, sortOrder: 9 },
  { key: "infraestructura", name: "Infraestructura", description: "Daño o falla de infraestructura física.", color: "#84CC16", requiresInvestigation: false, requiresCapa: false, reportableDefault: false, sortOrder: 10 },
  { key: "proveedor-contratista", name: "Proveedor / contratista", description: "Eventos atribuibles a empresas contratistas o proveedores.", color: "#F97316", requiresInvestigation: false, requiresCapa: false, reportableDefault: false, sortOrder: 11 },
  { key: "otro", name: "Otro", description: "Sin clasificación específica.", color: "#6B7280", requiresInvestigation: false, requiresCapa: false, reportableDefault: false, sortOrder: 12 },
];

export interface IncidentCategorySeed {
  key: string;
  name: string;
  typeKey: string | null;
  sortOrder: number;
}

// --- Reportabilidad (Fase 4.3) -----------------------------------------------
// Obligaciones de reporte de EJEMPLO, genéricas y transversales. El cliente las
// edita/crea desde la UI; los marcos regulatorios concretos por vertical (DS 132,
// SERNAGEOMIN, ISO 14001, etc.) son CONFIGURACIÓN, NUNCA lógica. `appliesToTypeKeys`
// se resuelve a ids en el seed; vacío = aplica a TODOS los tipos.
export interface ReportingObligationSeed {
  key: string;
  name: string;
  description: string;
  authorityName: string;
  defaultDueMinutes: number | null;
  appliesToTypeKeys: string[];
  minSeverity: number | null;
  mandatory: boolean;
  sortOrder: number;
}

export const REPORTING_OBLIGATIONS: ReportingObligationSeed[] = [
  {
    key: "reporte-autoridad-grave",
    name: "Reporte a la autoridad — evento grave (ejemplo)",
    description: "Notificación a la autoridad competente para eventos de alta severidad. Plantilla de ejemplo: ajústela a su marco regulatorio.",
    authorityName: "Autoridad competente",
    defaultDueMinutes: 1440, // 24 h
    appliesToTypeKeys: [],
    minSeverity: 4,
    mandatory: true,
    sortOrder: 0,
  },
  {
    key: "notificacion-corporativa-ambiental",
    name: "Notificación corporativa ambiental (ejemplo)",
    description: "Aviso interno corporativo para eventos ambientales. Plantilla de ejemplo, no obligatoria.",
    authorityName: "Gerencia de Medio Ambiente",
    defaultDueMinutes: 720, // 12 h
    appliesToTypeKeys: ["medio-ambiente"],
    minSeverity: null,
    mandatory: false,
    sortOrder: 1,
  },
];

export const INCIDENT_CATEGORIES: IncidentCategorySeed[] = [
  { key: "seg-accidente-ctp", name: "Accidente con tiempo perdido (CTP)", typeKey: "seguridad", sortOrder: 0 },
  { key: "seg-accidente-stp", name: "Accidente sin tiempo perdido (STP)", typeKey: "seguridad", sortOrder: 1 },
  { key: "seg-cuasi-accidente", name: "Cuasi accidente / near miss", typeKey: "seguridad", sortOrder: 2 },
  { key: "seg-condicion-insegura", name: "Condición insegura", typeKey: "seguridad", sortOrder: 3 },
  { key: "seg-acto-inseguro", name: "Acto inseguro", typeKey: "seguridad", sortOrder: 4 },
  { key: "amb-derrame", name: "Derrame", typeKey: "medio-ambiente", sortOrder: 0 },
  { key: "amb-emision", name: "Emisión", typeKey: "medio-ambiente", sortOrder: 1 },
  { key: "amb-residuo", name: "Residuo", typeKey: "medio-ambiente", sortOrder: 2 },
  { key: "mnt-falla-equipo", name: "Falla de equipo", typeKey: "mantenimiento", sortOrder: 0 },
  { key: "mnt-fuga", name: "Fuga", typeKey: "mantenimiento", sortOrder: 1 },
  { key: "mnt-vibracion", name: "Vibración / temperatura anómala", typeKey: "mantenimiento", sortOrder: 2 },
  { key: "ope-desviacion-proceso", name: "Desviación de proceso", typeKey: "operacional", sortOrder: 0 },
  { key: "ope-detencion", name: "Detención no planificada", typeKey: "operacional", sortOrder: 1 },
];
