-- Fase 2.8.0.2 — Modo de equipo por plantilla (gobernanza del objeto de referencia EAM).
-- Aditiva: enum nuevo + columna con default OPTIONAL (preserva el comportamiento
-- contextual de 2.8.0.1 en las plantillas ya publicadas, cero ruptura).

-- CreateEnum
CREATE TYPE "EquipmentMode" AS ENUM ('NONE', 'OPTIONAL', 'SUGGESTED', 'REQUIRED');

-- AlterTable
ALTER TABLE "Template" ADD COLUMN "equipmentMode" "EquipmentMode" NOT NULL DEFAULT 'OPTIONAL';
