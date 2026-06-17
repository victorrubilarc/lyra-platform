-- Fase 4.1.2: acción del motor de reglas (diferida vía outbox). Migración ADITIVA.

-- CreateEnum
CREATE TYPE "RuleActionOutboxStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- AlterTable: una excepción de REGLA cruzada no ata un campo único.
ALTER TABLE "LogEntryException" ALTER COLUMN "sectionKey" DROP NOT NULL,
ALTER COLUMN "fieldKey" DROP NOT NULL;

-- CreateTable
CREATE TABLE "RuleActionOutbox" (
    "id" TEXT NOT NULL,
    "logEntryId" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "ruleVersionId" TEXT,
    "payload" JSONB NOT NULL,
    "status" "RuleActionOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "RuleActionOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RuleActionOutbox_dedupeKey_key" ON "RuleActionOutbox"("dedupeKey");

-- CreateIndex
CREATE INDEX "RuleActionOutbox_status_createdAt_idx" ON "RuleActionOutbox"("status", "createdAt");
