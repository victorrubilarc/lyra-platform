-- OT Sesión 4 (Puerta 3 · plan de actividades + congelar baseline).
-- Solo DDL de OT: se descarta el drift preexistente ajeno del diff
-- (LogEntry_currentStateSince_idx, OrgStructure.updatedAt) — ver DECISIONS 2026-07-01 S1.

-- CreateEnum
CREATE TYPE "WorkActivityStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELED');

-- AlterTable: baseline del plan congelada (Puerta 3)
ALTER TABLE "WorkOrder" ADD COLUMN     "planFrozenAt" TIMESTAMP(3),
ADD COLUMN     "planFrozenById" TEXT;

-- AlterTable: claves de estado data-driven de la Puerta 3 (default por constante en contracts)
ALTER TABLE "WorkOrderType" ADD COLUMN     "executeStateKey" TEXT,
ADD COLUMN     "planFreezeStateKey" TEXT;

-- CreateTable: actividad/tarea del plan (fork W1, entidad propia)
CREATE TABLE "WorkActivity" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "responsibleId" TEXT,
    "responsibleRoleId" TEXT,
    "specialtyId" TEXT,
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "baselineStart" TIMESTAMP(3),
    "baselineEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "estimatedHours" DECIMAL(10,2),
    "actualHours" DECIMAL(10,2),
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "status" "WorkActivityStatus" NOT NULL DEFAULT 'PENDING',
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "dependsOnId" TEXT,
    "priority" "WorkOrderPriority",
    "delayReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "completionNote" TEXT,
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "canceledById" TEXT,
    "evidence" JSONB,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkActivity_workOrderId_sequence_idx" ON "WorkActivity"("workOrderId", "sequence");

-- CreateIndex
CREATE INDEX "WorkActivity_status_idx" ON "WorkActivity"("status");

-- CreateIndex
CREATE INDEX "WorkActivity_responsibleId_idx" ON "WorkActivity"("responsibleId");

-- CreateIndex
CREATE INDEX "WorkActivity_mandatory_status_idx" ON "WorkActivity"("mandatory", "status");

-- CreateIndex
CREATE INDEX "WorkActivity_specialtyId_idx" ON "WorkActivity"("specialtyId");

-- CreateIndex
CREATE INDEX "WorkActivity_dependsOnId_idx" ON "WorkActivity"("dependsOnId");

-- AddForeignKey
ALTER TABLE "WorkActivity" ADD CONSTRAINT "WorkActivity_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkActivity" ADD CONSTRAINT "WorkActivity_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkActivity" ADD CONSTRAINT "WorkActivity_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "WorkActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
