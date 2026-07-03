-- Dotacion · Slice 3 — GATE de acreditacion de EMPRESA contratista (toggle por tipo de OT).
-- Espejo de rosterEnabled: sin esto la acreditacion es SOLO informativa (cero regresion).
-- Traza: Ley 16.744 art.66 bis (el mandante VERIFICA el cumplimiento del contratista) +
-- prequalification ISN/Avetta/Veriforce (cada cliente fija su umbral).

-- AlterTable
ALTER TABLE "WorkOrderType" ADD COLUMN     "requireCompanyAccreditation" BOOLEAN NOT NULL DEFAULT false;
