-- CreateEnum
CREATE TYPE "WorkOrderChecklistMoment" AS ENUM ('REQUEST', 'PLANNING', 'AUTHORIZATION', 'EXECUTION', 'CLOSURE');

-- AlterTable
ALTER TABLE "WorkOrderChecklist" ADD COLUMN     "moment" "WorkOrderChecklistMoment" NOT NULL DEFAULT 'AUTHORIZATION';

-- AlterTable
ALTER TABLE "WorkOrderChecklistRule" ADD COLUMN     "moment" "WorkOrderChecklistMoment" NOT NULL DEFAULT 'AUTHORIZATION';

-- AlterTable
ALTER TABLE "WorkOrderType" ADD COLUMN     "closureChecklistSuggestStateKey" TEXT;

-- CreateIndex
CREATE INDEX "WorkOrderChecklist_workOrderId_moment_idx" ON "WorkOrderChecklist"("workOrderId", "moment");

