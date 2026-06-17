-- CreateEnum
CREATE TYPE "IncidentReportStatus" AS ENUM ('PENDING', 'SUBMITTED', 'NOT_APPLICABLE', 'CANCELED');

-- CreateTable
CREATE TABLE "ReportingObligation" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "authorityName" TEXT,
    "defaultDueMinutes" INTEGER,
    "appliesToTypeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minSeverity" INTEGER,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ReportingObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentReport" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "incidentId" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "obligationName" TEXT NOT NULL,
    "authorityName" TEXT,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "status" "IncidentReportStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "externalFolio" TEXT,
    "notes" TEXT,
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "canceledById" TEXT,
    "evidence" JSONB,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportingObligation_key_key" ON "ReportingObligation"("key");

-- CreateIndex
CREATE INDEX "ReportingObligation_active_idx" ON "ReportingObligation"("active");

-- CreateIndex
CREATE INDEX "ReportingObligation_deletedAt_idx" ON "ReportingObligation"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentReport_number_key" ON "IncidentReport"("number");

-- CreateIndex
CREATE INDEX "IncidentReport_incidentId_createdAt_idx" ON "IncidentReport"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX "IncidentReport_status_dueAt_idx" ON "IncidentReport"("status", "dueAt");

-- CreateIndex
CREATE INDEX "IncidentReport_obligationId_idx" ON "IncidentReport"("obligationId");

-- CreateIndex
CREATE INDEX "IncidentReport_mandatory_status_idx" ON "IncidentReport"("mandatory", "status");

-- AddForeignKey
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "ReportingObligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
