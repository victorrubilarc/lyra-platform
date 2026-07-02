import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** Una orden de aviso a encolar (evento + payload mínimo + clave de dedupe). */
export interface WorkOrderBreachEmit {
  eventKey: string;
  payload: Prisma.InputJsonValue;
  dedupeKey: string;
}

/**
 * DETECCIÓN de vencimientos de ÓRDENES DE TRABAJO (OT S6) — "vigía digital". ESPEJO
 * de `IncidentSlaService` (Fase 4.4). Vive en el módulo de OT (dominio); el TICK lo
 * ejecuta el sweeper del worker de notificaciones (única infra de cron del proyecto),
 * que llama a `findBreaches()` y emite cada orden por el motor del Bloque N. Es
 * solo-lectura y solo-Prisma (la resolución de destinatarios + ABAC ocurre después,
 * en el resolver).
 *
 * Tres conceptos, todos sobre OT ABIERTAS (desambiguados como en Incidencias §21):
 *  - `workorder.overdue`          → PLAZO de resolución vencido (dueAt < ahora).
 *  - `workorder.stalled`          → PERMANENCIA de estado excedida (maxStayMinutes).
 *  - `workorder.activity.overdue` → actividad del plan vencida (baseline/planificado).
 *
 * Dedupe: la permanencia se avisa UNA vez por ocupación de estado (clave con
 * `currentStateSince`, igual que `incident.sla.breached`); el plazo / la actividad se
 * RE-AVISAN a diario (clave con el día) — recordatorio recurrente del SLA light.
 */
@Injectable()
export class WorkOrderSlaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cubo diario (UTC) para el dedupe del recordatorio recurrente. */
  private dayBucket(now: Date): string {
    return now.toISOString().slice(0, 10); // YYYY-MM-DD
  }

  async findBreaches(limit = 200): Promise<WorkOrderBreachEmit[]> {
    const now = new Date();
    const day = this.dayBucket(now);
    const out: WorkOrderBreachEmit[] = [];

    // 1) PERMANENCIA de estado excedida (now − currentStateSince > maxStayMinutes).
    //    Avisa UNA vez por ocupación (clave con currentStateSince).
    const stalled = await this.prisma.$queryRaw<Array<{ id: string; currentStateKey: string; currentStateSince: Date }>>`
      SELECT wo."id", wo."currentStateKey", wo."currentStateSince"
      FROM "WorkOrder" wo
      JOIN "WorkflowState" ws
        ON ws."workflowDefinitionVersionId" = wo."workflowDefinitionVersionId"
       AND ws."key" = wo."currentStateKey"
      WHERE wo."lifecycle" = 'OPEN'
        AND wo."deletedAt" IS NULL
        AND wo."currentStateKey" IS NOT NULL
        AND ws."maxStayMinutes" IS NOT NULL
        AND wo."currentStateSince" + (ws."maxStayMinutes" * interval '1 minute') < now()
      LIMIT ${limit}`;
    for (const r of stalled) {
      const since = r.currentStateSince.toISOString();
      out.push({
        eventKey: "workorder.stalled",
        payload: { workOrderId: r.id, stateKey: r.currentStateKey, currentStateSince: since },
        dedupeKey: `workorder.stalled|${r.id}|${since}`,
      });
    }

    // 2) PLAZO de resolución vencido (dueAt < ahora). Re-aviso diario.
    const overdue = await this.prisma.workOrder.findMany({
      where: { lifecycle: "OPEN", deletedAt: null, dueAt: { lt: now } },
      select: { id: true },
      take: limit,
    });
    for (const r of overdue) {
      out.push({
        eventKey: "workorder.overdue",
        payload: { workOrderId: r.id },
        dedupeKey: `workorder.overdue|${r.id}|${day}`,
      });
    }

    // 3) Actividad del plan vencida (fin baseline, o planificado si sin baseline, en el
    //    pasado; no DONE/CANCELED; OT abierta). Re-aviso diario.
    const activities = await this.prisma.workActivity.findMany({
      where: {
        status: { notIn: ["DONE", "CANCELED"] },
        workOrder: { lifecycle: "OPEN", deletedAt: null },
        OR: [{ baselineEnd: { lt: now } }, { AND: [{ baselineEnd: null }, { plannedEnd: { lt: now } }] }],
      },
      select: { id: true, workOrderId: true },
      take: limit,
    });
    for (const a of activities) {
      out.push({
        eventKey: "workorder.activity.overdue",
        payload: { workOrderId: a.workOrderId, activityId: a.id },
        dedupeKey: `workorder.activity.overdue|${a.id}|${day}`,
      });
    }

    return out;
  }
}
