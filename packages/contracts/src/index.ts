/**
 * @lyra/contracts — contratos compartidos entre el backend (NestJS) y el
 * frontend (React). Tipos y esquemas Zod que viajan por la API viven aquí,
 * de modo que ambos lados hablan exactamente el mismo idioma.
 */

export const WATCHLOG_CONTRACTS_VERSION = "0.0.0";

export * from "./health.js";

// Seguridad (Fase 1)
export * from "./security/permissions.js";
export * from "./security/auth.js";
export * from "./security/users.js";
export * from "./security/roles.js";
export * from "./security/audit.js";

// Estructura organizacional (Fase 1)
export * from "./structure/org.js";
export * from "./structure/equipment.js";

// Plantillas / Form Builder (Fase 2.1)
export * from "./templates/field-types.js";
export * from "./templates/templates.js";

// Flujos reutilizables (Fase 2.2)
export * from "./workflows/workflows.js";

// Motor de reglas de negocio: expresión segura + formulados + validación cruzada (Req-7)
export * from "./rules/expression.js";
export * from "./rules/rules.js";

// Datos de referencia / Listas (Fase 2.x)
export * from "./reference-data/reference-data.js";

// Utilidades de fecha compartidas (eje turno + eje período)
export * from "./shared/date-utils.js";
export * from "./shared/folio.js";

// Calendario operacional (turnos + día operacional) (Fase 2.3.0)
export * from "./operational-calendar/operational-calendar.js";

// Calendario FISCAL (período contable transversal) (Fase 2.7.1.1)
export * from "./fiscal-calendar/fiscal-calendar.js";

// Período contable gobernado (generación/cierre/lock) (Fase 2.7.1 → 2.7.1.1)
export * from "./operational-periods/operational-periods.js";

// Llenado de bitácoras / ejecución (Fase 2.4)
export * from "./log-entries/log-entries.js";

// Configuración del sistema (Fase 2.7.1.1 UX)
export * from "./system-settings/system-settings.js";

// Vistas guardadas de plataforma (Fase 2.8.1b)
export * from "./saved-views/saved-views.js";

// Programación de rondas: horarios + ocurrencias (Fase 2.3)
export * from "./schedules/schedules.js";

// Notificaciones: motor de avisos por correo (Bloque N)
export * from "./notifications/events.js";
export * from "./notifications/render.js";
export * from "./notifications/notifications.js";
export * from "./notifications/email-config.js";

// Incidencias operacionales / HSE (Fase 4.0)
export * from "./incidents/incidents.js";

// Excepciones operacionales desde bitácoras (Fase 4.1)
export * from "./incidents/exceptions.js";

// Acciones CAPA de incidencias (Fase 4.2a)
export * from "./incidents/actions.js";

// Investigación de causa raíz de incidencias (Fase 4.2b)
export * from "./incidents/investigation.js";

// Reportabilidad configurable de incidencias (Fase 4.3)
export * from "./incidents/reporting.js";

// Dashboard de incidencias (Fase 4.5)
export * from "./incidents/dashboard.js";

// Vista ejecutiva cross-estructura (L3 — UX premium)
export * from "./incidents/cross-dashboard.js";

// Cambio de turno / Shift Handover (Fase 5 — Slice 1)
export * from "./shift-handover/shift-handover.js";

// Inteligencia Artificial administrable (Fase 5 — Slice 2)
export * from "./ai/ai.js";

// Sistema de TEMAS / PALETAS administrable (EST-TEMAS)
export * from "./theme/contrast.js";
export * from "./theme/palette.js";
export * from "./theme/presets.js";

// Órdenes de Trabajo / Work Orders (OT / PTW) — S1 cimientos + S2 Puerta 1 + S3 Puerta 2
export * from "./work-orders/folio.js";
export * from "./work-orders/work-orders.js";
export * from "./work-orders/checklists.js";
export * from "./work-orders/activities.js";
export * from "./work-orders/sla.js";
