/**
 * Migración de datos 2.7.1.1 — desacople del período en `FiscalCalendar`.
 *
 * Idempotente y NO destructivo. Se ejecuta ENTRE la migración estructural M1
 * (`add_fiscal_calendar`) y la de cleanup M2 (`decouple_fiscal_period_cleanup`):
 *
 *  1. Agrupa los `OperationalCalendar` por FIRMA de su config de período
 *     (periodKind + ancla) y crea UN `FiscalCalendar` por firma distinta. El default
 *     fiscal sale de la firma del calendario de turnos por defecto.
 *  2. Re-asigna `OrgNode.fiscalCalendarId` a los nodos cuyo calendario de turnos tiene
 *     una firma DISTINTA del default (los demás resuelven al default fiscal). Así el
 *     `periodKey` que cada nodo derivaba se preserva EXACTO (histórico intacto).
 *  3. Remapea las filas `OperationalPeriod` existentes a su `fiscalCalendarId` y les
 *     calcula `periodStart`/`periodEnd` con la fuente única `periodBoundsFor`.
 *
 * Usa SQL crudo para no depender del estado del cliente Prisma generado (las columnas
 * legacy desaparecen en M2). Ejecutar:
 *   pnpm --filter @lyra/watchlog-api exec dotenv -e ../../.env -- tsx prisma/migrate-fiscal.ts
 */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { periodBoundsFor, type FiscalConfig, type PeriodKind } from "@lyra/contracts";

const prisma = new PrismaClient();

interface CalRow {
  id: string;
  key: string;
  name: string;
  timezone: string;
  isDefault: boolean;
  periodKind: PeriodKind;
  periodAnchorDay: number | null;
  periodStartWeekday: number | null;
  periodLengthDays: number | null;
  periodAnchorDate: string | null;
}

/** Config normalizada (solo los campos relevantes al `periodKind`) → firma estable. */
function configOf(c: CalRow): FiscalConfig {
  switch (c.periodKind) {
    case "MONTH":
      return { periodKind: "MONTH", periodAnchorDay: c.periodAnchorDay ?? 1 };
    case "WEEK":
      return { periodKind: "WEEK", periodStartWeekday: c.periodStartWeekday ?? 1 };
    case "CUSTOM":
      return {
        periodKind: "CUSTOM",
        periodLengthDays: c.periodLengthDays,
        periodAnchorDate: c.periodAnchorDate,
      };
  }
}

function signatureOf(c: CalRow): string {
  return JSON.stringify(configOf(c));
}

function baseKeyFor(kind: PeriodKind): string {
  return kind === "MONTH" ? "fiscal-mensual" : kind === "WEEK" ? "fiscal-semanal" : "fiscal-personalizado";
}

function nameFor(kind: PeriodKind, isDefault: boolean): string {
  const label = kind === "MONTH" ? "mensual" : kind === "WEEK" ? "semanal" : "personalizado";
  return isDefault ? `Calendario fiscal predeterminado (${label})` : `Calendario fiscal (${label})`;
}

/** Día representativo dentro del período `periodKey` para reconstruir su rango. */
function repDateFor(periodKey: string, cfg: FiscalConfig): string {
  if (cfg.periodKind === "MONTH") {
    const anchor = cfg.periodAnchorDay ?? 1;
    return `${periodKey}-${String(anchor).padStart(2, "0")}`; // "YYYY-MM" + día-ancla = inicio del período
  }
  return periodKey; // WEEK/CUSTOM: la llave ES el día de inicio
}

