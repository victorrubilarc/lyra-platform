-- Fase 2.7.1.1 (UX) — configuración del sistema (singleton).
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL,
    "requireMfaForPeriodGovernance" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- Fila singleton inicial (ajustes por defecto).
INSERT INTO "SystemSettings" ("id","requireMfaForPeriodGovernance","updatedAt")
VALUES ('system', false, CURRENT_TIMESTAMP);
