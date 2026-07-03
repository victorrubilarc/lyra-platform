-- CreateEnum
CREATE TYPE "PersonKind" AS ENUM ('INTERNAL', 'CONTRACTOR');

-- CreateEnum
CREATE TYPE "AccreditationStatus" AS ENUM ('ACCREDITED', 'CONDITIONAL', 'SUSPENDED', 'EXPIRED', 'NONE');

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "rosterConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "rosterConfirmedById" TEXT;

-- AlterTable
ALTER TABLE "WorkOrderType" ADD COLUMN     "rosterEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "kind" "PersonKind" NOT NULL DEFAULT 'INTERNAL',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "nationalId" TEXT,
    "personnelCode" TEXT,
    "badgeId" TEXT,
    "jobTitle" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "contractorCompanyId" TEXT,
    "userId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorCompany" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "accreditationStatus" "AccreditationStatus" NOT NULL DEFAULT 'NONE',
    "accreditationGrade" TEXT,
    "accreditedUntil" TIMESTAMP(3),
    "externalProvider" TEXT,
    "accreditationNote" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ContractorCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterRole" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSupervisorRole" BOOLEAN NOT NULL DEFAULT false,
    "mustRemainOutside" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RosterRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderWorker" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "rosterRoleId" TEXT NOT NULL,
    "note" TEXT,
    "addedById" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,
    "removeReason" TEXT,
    "overrideReason" TEXT,
    "overrideById" TEXT,
    "overrideAt" TIMESTAMP(3),
    "overrideSignatureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrderWorker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Person_kind_idx" ON "Person"("kind");

-- CreateIndex
CREATE INDEX "Person_contractorCompanyId_idx" ON "Person"("contractorCompanyId");

-- CreateIndex
CREATE INDEX "Person_active_idx" ON "Person"("active");

-- CreateIndex
CREATE INDEX "Person_deletedAt_idx" ON "Person"("deletedAt");

-- CreateIndex
CREATE INDEX "Person_nationalId_idx" ON "Person"("nationalId");

-- CreateIndex
CREATE INDEX "Person_fullName_idx" ON "Person"("fullName");

-- CreateIndex
CREATE UNIQUE INDEX "ContractorCompany_key_key" ON "ContractorCompany"("key");

-- CreateIndex
CREATE INDEX "ContractorCompany_active_idx" ON "ContractorCompany"("active");

-- CreateIndex
CREATE INDEX "ContractorCompany_accreditationStatus_idx" ON "ContractorCompany"("accreditationStatus");

-- CreateIndex
CREATE INDEX "ContractorCompany_deletedAt_idx" ON "ContractorCompany"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RosterRole_key_key" ON "RosterRole"("key");

-- CreateIndex
CREATE INDEX "RosterRole_active_idx" ON "RosterRole"("active");

-- CreateIndex
CREATE INDEX "RosterRole_deletedAt_idx" ON "RosterRole"("deletedAt");

-- CreateIndex
CREATE INDEX "WorkOrderWorker_workOrderId_idx" ON "WorkOrderWorker"("workOrderId");

-- CreateIndex
CREATE INDEX "WorkOrderWorker_personId_idx" ON "WorkOrderWorker"("personId");

-- CreateIndex
CREATE INDEX "WorkOrderWorker_removedAt_idx" ON "WorkOrderWorker"("removedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderWorker_workOrderId_personId_rosterRoleId_key" ON "WorkOrderWorker"("workOrderId", "personId", "rosterRoleId");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_contractorCompanyId_fkey" FOREIGN KEY ("contractorCompanyId") REFERENCES "ContractorCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderWorker" ADD CONSTRAINT "WorkOrderWorker_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderWorker" ADD CONSTRAINT "WorkOrderWorker_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderWorker" ADD CONSTRAINT "WorkOrderWorker_rosterRoleId_fkey" FOREIGN KEY ("rosterRoleId") REFERENCES "RosterRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

