-- Bloque N hardening — config de correo saliente (SMTP) en SystemSettings (aditiva).

-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN     "emailConfiguredAt" TIMESTAMP(3),
ADD COLUMN     "emailConfiguredById" TEXT,
ADD COLUMN     "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailFromEmail" TEXT,
ADD COLUMN     "emailFromName" TEXT,
ADD COLUMN     "emailHost" TEXT,
ADD COLUMN     "emailPasswordEnc" TEXT,
ADD COLUMN     "emailPort" INTEGER,
ADD COLUMN     "emailSecure" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailService" TEXT,
ADD COLUMN     "emailUser" TEXT;

