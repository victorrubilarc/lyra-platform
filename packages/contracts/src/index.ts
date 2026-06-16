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
