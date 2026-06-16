-- CreateEnum
CREATE TYPE "ExceptionTrigger" AS ENUM ('THRESHOLD_WARN', 'THRESHOLD_CRIT', 'RULE', 'MANUAL');

-- CreateEnum
CREATE TYPE "ExceptionThresholdType" AS ENUM ('warning', 'critical', 'invalid');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'DISMISSED', 'CONVERTED', 'CORRECTED');

-- CreateTable
CREATE TABLE "LogEntryException" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "logEntryId" TEXT NOT NULL,
    "templateId" TEXT,
    "templateVersionId" TEXT,
    "sectionKey" TEXT NOT NULL,
    "sectionLabel" TEXT,
    "fieldKey" TEXT NOT NULL,
    "fieldLabel" TEXT,
    "fieldType" TEXT,
    "unit" TEXT,
    "occurrenceRef" TEXT,
    "originalValue" JSONB,
    "bandsSnapshot" JSONB,
    "triggerKind" "ExceptionTrigger" NOT NULL,
    "thresholdType" "ExceptionThresholdType" NOT NULL,
    "ruleKey" TEXT,
    "ruleVersionId" TEXT,
    "ruleSeverity" TEXT,
    "detail" TEXT,
    "orgNodeId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "shiftCode" TEXT,
    "operatorId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entrySealedAt" TIMESTAMP(3),
    "status" "ExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "triagedById" TEXT,
    "triagedAt" TIMESTAMP(3),
    "dismissReason" TEXT,
    "correctedValue" JSONB,
    "correctionReason" TEXT,
    "correctedById" TEXT,
    "correctedAt" TIMESTAMP(3),
    "incidentId" TEXT,
    "dedupeKey" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogEntryException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentExceptionLink" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "exceptionId" TEXT NOT NULL,
    "linkedById" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentExceptionLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LogEntryException_number_key" ON "LogEntryException"("number");

-- CreateIndex
CREATE UNIQUE INDEX "LogEntryException_dedupeKey_key" ON "LogEntryException"("dedupeKey");

-- CreateIndex
CREATE INDEX "LogEntryException_logEntryId_idx" ON "LogEntryException"("logEntryId");

-- CreateIndex
CREATE INDEX "LogEntryException_orgNodeId_idx" ON "LogEntryException"("orgNodeId");

-- CreateIndex
CREATE INDEX "LogEntryException_equipmentId_idx" ON "LogEntryException"("equipmentId");

-- CreateIndex
CREATE INDEX "LogEntryException_status_idx" ON "LogEntryException"("status");

-- CreateIndex
CREATE INDEX "LogEntryException_thresholdType_idx" ON "LogEntryException"("thresholdType");

-- CreateIndex
CREATE INDEX "LogEntryException_incidentId_idx" ON "LogEntryException"("incidentId");

-- CreateIndex
CREATE INDEX "LogEntryException_detectedAt_id_idx" ON "LogEntryException"("detectedAt", "id");

-- CreateIndex
CREATE INDEX "IncidentExceptionLink_incidentId_idx" ON "IncidentExceptionLink"("incidentId");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentExceptionLink_exceptionId_key" ON "IncidentExceptionLink"("exceptionId");

-- AddForeignKey
ALTER TABLE "IncidentExceptionLink" ADD CONSTRAINT "IncidentExceptionLink_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentExceptionLink" ADD CONSTRAINT "IncidentExceptionLink_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "LogEntryException"("id") ON DELETE CASCADE ON UPDATE CASCADE;
