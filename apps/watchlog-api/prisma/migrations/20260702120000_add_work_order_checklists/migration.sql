-- OT Sesión 3 (Puerta 2): checklists / permisos de trabajo ligados al Form Builder.
-- Capa A (WorkOrderChecklistRule = plantilla + reglas de aplicabilidad) + Capa B
-- (WorkOrderChecklist = enlace OT↔plantilla con su LogEntry vivo y estado). Se agregan
-- a WorkOrderType dos claves de estado data-driven (sugerencia + puerta). NOTA: el
-- drift ajeno preexistente (LogEntry_currentStateSince_idx, default de OrgStructure.updatedAt)
-- se DESCARTA a propósito — esta migración toca SOLO DDL de OT (ver DECISIONS 2026-07-01 S1).

-- CreateEnum
CREATE TYPE "WorkOrderChecklistStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "WorkOrderType" ADD COLUMN     "checklistGateStateKey" TEXT,
ADD COLUMN     "checklistSuggestStateKey" TEXT;

-- CreateTable
CREATE TABLE "WorkOrderChecklistRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "appliesToTypeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minCriticality" INTEGER,
    "specialtyId" TEXT,
    "requiresPtw" BOOLEAN,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WorkOrderChecklistRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderChecklist" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "logEntryId" TEXT,
    "sourceRuleId" TEXT,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "status" "WorkOrderChecklistStatus" NOT NULL DEFAULT 'PENDING',
    "responsibleId" TEXT,
    "responsibleRoleId" TEXT,
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrderChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOrderChecklistRule_templateId_idx" ON "WorkOrderChecklistRule"("templateId");

-- CreateIndex
CREATE INDEX "WorkOrderChecklistRule_specialtyId_idx" ON "WorkOrderChecklistRule"("specialtyId");

-- CreateIndex
CREATE INDEX "WorkOrderChecklistRule_active_idx" ON "WorkOrderChecklistRule"("active");

-- CreateIndex
CREATE INDEX "WorkOrderChecklistRule_deletedAt_idx" ON "WorkOrderChecklistRule"("deletedAt");

-- CreateIndex
CREATE INDEX "WorkOrderChecklist_workOrderId_idx" ON "WorkOrderChecklist"("workOrderId");

-- CreateIndex
CREATE INDEX "WorkOrderChecklist_status_idx" ON "WorkOrderChecklist"("status");

-- CreateIndex
CREATE INDEX "WorkOrderChecklist_logEntryId_idx" ON "WorkOrderChecklist"("logEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderChecklist_workOrderId_templateId_key" ON "WorkOrderChecklist"("workOrderId", "templateId");

-- AddForeignKey
ALTER TABLE "WorkOrderChecklistRule" ADD CONSTRAINT "WorkOrderChecklistRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderChecklistRule" ADD CONSTRAINT "WorkOrderChecklistRule_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderChecklist" ADD CONSTRAINT "WorkOrderChecklist_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderChecklist" ADD CONSTRAINT "WorkOrderChecklist_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderChecklist" ADD CONSTRAINT "WorkOrderChecklist_logEntryId_fkey" FOREIGN KEY ("logEntryId") REFERENCES "LogEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderChecklist" ADD CONSTRAINT "WorkOrderChecklist_sourceRuleId_fkey" FOREIGN KEY ("sourceRuleId") REFERENCES "WorkOrderChecklistRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
