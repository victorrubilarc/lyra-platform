import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** Una orden de aviso a encolar (evento + payload mínimo + clave de dedupe). */
export interface IncidentBreachEmit {
  eventKey: string;
  payload: Prisma.InputJsonValue;
  dedupeKey: string;
}

/**
 * DETECCIÓN de vencimientos de incidencias (Fase 4.4). Vive en el módulo de
 * incidencias (dominio); el TICK lo ejecuta el sweeper del worker de notificaciones
 * (única infra de cron del proyecto), que llama a `findBreaches()` y emite cada
 * orden por el motor del Bloque N. Es solo-lectura y solo-Prisma (la resolución de
 * destinatarios + ABAC ocurre después, en el resolver).
 *
 * Cuatro conceptos, todos sobre incidencias ABIERTAS:
 *  - `incident.sla.breached`  → PERMANENCIA de estado excedida (maxStayMinutes).
 *  - `incident.overdue`       → PLAZO de resolución vencido (dueAt < ahora).
 *  - `incident.action.overdue`→ acción CAPA con plazo vencido.
 *  - `incident.report.due`    → reporte regulatorio PENDIENTE con plazo vencido.
 *
 * Dedupe: la permanencia se avisa UNA vez por ocupación de estado (clave con
 * `currentStateSince`, como `entry.sla.breached`); el plazo / la acción / el reporte
 * se RE-AVISAN a diario (clave con el día) — recordatorio recurrente del SLA light.
 */
@Injectable()
export class IncidentSlaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cubo diario (UTC) para el dedupe del recordatorio recurrente. */
  private dayBucket(now: Date): string {
    return now.toISOString().slice(0, 10); // YYYY-MM-DD
  }

  async findBreaches(limit = 200): Promise<IncidentBreachEmit[]> {
    const now = new Date();
    const day = this.dayBucket(now);
    const out: IncidentBreachEmit[] = [];

    // 1) PERMANENCIA de estado excedida (now − currentStateSince > maxStayMinutes).
    const slaRows = await this.prisma.$queryRaw<Array<{ id: string; currentStateKey: string; currentStateSince: Date }>>`
      SELECT i."id", i."currentStateKey", i."currentStateSince"
      FROM "Incident" i
      JOIN "WorkflowState" ws
        ON ws."workflowDefinitionVersionId" = i."workflowDefinitionVersionId"
       AND ws."key" = i."currentStateKey"
      WHERE i."lifecycle" = 'OPEN'
        AND i."currentStateKey" IS NOT NULL
        AND ws."maxStayMinutes" IS NOT NULL
        AND i."currentStateSince" + (ws."maxStayMinutes" * interval '1 minute') < now()
      LIMIT ${limit}`;
    for (const r of slaRows) {
      const since = r.currentStateSince.toISOString();
      out.push({
        eventKey: "incident.sla.breached",
        payload: { incidentId: r.id, stateKey: r.currentStateKey, currentStateSince: since },
        dedupeKey: `incident.sla.breached|${r.id}|${since}`,
      });
    }

    // 2) PLAZO de resolución vencido (dueAt < ahora). Re-aviso diario.
    const overdue = await this.prisma.incident.findMany({
      where: { lifecycle: "OPEN", dueAt: { lt: now } },
      select: { id: true },
      take: limit,
    });
    for (const r of overdue) {
      out.push({
        eventKey: "incident.overdue",
        payload: { incidentId: r.id },
        dedupeKey: `incident.overdue|${r.id}|${day}`,
      });
    }

    // 3) Acción CAPA con plazo vencido (incidencia abierta). Re-aviso diario.
    const actions = await this.prisma.incidentAction.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] }, dueAt: { lt: now }, incident: { lifecycle: "OPEN" } },
      select: { id: true, incidentId: true },
      take: limit,
    });
    for (const a of actions) {
      out.push({
        eventKey: "incident.action.overdue",
        payload: { incidentId: a.incidentId, actionId: a.id },
        dedupeKey: `incident.action.overdue|${a.id}|${day}`,
      });
    }

    // 4) Reporte regulatorio PENDIENTE con plazo vencido (incidencia abierta). Re-aviso diario.
    const reports = await this.prisma.incidentReport.findMany({
      where: { status: "PENDING", dueAt: { lt: now }, incident: { lifecycle: "OPEN" } },
      select: { id: true, incidentId: true },
      take: limit,
    });
    for (const rep of reports) {
      out.push({
        eventKey: "incident.report.due",
        payload: { incidentId: rep.incidentId, reportId: rep.id },
        dedupeKey: `incident.report.due|${rep.id}|${day}`,
      });
    }

    return out;
  }
}
