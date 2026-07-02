import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

/**
 * Zona horaria de la PLANTA para el reinicio anual del folio (misma decisión que el
 * dashboard, 2026-06-17): instalación on-prem single-tenant ⇒ una sola TZ, por entorno.
 */
const PLANT_TIME_ZONE = process.env.PLANT_TIME_ZONE ?? "America/Santiago";

/**
 * Motor de FOLIO gapless configurable (fork W4) — asignación ATÓMICA del correlativo.
 *
 * Una fila de `FolioCounter` por clave de secuencia (`buildFolioSeqKey` en
 * @lyra/contracts codifica entidad + scope + año). La asignación es un solo
 * `INSERT … ON CONFLICT … DO UPDATE … RETURNING`: dos transacciones concurrentes
 * quedan serializadas por el lock de fila del UPDATE — sin `SELECT max+1` de carrera
 * y sin huecos (gapless: el valor solo se consume si la transacción del llamador
 * COMMITEA; por eso `next()` recibe el client de SU transacción).
 *
 * Reutilizable por cualquier entidad (OT hoy; folio-por-plantilla del dueño después).
 */
@Injectable()
export class FolioService {
  /**
   * Siguiente correlativo de la secuencia. DEBE ejecutarse dentro de la transacción
   * del llamador (pásale su `tx`): si la transición hace rollback, el incremento
   * también, y el folio no se quema.
   *
   * @param start primer valor cuando la secuencia no existe aún (folioScheme.start).
   */
  async next(tx: Prisma.TransactionClient, sequenceKey: string, start = 1): Promise<number> {
    const rows = await tx.$queryRaw<Array<{ lastValue: number }>>`
      INSERT INTO "FolioCounter" ("sequenceKey", "lastValue", "updatedAt")
      VALUES (${sequenceKey}, ${start}, NOW())
      ON CONFLICT ("sequenceKey")
      DO UPDATE SET "lastValue" = "FolioCounter"."lastValue" + 1, "updatedAt" = NOW()
      RETURNING "lastValue"
    `;
    const value = rows[0]?.lastValue;
    if (value === undefined) throw new Error(`FolioCounter no devolvió correlativo para "${sequenceKey}"`);
    return value;
  }

  /** Año calendario ACTUAL de la planta (frontera del reinicio anual del folio). */
  plantYear(now: Date = new Date()): number {
    const year = new Intl.DateTimeFormat("en-US", { timeZone: PLANT_TIME_ZONE, year: "numeric" }).format(now);
    return Number(year);
  }
}
