-- S5b Slice B: checklists de EJECUCION por actividad + Gobierno 2 (set de ejecucion).
-- Aditiva. El unique pasa de (workOrderId, templateId) a (workOrderId, templateId,
-- workActivityId): Postgres trata NULL como distinto, por eso el anti-duplicado de los
-- checklists de NIVEL-OT (workActivityId null) sigue siendo el guard de codigo.

-- DropIndex
DROP INDEX "WorkOrderChecklist_workOrderId_templateId_key";

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "executionSetConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "executionSetConfirmedById" TEXT;

-- AlterTable
ALTER TABLE "WorkOrderChecklist" ADD COLUMN     "workActivityId" TEXT;

-- CreateIndex
CREATE INDEX "WorkOrderChecklist_workActivityId_idx" ON "WorkOrderChecklist"("workActivityId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderChecklist_workOrderId_templateId_workActivityId_key" ON "WorkOrderChecklist"("workOrderId", "templateId", "workActivityId");

-- AddForeignKey
ALTER TABLE "WorkOrderChecklist" ADD CONSTRAINT "WorkOrderChecklist_workActivityId_fkey" FOREIGN KEY ("workActivityId") REFERENCES "WorkActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
