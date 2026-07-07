-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN     "companyDisplayName" TEXT,
ADD COLUMN     "defaultLocale" TEXT,
ADD COLUMN     "defaultThemeMode" TEXT,
ADD COLUMN     "defaultTimezone" TEXT;

-- CreateTable
CREATE TABLE "SystemSetup" (
    "id" TEXT NOT NULL DEFAULT 'system',
    "setupCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "tokenHash" TEXT,
    "tokenFailedCount" INTEGER NOT NULL DEFAULT 0,
    "tokenLockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetup_pkey" PRIMARY KEY ("id")
);

-- OOBE retro-completado: una instalacion EXISTENTE (ya tiene usuarios) marca el
-- asistente como completado desde el origen; el wizard es SOLO para instalaciones
-- virgenes (0 usuarios). Cualquier usuario cuenta (ACTIVE o DISABLED): si alguien
-- existe, el bootstrap ya ocurrio por el camino antiguo.
INSERT INTO "SystemSetup" ("id", "setupCompleted", "completedAt", "updatedAt")
SELECT 'system', EXISTS (SELECT 1 FROM "User"),
       CASE WHEN EXISTS (SELECT 1 FROM "User") THEN CURRENT_TIMESTAMP ELSE NULL END,
       CURRENT_TIMESTAMP
ON CONFLICT ("id") DO NOTHING;
