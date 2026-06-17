-- CreateEnum
CREATE TYPE "IncidentInvestigationMethod" AS ENUM ('FIVE_WHYS');

-- CreateEnum
CREATE TYPE "IncidentInvestigationStatus" AS ENUM ('DRAFT', 'COMPLETED');

-- AlterTable
ALTER TABLE "IncidentAction" ADD COLUMN "investigationStepId" TEXT;

-- CreateTable
CREATE TABLE "IncidentInvestigation" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "method" "IncidentInvestigationMethod" NOT NULL DEFAULT 'FIVE_WHYS',
    "status" "IncidentInvestigationStatus" NOT NULL DEFAULT 'DRAFT',
    "problemStatement" TEXT NOT NULL,
    "rootCauseSummary" TEXT,
    "conductedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentInvestigation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentInvestigationStep" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "statement" TEXT NOT NULL,
    "answer" TEXT,
    "isRootCause" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentInvestigationStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IncidentInvestigation_incidentId_key" ON "IncidentInvestigation"("incidentId");

-- CreateIndex
CREATE INDEX "IncidentInvestigation_status_idx" ON "IncidentInvestigation"("status");

-- CreateIndex
CREATE INDEX "IncidentInvestigationStep_investigationId_order_idx" ON "IncidentInvestigationStep"("investigationId", "order");

-- CreateIndex
CREATE INDEX "IncidentInvestigationStep_isRootCause_idx" ON "IncidentInvestigationStep"("isRootCause");

-- CreateIndex
CREATE INDEX "IncidentAction_investigationStepId_idx" ON "IncidentAction"("investigationStepId");

-- AddForeignKey
ALTER TABLE "IncidentAction" ADD CONSTRAINT "IncidentAction_investigationStepId_fkey" FOREIGN KEY ("investigationStepId") REFERENCES "IncidentInvestigationStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentInvestigation" ADD CONSTRAINT "IncidentInvestigation_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentInvestigationStep" ADD CONSTRAINT "IncidentInvestigationStep_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "IncidentInvestigation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
