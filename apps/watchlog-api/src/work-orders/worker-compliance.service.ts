import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { DEFAULT_COMPETENCY_WARNING_LEAD_DAYS } from "@lyra/contracts";
import { PrismaService } from "../prisma/prisma.service";

/** Una orden de aviso a encolar (evento + payload mínimo + clave de dedupe). */
export interface WorkerBreachEmit {
  eventKey: string;
  payload: Prisma.InputJsonValue;
  dedupeKey: string;
}

/**
 * DETECCIÓN de vencimientos de COMPETENCIAS de la dotación (Dotación S2) — ESPEJO de
 * `WorkOrderSlaService`. Vive en el dominio; el TICK lo ejecuta el sweeper del worker de
 * notificaciones (única infra de cron), que llama a `findBreaches()` y emite cada orden
 * por el motor del Bloque N. Solo-lectura + solo-Prisma (destinatarios + ABAC = resolver).
 *
 * Sólo se avisan competencias de personas que están HOY en el roster de una OT ABIERTA
 * (el destinatario natural = responsable/roles de esa OT). Traza: ISN "tracks all training
 * expirations and sends notifications to renew". Acreditación de EMPRESA → S3.
 *  - `worker.competency.expiring` → vence dentro de la ventana del tipo (warningLeadDays).
 *  - `worker.competency.expired`  → ya venció y sigue en un roster activo.
 * Ambos se RE-AVISAN a diario (clave con el día) — recordatorio recurrente.
 */
@Injectable()
export class WorkerComplianceService {
  constructor(private readonly prisma: PrismaService) {}

  private dayBucket(now: Date): string {
    return now.toISOString().slice(0, 10); // YYYY-MM-DD
  }

  async findBreaches(limit = 200): Promise<WorkerBreachEmit[]> {
    const day = this.dayBucket(new Date());
    const out: WorkerBreachEmit[] = [];

    type Row = { workOrderId: string; competencyId: string; personId: string; personName: string; competencyName: string; expiresAt: Date };

    // 1) POR VENCER: expira en el futuro dentro de la ventana ámbar del tipo
    //    (warningLeadDays del tipo, o el default si no lo fija). Una fila por (OT, competencia).
    const expiring = await this.prisma.$queryRaw<Row[]>`
      SELECT DISTINCT wo."id" AS "workOrderId", pc."id" AS "competencyId", pc."personId",
             p."fullName" AS "personName", ct."name" AS "competencyName", pc."expiresAt"
      FROM "PersonCompetency" pc
      JOIN "CompetencyType" ct ON ct."id" = pc."competencyTypeId"
      JOIN "Person" p ON p."id" = pc."personId"
      JOIN "WorkOrderWorker" ww ON ww."personId" = pc."personId" AND ww."removedAt" IS NULL
      JOIN "WorkOrder" wo ON wo."id" = ww."workOrderId" AND wo."lifecycle" = 'OPEN' AND wo."deletedAt" IS NULL
      WHERE pc."deletedAt" IS NULL
        AND pc."expiresAt" IS NOT NULL
        AND pc."expiresAt" > now()
        AND pc."expiresAt" <= now() + (COALESCE(ct."warningLeadDays", ${DEFAULT_COMPETENCY_WARNING_LEAD_DAYS}) * interval '1 day')
      LIMIT ${limit}`;
    for (const r of expiring) {
      out.push({
        eventKey: "worker.competency.expiring",
        payload: { workOrderId: r.workOrderId, competencyId: r.competencyId, personId: r.personId, personName: r.personName, competencyName: r.competencyName, expiresAt: r.expiresAt.toISOString() },
        dedupeKey: `worker.competency.expiring|${r.workOrderId}|${r.competencyId}|${day}`,
      });
    }

    // 2) VENCIDA: ya expiró y la persona sigue en un roster de OT abierta.
    const expired = await this.prisma.$queryRaw<Row[]>`
      SELECT DISTINCT wo."id" AS "workOrderId", pc."id" AS "competencyId", pc."personId",
             p."fullName" AS "personName", ct."name" AS "competencyName", pc."expiresAt"
      FROM "PersonCompetency" pc
      JOIN "CompetencyType" ct ON ct."id" = pc."competencyTypeId"
      JOIN "Person" p ON p."id" = pc."personId"
      JOIN "WorkOrderWorker" ww ON ww."personId" = pc."personId" AND ww."removedAt" IS NULL
      JOIN "WorkOrder" wo ON wo."id" = ww."workOrderId" AND wo."lifecycle" = 'OPEN' AND wo."deletedAt" IS NULL
      WHERE pc."deletedAt" IS NULL
        AND pc."expiresAt" IS NOT NULL
        AND pc."expiresAt" <= now()
      LIMIT ${limit}`;
    for (const r of expired) {
      out.push({
        eventKey: "worker.competency.expired",
        payload: { workOrderId: r.workOrderId, competencyId: r.competencyId, personId: r.personId, personName: r.personName, competencyName: r.competencyName, expiresAt: r.expiresAt.toISOString() },
        dedupeKey: `worker.competency.expired|${r.workOrderId}|${r.competencyId}|${day}`,
      });
    }

    return out;
  }
}
