-- Incidencias: fecha/hora en que OCURRIÓ el evento (ISO 14224 / HSE), distinta de
-- createdAt (cuándo se reportó). Migración ADITIVA.

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN "occurredAt" TIMESTAMP(3);
