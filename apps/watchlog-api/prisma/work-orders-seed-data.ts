/**
 * Catálogo de arranque de Órdenes de Trabajo (OT / PTW) — Sesión 1: CIMIENTOS.
 * Todo es configurable desde la UI; esto solo asegura un punto de partida operable
 * (tipos de OT + áreas + especialidades). El flujo de 4 puertas, el folio y las
 * reglas de checklist llegan en S2+.
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

export const WORK_ORDER_TYPES: WorkOrderTypeSeed[] = [
  { key: "correctiva", name: "Correctiva", description: "Reparación de una falla o avería.", color: "#F97316", requiresPtwDefault: false, criticalityDefault: 3, sortOrder: 10 },
  { key: "preventiva", name: "Preventiva", description: "Mantenimiento programado según plan.", color: "#22C55E", requiresPtwDefault: false, criticalityDefault: 2, sortOrder: 20 },
  { key: "predictiva", name: "Predictiva", description: "Intervención por condición monitoreada (RCM).", color: "#06B6D4", requiresPtwDefault: false, criticalityDefault: 2, sortOrder: 30 },
  { key: "mejora", name: "Mejora / Proyecto", description: "Modificación o mejora de un activo o instalación.", color: "#6366F1", requiresPtwDefault: false, criticalityDefault: 2, sortOrder: 40 },
  { key: "ptw-alto-riesgo", name: "Permiso de Alto Riesgo (PTW)", description: "Trabajo con permiso: LOTO, altura, espacio confinado, trabajo en caliente.", color: "#EF4444", requiresPtwDefault: true, criticalityDefault: 4, sortOrder: 50 },
];

export const WORK_ORDER_AREAS: WorkOrderTagSeed[] = [
  { key: "mecanica", name: "Mecánica", description: "Área mecánica.", color: "#6366F1", sortOrder: 10 },
  { key: "electrica", name: "Eléctrica", description: "Área eléctrica.", color: "#EAB308", sortOrder: 20 },
  { key: "civil", name: "Obras civiles", description: "Estructuras y obras civiles.", color: "#84CC16", sortOrder: 30 },
  { key: "procesos", name: "Procesos", description: "Área de procesos / producción.", color: "#06B6D4", sortOrder: 40 },
];

export const WORK_ORDER_SPECIALTIES: WorkOrderTagSeed[] = [
  { key: "mecanica", name: "Mecánica", description: "Disciplina mecánica.", color: "#6366F1", sortOrder: 10 },
  { key: "electrica", name: "Eléctrica", description: "Disciplina eléctrica.", color: "#EAB308", sortOrder: 20 },
  { key: "instrumentacion", name: "Instrumentación", description: "Instrumentación y control.", color: "#06B6D4", sortOrder: 30 },
  { key: "soldadura", name: "Soldadura", description: "Soldadura y calderería.", color: "#F97316", sortOrder: 40 },
  { key: "hidraulica", name: "Hidráulica", description: "Sistemas hidráulicos.", color: "#22C55E", sortOrder: 50 },
];
