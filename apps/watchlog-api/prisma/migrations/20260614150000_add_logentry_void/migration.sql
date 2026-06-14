-- Fase 2.8.2 — Anulación (VOID) de borradores.
-- Huella de la anulación lógica de un borrador (status pasa a VOID). NO es
-- hard-delete y NO usa deletedAt: la entrada queda trazable (recuperable por
-- filtro status=VOID), fuera de las superficies operacionales normales. El
-- AuditLog inmutable conserva el rastro. Migración ADITIVA, sin backfill.
ALTER TABLE "LogEntry"
  ADD COLUMN "voidedAt"   TIMESTAMP(3),
  ADD COLUMN "voidReason" TEXT,
  ADD COLUMN "voidedById" TEXT;
