-- Fase 2.3 — Programación de rondas: LogSchedule + RoundOccurrence (aditiva).
-- Idempotente (IF NOT EXISTS / DO block para el enum) al estilo del repo. NO incluye
-- el DROP INDEX de LogEntry_currentStateSince_idx que reporta el diff: es drift
-- preexistente ajeno a este cambio.

-- CreateEnum (idempotente)
DO $$ BEGIN
  CREATE TYPE "RoundOccurrenceStatus" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "LogSchedule" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "templateId" TEXT NOT NULL,
    "orgNodeId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "recurrenceKind" "RecurrenceKind" NOT NULL,
    "recurrenceConfig" JSONB NOT NULL,
    "dueWindowMinutes" INTEGER NOT NULL,
    "horizonDays" INTEGER NOT NULL DEFAULT 2,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastGeneratedThrough" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LogSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RoundOccurrence" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "orgNodeId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "shiftCode" TEXT,
    "operationalDate" TEXT,
    "periodKey" TEXT,
    "status" "RoundOccurrenceStatus" NOT NULL DEFAULT 'PENDING',
    "logEntryId" TEXT,
    "skippedById" TEXT,
    "skippedAt" TIMESTAMP(3),
    "skipReason" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoundOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LogSchedule_templateId_idx" ON "LogSchedule"("templateId");
CREATE INDEX IF NOT EXISTS "LogSchedule_orgNodeId_idx" ON "LogSchedule"("orgNodeId");
CREATE INDEX IF NOT EXISTS "LogSchedule_active_deletedAt_idx" ON "LogSchedule"("active", "deletedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "RoundOccurrence_logEntryId_key" ON "RoundOccurrence"("logEntryId");
CREATE INDEX IF NOT EXISTS "RoundOccurrence_status_dueAt_idx" ON "RoundOccurrence"("status", "dueAt");
CREATE INDEX IF NOT EXISTS "RoundOccurrence_orgNodeId_idx" ON "RoundOccurrence"("orgNodeId");
CREATE INDEX IF NOT EXISTS "RoundOccurrence_templateId_idx" ON "RoundOccurrence"("templateId");
CREATE UNIQUE INDEX IF NOT EXISTS "RoundOccurrence_scheduleId_scheduledFor_key" ON "RoundOccurrence"("scheduleId", "scheduledFor");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LogSchedule" ADD CONSTRAINT "LogSchedule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "LogSchedule" ADD CONSTRAINT "LogSchedule_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "LogSchedule" ADD CONSTRAINT "LogSchedule_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "RoundOccurrence" ADD CONSTRAINT "RoundOccurrence_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "LogSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "RoundOccurrence" ADD CONSTRAINT "RoundOccurrence_logEntryId_fkey" FOREIGN KEY ("logEntryId") REFERENCES "LogEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