async function main(): Promise<void> {
  const cals = await prisma.$queryRawUnsafe<CalRow[]>(
    `SELECT "id","key","name","timezone","isDefault","periodKind","periodAnchorDay","periodStartWeekday","periodLengthDays","periodAnchorDate"
     FROM "OperationalCalendar" WHERE "deletedAt" IS NULL`,
  );

  // --- 1. Crear un FiscalCalendar por firma distinta -------------------------
  const defaultSig = cals.find((c) => c.isDefault) ? signatureOf(cals.find((c) => c.isDefault)!) : null;

  // Agrupa: firma -> calendario representativo.
  const bySig = new Map<string, CalRow>();
  for (const c of cals) {
    if (!bySig.has(signatureOf(c))) bySig.set(signatureOf(c), c);
  }

  // Si no hay calendarios de turnos, crea un default fiscal sensato.
  if (bySig.size === 0) {
    const fallback: CalRow = {
      id: "",
      key: "",
      name: "",
      timezone: "America/Santiago",
      isDefault: true,
      periodKind: "MONTH",
      periodAnchorDay: 1,
      periodStartWeekday: null,
      periodLengthDays: null,
      periodAnchorDate: null,
    };
    bySig.set(signatureOf(fallback), fallback);
  }

  const usedKeys = new Set<string>();
  const fiscalIdBySig = new Map<string, string>();

  for (const [sig, rep] of bySig) {
    const isDefault = defaultSig != null ? sig === defaultSig : fiscalIdBySig.size === 0;
    const cfg = configOf(rep);
    let key = isDefault ? "fiscal-default" : baseKeyFor(rep.periodKind);
    let n = 1;
    while (usedKeys.has(key)) {
      n += 1;
      key = `${baseKeyFor(rep.periodKind)}-${n}`;
    }
    usedKeys.add(key);

    // Idempotente: si ya existe el fiscal de esta firma (por config), reutilízalo.
    const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "id" FROM "FiscalCalendar"
       WHERE "deletedAt" IS NULL AND "periodKind" = $1::"PeriodKind"
         AND COALESCE("periodAnchorDay",-1) = COALESCE($2,-1)
         AND COALESCE("periodStartWeekday",-1) = COALESCE($3,-1)
         AND COALESCE("periodLengthDays",-1) = COALESCE($4,-1)
         AND COALESCE("periodAnchorDate",'') = COALESCE($5,'')
       LIMIT 1`,
      rep.periodKind,
      cfg.periodAnchorDay ?? null,
      cfg.periodStartWeekday ?? null,
      cfg.periodLengthDays ?? null,
      cfg.periodAnchorDate ?? null,
    );
    if (existing.length > 0) {
      fiscalIdBySig.set(sig, existing[0]!.id);
      console.log(`= FiscalCalendar ya existe para firma ${sig} → ${existing[0]!.id}`);
      continue;
    }

    const id = `fc_${randomUUID().replace(/-/g, "")}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "FiscalCalendar"
         ("id","key","name","timezone","isDefault","active","periodKind","periodAnchorDay","periodStartWeekday","periodLengthDays","periodAnchorDate","requirePeriod","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,true,$6::"PeriodKind",$7,$8,$9,$10,false,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      id,
      key,
      nameFor(rep.periodKind, isDefault),
      rep.timezone,
      isDefault,
      rep.periodKind,
      cfg.periodAnchorDay ?? null,
      cfg.periodStartWeekday ?? null,
      cfg.periodLengthDays ?? null,
      cfg.periodAnchorDate ?? null,
    );
    fiscalIdBySig.set(sig, id);
    console.log(`+ FiscalCalendar "${key}" (${rep.periodKind}, default=${isDefault}) ← firma ${sig}`);
  }

  // --- 2. Re-asignar OrgNode.fiscalCalendarId (solo firmas ≠ default) ---------
  // Mapa calendarId de turnos → fiscalCalendarId.
  const fiscalIdByCalId = new Map<string, string>();
  for (const c of cals) fiscalIdByCalId.set(c.id, fiscalIdBySig.get(signatureOf(c))!);

  let reassigned = 0;
  const assignedNodes = await prisma.$queryRawUnsafe<{ id: string; operationalCalendarId: string }[]>(
    `SELECT "id","operationalCalendarId" FROM "OrgNode"
     WHERE "operationalCalendarId" IS NOT NULL AND "fiscalCalendarId" IS NULL AND "deletedAt" IS NULL`,
  );
  for (const node of assignedNodes) {
    const cal = cals.find((c) => c.id === node.operationalCalendarId);
    if (!cal) continue;
    const sig = signatureOf(cal);
    if (defaultSig != null && sig === defaultSig) continue; // resuelve al default fiscal
    const fiscalId = fiscalIdBySig.get(sig)!;
    await prisma.$executeRawUnsafe(`UPDATE "OrgNode" SET "fiscalCalendarId" = $1 WHERE "id" = $2`, fiscalId, node.id);
    reassigned += 1;
    console.log(`→ Nodo ${node.id} reasignado a fiscal ${fiscalId} (firma ${sig} ≠ default)`);
  }

  // --- 3. Remapear filas OperationalPeriod existentes ------------------------
  const periods = await prisma.$queryRawUnsafe<{ id: string; calendarId: string; periodKey: string }[]>(
    `SELECT "id","calendarId","periodKey" FROM "OperationalPeriod" WHERE "fiscalCalendarId" IS NULL`,
  );
  let remapped = 0;
  for (const p of periods) {
    const cal = cals.find((c) => c.id === p.calendarId);
    if (!cal) {
      console.warn(`! Período ${p.id} referencia un calendario inexistente (${p.calendarId}); se omite`);
      continue;
    }
    const cfg = configOf(cal);
    const fiscalId = fiscalIdByCalId.get(cal.id)!;
    const bounds = periodBoundsFor(repDateFor(p.periodKey, cfg), cfg);
    if (!bounds || bounds.periodKey !== p.periodKey) {
      console.warn(`! Período ${p.id} (${p.periodKey}) no reconcilia con su config; se omite el rango`);
      await prisma.$executeRawUnsafe(
        `UPDATE "OperationalPeriod" SET "fiscalCalendarId" = $1 WHERE "id" = $2`,
        fiscalId,
        p.id,
      );
      continue;
    }
    await prisma.$executeRawUnsafe(
      `UPDATE "OperationalPeriod" SET "fiscalCalendarId" = $1, "periodStart" = $2, "periodEnd" = $3 WHERE "id" = $4`,
      fiscalId,
      bounds.periodStart,
      bounds.periodEnd,
      p.id,
    );
    remapped += 1;
  }

  console.log(
    `\n✔ Migración fiscal: ${fiscalIdBySig.size} calendario(s) fiscal, ${reassigned} nodo(s) reasignado(s), ${remapped} período(s) remapeado(s).`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
