-- OT Sesión 2 (Puerta 1): satélites de workflow de la OT + motor de folio gapless.
--  * WorkOrderTransition: historial de transiciones (espejo de IncidentTransition).
--  * WorkOrderEvent: timeline append-only (espejo de IncidentActivity).
--  * FolioCounter: contador atómico por secuencia (INSERT ... ON CONFLICT ... RETURNING).
-- Generada con `prisma migrate diff` (patrón S1, gotcha EPERM Windows), descartando el
-- drift preexistente ajeno (LogEntry_currentStateSince_idx, default de OrgStructure.updatedAt).

-- CreateTable
CREATE TABLE "WorkOrderTransition" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "workflowDefinitionVersionId" TEXT NOT NULL,
    "transitionKey" TEXT NOT NULL,
    "fromStateKey" TEXT NOT NULL,
    "toStateKey" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "reason" TEXT,
    "signatureId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderEvent" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FolioCounter" (
    "sequenceKey" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FolioCounter_pkey" PRIMARY KEY ("sequenceKey")
);

-- CreateIndex
CREATE INDEX "WorkOrderTransition_workOrderId_occurredAt_idx" ON "WorkOrderTransition"("workOrderId", "occurredAt");

-- CreateIndex
CREATE INDEX "WorkOrderEvent_workOrderId_occurredAt_idx" ON "WorkOrderEvent"("workOrderId", "occurredAt");

-- AddForeignKey
ALTER TABLE "WorkOrderTransition" ADD CONSTRAINT "WorkOrderTransition_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderEvent" ADD CONSTRAINT "WorkOrderEvent_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
