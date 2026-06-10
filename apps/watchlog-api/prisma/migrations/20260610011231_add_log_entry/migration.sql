-- CreateEnum
CREATE TYPE "LogEntryStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VOID');

-- CreateEnum
CREATE TYPE "LogEntrySectionState" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'LOCKED');

-- CreateTable
CREATE TABLE "LogEntry" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "workflowDefinitionId" TEXT,
    "workflowDefinitionVersionId" TEXT,
    "orgNodeId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "currentStateKey" TEXT,
    "status" "LogEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shiftCode" TEXT,
    "operationalDate" TEXT,
    "periodKey" TEXT,
    "sealedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogEntrySection" (
    "id" TEXT NOT NULL,
    "logEntryId" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "state" "LogEntrySectionState" NOT NULL DEFAULT 'PENDING',
    "filledById" TEXT,
    "filledAt" TIMESTAMP(3),
    "signatureId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogEntrySection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogEntryValue" (
    "id" TEXT NOT NULL,
    "logEntryId" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "dataType" "FieldDataType" NOT NULL,
    "value" JSONB,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogEntryValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogEntryFieldChange" (
    "id" TEXT NOT NULL,
    "logEntryId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogEntryFieldChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LogEntry_templateId_idx" ON "LogEntry"("templateId");

-- CreateIndex
CREATE INDEX "LogEntry_templateVersionId_idx" ON "LogEntry"("templateVersionId");

-- CreateIndex
CREATE INDEX "LogEntry_orgNodeId_idx" ON "LogEntry"("orgNodeId");

-- CreateIndex
CREATE INDEX "LogEntry_equipmentId_idx" ON "LogEntry"("equipmentId");

-- CreateIndex
CREATE INDEX "LogEntry_status_idx" ON "LogEntry"("status");

-- CreateIndex
CREATE INDEX "LogEntry_effectiveAt_idx" ON "LogEntry"("effectiveAt");

-- CreateIndex
CREATE INDEX "LogEntry_operationalDate_idx" ON "LogEntry"("operationalDate");

-- CreateIndex
CREATE INDEX "LogEntry_periodKey_idx" ON "LogEntry"("periodKey");

-- CreateIndex
CREATE INDEX "LogEntry_deletedAt_idx" ON "LogEntry"("deletedAt");

-- CreateIndex
CREATE INDEX "LogEntrySection_logEntryId_idx" ON "LogEntrySection"("logEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "LogEntrySection_logEntryId_sectionKey_key" ON "LogEntrySection"("logEntryId", "sectionKey");

-- CreateIndex
CREATE INDEX "LogEntryValue_logEntryId_idx" ON "LogEntryValue"("logEntryId");

-- CreateIndex
CREATE INDEX "LogEntryValue_sectionKey_idx" ON "LogEntryValue"("sectionKey");

-- CreateIndex
CREATE UNIQUE INDEX "LogEntryValue_logEntryId_fieldKey_key" ON "LogEntryValue"("logEntryId", "fieldKey");

-- CreateIndex
CREATE INDEX "LogEntryFieldChange_logEntryId_idx" ON "LogEntryFieldChange"("logEntryId");

-- CreateIndex
CREATE INDEX "LogEntryFieldChange_changedAt_idx" ON "LogEntryFieldChange"("changedAt");

-- AddForeignKey
ALTER TABLE "LogEntry" ADD CONSTRAINT "LogEntry_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogEntry" ADD CONSTRAINT "LogEntry_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "TemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogEntry" ADD CONSTRAINT "LogEntry_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogEntry" ADD CONSTRAINT "LogEntry_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogEntrySection" ADD CONSTRAINT "LogEntrySection_logEntryId_fkey" FOREIGN KEY ("logEntryId") REFERENCES "LogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogEntryValue" ADD CONSTRAINT "LogEntryValue_logEntryId_fkey" FOREIGN KEY ("logEntryId") REFERENCES "LogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogEntryFieldChange" ADD CONSTRAINT "LogEntryFieldChange_logEntryId_fkey" FOREIGN KEY ("logEntryId") REFERENCES "LogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
