-- Fase 2.7.1.1 (UX) — MFA de gobernanza de período POR ACCIÓN (reemplaza el flag único).
ALTER TABLE "SystemSettings" ADD COLUMN "requireMfaPeriodClose" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SystemSettings" ADD COLUMN "requireMfaPeriodReopen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SystemSettings" ADD COLUMN "requireMfaPeriodLock" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SystemSettings" ADD COLUMN "requireMfaPeriodUnlock" BOOLEAN NOT NULL DEFAULT false;

-- Migrar el valor del flag único a las 4 acciones (preserva la intención si estaba activo).
UPDATE "SystemSettings" SET
  "requireMfaPeriodClose"  = "requireMfaForPeriodGovernance",
  "requireMfaPeriodReopen" = "requireMfaForPeriodGovernance",
  "requireMfaPeriodLock"   = "requireMfaForPeriodGovernance",
  "requireMfaPeriodUnlock" = "requireMfaForPeriodGovernance";

ALTER TABLE "SystemSettings" DROP COLUMN "requireMfaForPeriodGovernance";
