-- Fase 2.7.1.1 — Calendario FISCAL transversal (M2: CLEANUP).
-- Se ejecuta DESPUÉS del script de datos `db:migrate-fiscal`, que ya pobló
-- OperationalPeriod.fiscalCalendarId/periodStart/periodEnd y reasignó los nodos.
-- Endurece las columnas nuevas a NOT NULL y elimina las columnas legacy del modelo
-- acoplado (OperationalCalendar.period*, OperationalPeriod.calendarId).

-- OperationalPeriod: endurecer columnas nuevas y soltar el scope viejo por calendario de turnos.
ALTER TABLE "OperationalPeriod" DROP CONSTRAINT IF EXISTS "OperationalPeriod_calendarId_fkey";
DROP INDEX IF EXISTS "OperationalPeriod_calendarId_status_idx";
DROP INDEX IF EXISTS "OperationalPeriod_calendarId_periodKey_key";

ALTER TABLE "OperationalPeriod" ALTER COLUMN "fiscalCalendarId" SET NOT NULL;
ALTER TABLE "OperationalPeriod" ALTER COLUMN "periodStart" SET NOT NULL;
ALTER TABLE "OperationalPeriod" ALTER COLUMN "periodEnd" SET NOT NULL;
ALTER TABLE "OperationalPeriod" DROP COLUMN "calendarId";

CREATE UNIQUE INDEX "OperationalPeriod_fiscalCalendarId_periodKey_key" ON "OperationalPeriod"("fiscalCalendarId", "periodKey");

-- OperationalCalendar: el período se desacopló; eliminar su config de período.
ALTER TABLE "OperationalCalendar" DROP COLUMN "periodKind";
ALTER TABLE "OperationalCalendar" DROP COLUMN "periodAnchorDay";
ALTER TABLE "OperationalCalendar" DROP COLUMN "periodStartWeekday";
ALTER TABLE "OperationalCalendar" DROP COLUMN "periodLengthDays";
ALTER TABLE "OperationalCalendar" DROP COLUMN "periodAnchorDate";
