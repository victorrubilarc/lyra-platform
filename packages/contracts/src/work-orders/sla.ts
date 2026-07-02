import { z } from "zod";
import type { WorkOrderLifecycle } from "./work-orders.js";

/**
 * Helpers PUROS de SLA / plazos / semáforos de la Orden de Trabajo (OT S6).
 * ESPEJO de `incidents/incidents.ts` (Fase 4.4), con dos matices propios de la OT:
 *  - El `dueAt` se ancla AL APROBAR / emitir folio (no al crear la solicitud): la OT
 *    tiene una fase de solicitud previa y una solicitud en borrador no puede estar
 *    "vencida". Ver DECISIONS 2026-07-02 OT S6.
 *  - Se agrega el SEMÁFORO derivado (`workOrderTrafficLight`) que consume la grilla y
 *    el detalle: 🔴 vencida / 🟡 por vencer / 🟢 en plazo / gris sin plazo.
 *
 * Sin fechas mágicas ni acceso a I/O: todo recibe `nowMs` explícito (testeable y
 * determinista, igual que los helpers de incidencias).
 */

/**
 * Auto-fija el plazo de resolución a partir de un ANCLA (en OT = el instante de
 * aprobación/emisión de folio) y el SLA del tipo. Devuelve `null` si el tipo no
 * declara `resolutionDueMinutes` (sin plazo automático). El override explícito del
 * usuario tiene prioridad y se aplica FUERA de este helper.
 */
export function workOrderDueFromType(anchorMs: number, resolutionDueMinutes: number | null | undefined): Date | null {
  if (resolutionDueMinutes == null || resolutionDueMinutes <= 0) return null;
  return new Date(anchorMs + resolutionDueMinutes * 60_000);
}

/** ¿El PLAZO de resolución está vencido? (OT abierta + dueAt en el pasado). */
export function isWorkOrderOverdue(dueAt: Date | null | undefined, lifecycle: WorkOrderLifecycle, nowMs: number): boolean {
  return lifecycle === "OPEN" && dueAt != null && dueAt.getTime() < nowMs;
}

/**
 * Umbral de ESCALAMIENTO de nivel 1: momento a partir del cual el aviso de plazo
 * también va al rol de escalamiento. Devuelve `null` si falta `dueAt` o el tipo no
 * configura `escalationAfterMinutes` (sin escalamiento).
 *
 * Nombres prefijados `workOrder*` para no colisionar con los helpers homólogos de
 * Incidencias en el barrel plano de `@lyra/contracts` (misma matemática, otro dominio).
 */
export function workOrderEscalationThreshold(dueAt: Date | null | undefined, escalationAfterMinutes: number | null | undefined): Date | null {
  if (!dueAt || escalationAfterMinutes == null || escalationAfterMinutes <= 0) return null;
  return new Date(dueAt.getTime() + escalationAfterMinutes * 60_000);
}

/** ¿Corresponde escalar (nivel 1) el aviso de plazo de esta OT AHORA? */
export function workOrderShouldEscalate(
  dueAt: Date | null | undefined,
  escalationAfterMinutes: number | null | undefined,
  nowMs: number,
): boolean {
  const threshold = workOrderEscalationThreshold(dueAt, escalationAfterMinutes);
  return threshold != null && threshold.getTime() <= nowMs;
}

/**
 * Ventana por defecto de "por vencer" (🟡): una OT abierta con `dueAt` dentro de las
 * próximas `AT_RISK_WINDOW_MINUTES` (48 h) entra en riesgo. Es una CONSTANTE de
 * presentación (no gobernanza fina): el semáforo es una ayuda visual, no un SLA duro.
 */
export const AT_RISK_WINDOW_MINUTES = 48 * 60;

/** Estado del semáforo de plazo de una OT. */
export const WORK_ORDER_TRAFFIC_LIGHTS = ["red", "amber", "green", "none"] as const;
export const workOrderTrafficLightSchema = z.enum(WORK_ORDER_TRAFFIC_LIGHTS);
export type WorkOrderTrafficLight = (typeof WORK_ORDER_TRAFFIC_LIGHTS)[number];

/** Entrada mínima para derivar el semáforo (todo lo que la grilla ya trae + 1 flag). */
export interface WorkOrderTrafficLightInput {
  dueAt: Date | null | undefined;
  lifecycle: WorkOrderLifecycle;
  /** ¿Tiene al menos una actividad del plan vencida (baseline/planned pasada, no cerrada)? */
  hasOverdueActivity?: boolean;
}

/**
 * SEMÁFORO de PLAZO (derivado, sin cron). Ortogonal a `stalled` (permanencia de
 * estado), que se muestra como indicador aparte (fiel a la desambiguación §21 de
 * Incidencias). Reglas:
 *  - 🔴 red   → OT abierta y (dueAt vencido O una actividad vencida).
 *  - 🟡 amber → OT abierta, dueAt dentro de la ventana de riesgo (aún no vencido).
 *  - 🟢 green → OT abierta con dueAt en el futuro fuera de la ventana.
 *  - ⚪ none  → cerrada/anulada, o sin dueAt y sin actividad vencida (sin plazo que vigilar).
 */
export function workOrderTrafficLight(
  input: WorkOrderTrafficLightInput,
  nowMs: number,
  atRiskWindowMinutes: number = AT_RISK_WINDOW_MINUTES,
): WorkOrderTrafficLight {
  if (input.lifecycle !== "OPEN") return "none";
  const overdue = input.dueAt != null && input.dueAt.getTime() < nowMs;
  if (overdue || input.hasOverdueActivity) return "red";
  if (input.dueAt == null) return "none";
  const riskFrom = input.dueAt.getTime() - atRiskWindowMinutes * 60_000;
  if (riskFrom <= nowMs) return "amber";
  return "green";
}

/** ¿La actividad está vencida? (fin planificado/baseline pasado y no cerrada). Puro. */
export function isActivityOverdue(
  activity: { baselineEnd?: Date | null; plannedEnd?: Date | null; status: string },
  nowMs: number,
): boolean {
  if (activity.status === "DONE" || activity.status === "CANCELED") return false;
  const end = activity.baselineEnd ?? activity.plannedEnd;
  return end != null && end.getTime() < nowMs;
}
