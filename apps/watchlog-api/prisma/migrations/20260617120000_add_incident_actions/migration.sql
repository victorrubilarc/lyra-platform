-- CreateEnum
CREATE TYPE "IncidentActionKind" AS ENUM ('CORRECTIVE', 'PREVENTIVE', 'IMMEDIATE');

-- CreateEnum
CREATE TYPE "IncidentActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'VERIFIED', 'CANCELED');

-- CreateEnum
CREATE TYPE "IncidentActionOutcome" AS ENUM ('EFFECTIVE', 'NOT_EFFECTIVE');

-- CreateTable
CREATE TABLE "IncidentAction" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "incidentId" TEXT NOT NULL,
    "kind" "IncidentActionKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "responsibleId" TEXT,
    "responsibleRoleId" TEXT,
    "dueAt" TIMESTAMP(3),
    "status" "IncidentActionStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "completionNote" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "effectivenessOutcome" "IncidentActionOutcome",
    "verificationNote" TEXT,
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "canceledById" TEXT,
    "evidence" JSONB,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IncidentAction_number_key" ON "IncidentAction"("number");

-- CreateIndex
CREATE INDEX "IncidentAction_incidentId_createdAt_idx" ON "IncidentAction"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX "IncidentAction_status_idx" ON "IncidentAction"("status");

-- CreateIndex
CREATE INDEX "IncidentAction_responsibleId_idx" ON "IncidentAction"("responsibleId");

-- CreateIndex
CREATE INDEX "IncidentAction_responsibleRoleId_idx" ON "IncidentAction"("responsibleRoleId");

-- CreateIndex
CREATE INDEX "IncidentAction_mandatory_status_idx" ON "IncidentAction"("mandatory", "status");

-- AddForeignKey
ALTER TABLE "IncidentAction" ADD CONSTRAINT "IncidentAction_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentAction" ADD CONSTRAINT "IncidentAction_responsibleRoleId_fkey" FOREIGN KEY ("responsibleRoleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
