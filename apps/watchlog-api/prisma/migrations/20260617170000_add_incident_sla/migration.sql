-- Incidencias 4.4 — SLA light: plazo de resolución auto + escalamiento configurable.
-- Migración ADITIVA (3 columnas en IncidentType + FK al rol de escalamiento + índice).

-- AlterTable
ALTER TABLE "IncidentType" ADD COLUMN "resolutionDueMinutes" INTEGER;
ALTER TABLE "IncidentType" ADD COLUMN "escalationAfterMinutes" INTEGER;
ALTER TABLE "IncidentType" ADD COLUMN "escalationRoleId" TEXT;

-- CreateIndex
CREATE INDEX "IncidentType_escalationRoleId_idx" ON "IncidentType"("escalationRoleId");

-- AddForeignKey
ALTER TABLE "IncidentType" ADD CONSTRAINT "IncidentType_escalationRoleId_fkey" FOREIGN KEY ("escalationRoleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
