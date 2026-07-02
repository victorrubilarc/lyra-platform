-- CreateEnum
CREATE TYPE "WorkOrderOrigin" AS ENUM ('DIRECT', 'RULE', 'EXCEPTION', 'PLANNED', 'INCIDENT');

-- CreateEnum
CREATE TYPE "WorkOrderPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "WorkOrderLifecycle" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'CANCELED');

-- CreateTable
CREATE TABLE "WorkOrderType" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "defaultWorkflowId" TEXT,
    "requiresPtwDefault" BOOLEAN NOT NULL DEFAULT false,
    "criticalityDefault" INTEGER,
    "folioScheme" JSONB,
    "folioOnStateKey" TEXT,
    "resolutionDueMinutes" INTEGER,
    "escalationAfterMinutes" INTEGER,
    "escalationRoleId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WorkOrderType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Area" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Specialty" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Specialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "folio" TEXT,
    "folioSeqKey" TEXT,
    "folioIssuedAt" TIMESTAMP(3),
    "title" TEXT NOT NULL,
    "description" TEXT,
    "typeId" TEXT NOT NULL,
    "originType" "WorkOrderOrigin" NOT NULL DEFAULT 'DIRECT',
    "criticality" INTEGER NOT NULL,
    "priority" "WorkOrderPriority" NOT NULL DEFAULT 'MEDIUM',
    "riskProbability" INTEGER,
    "riskConsequence" INTEGER,
    "requiresPtw" BOOLEAN NOT NULL DEFAULT false,
    "orgNodeId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "locationDetail" TEXT,
    "shiftCode" TEXT,
    "workflowDefinitionId" TEXT,
    "workflowDefinitionVersionId" TEXT,
    "currentStateKey" TEXT,
    "currentStateSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lifecycle" "WorkOrderLifecycle" NOT NULL DEFAULT 'DRAFT',
    "requesterId" TEXT,
    "ownerId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detectedAt" TIMESTAMP(3),
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "rejectedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "closureSummary" TEXT,
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "canceledById" TEXT,
    "originIncidentId" TEXT,
    "originLogEntryId" TEXT,
    "originExceptionId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderArea" (
    "workOrderId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,

    CONSTRAINT "WorkOrderArea_pkey" PRIMARY KEY ("workOrderId","areaId")
);

-- CreateTable
CREATE TABLE "WorkOrderSpecialty" (
    "workOrderId" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,

    CONSTRAINT "WorkOrderSpecialty_pkey" PRIMARY KEY ("workOrderId","specialtyId")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderType_key_key" ON "WorkOrderType"("key");

-- CreateIndex
CREATE INDEX "WorkOrderType_active_idx" ON "WorkOrderType"("active");

-- CreateIndex
CREATE INDEX "WorkOrderType_deletedAt_idx" ON "WorkOrderType"("deletedAt");

-- CreateIndex
CREATE INDEX "WorkOrderType_escalationRoleId_idx" ON "WorkOrderType"("escalationRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "Area_key_key" ON "Area"("key");

-- CreateIndex
CREATE INDEX "Area_active_idx" ON "Area"("active");

-- CreateIndex
CREATE INDEX "Area_deletedAt_idx" ON "Area"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Specialty_key_key" ON "Specialty"("key");

-- CreateIndex
CREATE INDEX "Specialty_active_idx" ON "Specialty"("active");

-- CreateIndex
CREATE INDEX "Specialty_deletedAt_idx" ON "Specialty"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_number_key" ON "WorkOrder"("number");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_folio_key" ON "WorkOrder"("folio");

-- CreateIndex
CREATE INDEX "WorkOrder_typeId_idx" ON "WorkOrder"("typeId");

-- CreateIndex
CREATE INDEX "WorkOrder_orgNodeId_idx" ON "WorkOrder"("orgNodeId");

-- CreateIndex
CREATE INDEX "WorkOrder_equipmentId_idx" ON "WorkOrder"("equipmentId");

-- CreateIndex
CREATE INDEX "WorkOrder_lifecycle_idx" ON "WorkOrder"("lifecycle");

-- CreateIndex
CREATE INDEX "WorkOrder_priority_idx" ON "WorkOrder"("priority");

-- CreateIndex
CREATE INDEX "WorkOrder_criticality_idx" ON "WorkOrder"("criticality");

-- CreateIndex
CREATE INDEX "WorkOrder_ownerId_idx" ON "WorkOrder"("ownerId");

-- CreateIndex
CREATE INDEX "WorkOrder_originType_idx" ON "WorkOrder"("originType");

-- CreateIndex
CREATE INDEX "WorkOrder_originIncidentId_idx" ON "WorkOrder"("originIncidentId");

-- CreateIndex
CREATE INDEX "WorkOrder_currentStateKey_idx" ON "WorkOrder"("currentStateKey");

-- CreateIndex
CREATE INDEX "WorkOrder_createdAt_id_idx" ON "WorkOrder"("createdAt", "id");

-- CreateIndex
CREATE INDEX "WorkOrderArea_areaId_idx" ON "WorkOrderArea"("areaId");

-- CreateIndex
CREATE INDEX "WorkOrderSpecialty_specialtyId_idx" ON "WorkOrderSpecialty"("specialtyId");

-- AddForeignKey
ALTER TABLE "WorkOrderType" ADD CONSTRAINT "WorkOrderType_escalationRoleId_fkey" FOREIGN KEY ("escalationRoleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "WorkOrderType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderArea" ADD CONSTRAINT "WorkOrderArea_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderArea" ADD CONSTRAINT "WorkOrderArea_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderSpecialty" ADD CONSTRAINT "WorkOrderSpecialty_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderSpecialty" ADD CONSTRAINT "WorkOrderSpecialty_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

