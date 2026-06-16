-- Fase 4.0 — Incidencias operacionales / HSE (núcleo). Migración ADITIVA.
-- (Se quitó del diff un DROP INDEX "LogEntry_currentStateSince_idx" AJENO, drift de otra rama.)

-- CreateEnum
CREATE TYPE "IncidentPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentOrigin" AS ENUM ('MANUAL', 'LOG_ENTRY', 'EXCEPTION', 'RULE');

-- CreateEnum
CREATE TYPE "IncidentLifecycle" AS ENUM ('OPEN', 'CLOSED', 'CANCELED');


-- CreateTable
CREATE TABLE "IncidentType" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "defaultWorkflowId" TEXT,
    "requiresInvestigation" BOOLEAN NOT NULL DEFAULT false,
    "requiresCapa" BOOLEAN NOT NULL DEFAULT false,
    "reportableDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "IncidentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "typeId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "IncidentCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "typeId" TEXT NOT NULL,
    "categoryId" TEXT,
    "severity" INTEGER NOT NULL,
    "potentialSeverity" INTEGER,
    "priority" "IncidentPriority" NOT NULL DEFAULT 'MEDIUM',
    "riskProbability" INTEGER,
    "riskConsequence" INTEGER,
    "originType" "IncidentOrigin" NOT NULL DEFAULT 'MANUAL',
    "lifecycle" "IncidentLifecycle" NOT NULL DEFAULT 'OPEN',
    "workflowDefinitionId" TEXT,
    "workflowDefinitionVersionId" TEXT,
    "currentStateKey" TEXT,
    "currentStateSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orgNodeId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "shiftCode" TEXT,
    "originLogEntryId" TEXT,
    "reporterId" TEXT,
    "ownerId" TEXT,
    "dueAt" TIMESTAMP(3),
    "reportable" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "closureSummary" TEXT,
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "canceledById" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentComment" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentActivity" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentTransition" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "workflowDefinitionVersionId" TEXT NOT NULL,
    "transitionKey" TEXT NOT NULL,
    "fromStateKey" TEXT NOT NULL,
    "toStateKey" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "reason" TEXT,
    "signatureId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentTransition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IncidentType_key_key" ON "IncidentType"("key");

-- CreateIndex
CREATE INDEX "IncidentType_active_idx" ON "IncidentType"("active");

-- CreateIndex
CREATE INDEX "IncidentType_deletedAt_idx" ON "IncidentType"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentCategory_key_key" ON "IncidentCategory"("key");

-- CreateIndex
CREATE INDEX "IncidentCategory_typeId_idx" ON "IncidentCategory"("typeId");

-- CreateIndex
CREATE INDEX "IncidentCategory_active_idx" ON "IncidentCategory"("active");

-- CreateIndex
CREATE INDEX "IncidentCategory_deletedAt_idx" ON "IncidentCategory"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_number_key" ON "Incident"("number");

-- CreateIndex
CREATE INDEX "Incident_typeId_idx" ON "Incident"("typeId");

-- CreateIndex
CREATE INDEX "Incident_categoryId_idx" ON "Incident"("categoryId");

-- CreateIndex
CREATE INDEX "Incident_orgNodeId_idx" ON "Incident"("orgNodeId");

-- CreateIndex
CREATE INDEX "Incident_equipmentId_idx" ON "Incident"("equipmentId");

-- CreateIndex
CREATE INDEX "Incident_lifecycle_idx" ON "Incident"("lifecycle");

-- CreateIndex
CREATE INDEX "Incident_priority_idx" ON "Incident"("priority");

-- CreateIndex
CREATE INDEX "Incident_severity_idx" ON "Incident"("severity");

-- CreateIndex
CREATE INDEX "Incident_ownerId_idx" ON "Incident"("ownerId");

-- CreateIndex
CREATE INDEX "Incident_originType_idx" ON "Incident"("originType");

-- CreateIndex
CREATE INDEX "Incident_originLogEntryId_idx" ON "Incident"("originLogEntryId");

-- CreateIndex
CREATE INDEX "Incident_currentStateKey_idx" ON "Incident"("currentStateKey");

-- CreateIndex
CREATE INDEX "Incident_createdAt_id_idx" ON "Incident"("createdAt", "id");

-- CreateIndex
CREATE INDEX "IncidentComment_incidentId_createdAt_idx" ON "IncidentComment"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX "IncidentActivity_incidentId_occurredAt_idx" ON "IncidentActivity"("incidentId", "occurredAt");

-- CreateIndex
CREATE INDEX "IncidentTransition_incidentId_occurredAt_idx" ON "IncidentTransition"("incidentId", "occurredAt");

-- AddForeignKey
ALTER TABLE "IncidentCategory" ADD CONSTRAINT "IncidentCategory_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "IncidentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "IncidentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "IncidentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentComment" ADD CONSTRAINT "IncidentComment_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentActivity" ADD CONSTRAINT "IncidentActivity_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentTransition" ADD CONSTRAINT "IncidentTransition_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

