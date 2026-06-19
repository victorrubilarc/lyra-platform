-- Cambio de turno / Shift Handover (Fase 5 — Slice 1). Migración ADITIVA:
-- 3 enums + 3 tablas (ShiftHandover/Item/Activity) + índices + FKs. Sin tocar
-- datos existentes. (Se removió del diff un DROP INDEX ajeno de drift previo.)

-- CreateEnum
CREATE TYPE "ShiftHandoverStatus" AS ENUM ('COMPILING', 'SIGNED_OUT', 'ACKNOWLEDGED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ShiftHandoverItemStatus" AS ENUM ('OPEN', 'CARRIED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ShiftHandoverItemSource" AS ENUM ('MANUAL', 'INCIDENT', 'INCIDENT_ACTION', 'EXCEPTION', 'INCIDENT_REPORT', 'ROUND');


-- CreateTable
CREATE TABLE "ShiftHandover" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "orgNodeId" TEXT NOT NULL,
    "shiftCode" TEXT,
    "shiftLabel" TEXT,
    "incomingShiftCode" TEXT,
    "operationalDay" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "calendarId" TEXT,
    "status" "ShiftHandoverStatus" NOT NULL DEFAULT 'COMPILING',
    "generalStatus" TEXT,
    "summaryText" TEXT,
    "summaryProvider" TEXT,
    "snapshot" JSONB,
    "snapshotAt" TIMESTAMP(3),
    "outgoingById" TEXT,
    "outgoingByName" TEXT,
    "signedOutAt" TIMESTAMP(3),
    "signOutMeaning" TEXT,
    "signOutMethod" TEXT,
    "incomingById" TEXT,
    "incomingByName" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "ackMeaning" TEXT,
    "ackMethod" TEXT,
    "ackReadSummary" BOOLEAN NOT NULL DEFAULT false,
    "ackReviewedItems" BOOLEAN NOT NULL DEFAULT false,
    "ackNoObservations" BOOLEAN NOT NULL DEFAULT false,
    "ackObservations" TEXT,
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "canceledById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftHandoverItem" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "source" "ShiftHandoverItemSource" NOT NULL,
    "status" "ShiftHandoverItemStatus" NOT NULL DEFAULT 'OPEN',
    "refType" TEXT,
    "refId" TEXT,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "category" TEXT,
    "severity" INTEGER,
    "originHandoverId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftHandoverItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftHandoverActivity" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftHandoverActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftHandover_number_key" ON "ShiftHandover"("number");

-- CreateIndex
CREATE INDEX "ShiftHandover_orgNodeId_operationalDay_idx" ON "ShiftHandover"("orgNodeId", "operationalDay");

-- CreateIndex
CREATE INDEX "ShiftHandover_status_idx" ON "ShiftHandover"("status");

-- CreateIndex
CREATE INDEX "ShiftHandover_createdAt_id_idx" ON "ShiftHandover"("createdAt", "id");

-- CreateIndex
CREATE INDEX "ShiftHandoverItem_handoverId_idx" ON "ShiftHandoverItem"("handoverId");

-- CreateIndex
CREATE INDEX "ShiftHandoverItem_refType_refId_idx" ON "ShiftHandoverItem"("refType", "refId");

-- CreateIndex
CREATE INDEX "ShiftHandoverActivity_handoverId_occurredAt_idx" ON "ShiftHandoverActivity"("handoverId", "occurredAt");

-- AddForeignKey
ALTER TABLE "ShiftHandover" ADD CONSTRAINT "ShiftHandover_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftHandoverItem" ADD CONSTRAINT "ShiftHandoverItem_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "ShiftHandover"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftHandoverActivity" ADD CONSTRAINT "ShiftHandoverActivity_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "ShiftHandover"("id") ON DELETE CASCADE ON UPDATE CASCADE;