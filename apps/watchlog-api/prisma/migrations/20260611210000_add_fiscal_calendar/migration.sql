-- Fase 2.7.1.1 — Calendario FISCAL transversal (M1: estructural ADITIVA).
-- Crea FiscalCalendar y re-scopea OperationalPeriod a fiscalCalendarId SIN destruir
-- nada todavía: las columnas legacy (OperationalCalendar.period*, OperationalPeriod.calendarId)
-- se conservan para que el script `db:migrate-fiscal` migre los datos preservando el
-- periodKey histórico. El cleanup ocurre en la migración M2 posterior.

-- AlterEnum: tri-estado OPEN -> CLOSED -> LOCKED (CLOSING deprecado, retenido).
ALTER TYPE "PeriodStatus" ADD VALUE IF NOT EXISTS 'LOCKED';

-- CreateTable: FiscalCalendar (transversal).
CREATE TABLE "FiscalCalendar" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "timezone" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "periodKind" "PeriodKind" NOT NULL DEFAULT 'MONTH',
    "periodAnchorDay" INTEGER DEFAULT 1,
    "periodStartWeekday" INTEGER DEFAULT 1,
    "periodLengthDays" INTEGER,
    "periodAnchorDate" TEXT,
    "requirePeriod" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FiscalCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FiscalCalendar_key_key" ON "FiscalCalendar"("key");
CREATE INDEX "FiscalCalendar_deletedAt_idx" ON "FiscalCalendar"("deletedAt");

-- AlterTable: OrgNode gana la asignación fiscal por nodo.
ALTER TABLE "OrgNode" ADD COLUMN "fiscalCalendarId" TEXT;
CREATE INDEX "OrgNode_fiscalCalendarId_idx" ON "OrgNode"("fiscalCalendarId");
ALTER TABLE "OrgNode" ADD CONSTRAINT "OrgNode_fiscalCalendarId_fkey" FOREIGN KEY ("fiscalCalendarId") REFERENCES "FiscalCalendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: OperationalPeriod re-scopeada (columnas nuevas NULLABLE por ahora; el
-- script las puebla y la M2 las endurece a NOT NULL y elimina calendarId).
ALTER TABLE "OperationalPeriod" ADD COLUMN "fiscalCalendarId" TEXT;
ALTER TABLE "OperationalPeriod" ADD COLUMN "periodStart" TEXT;
ALTER TABLE "OperationalPeriod" ADD COLUMN "periodEnd" TEXT;
ALTER TABLE "OperationalPeriod" ADD COLUMN "lockedById" TEXT;
ALTER TABLE "OperationalPeriod" ADD COLUMN "lockedAt" TIMESTAMP(3);
ALTER TABLE "OperationalPeriod" ADD COLUMN "lockReason" TEXT;
CREATE INDEX "OperationalPeriod_fiscalCalendarId_status_idx" ON "OperationalPeriod"("fiscalCalendarId", "status");
ALTER TABLE "OperationalPeriod" ADD CONSTRAINT "OperationalPeriod_fiscalCalendarId_fkey" FOREIGN KEY ("fiscalCalendarId") REFERENCES "FiscalCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
