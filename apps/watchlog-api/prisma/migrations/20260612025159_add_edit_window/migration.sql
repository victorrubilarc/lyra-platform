-- CreateEnum
CREATE TYPE "EditWindowAnchor" AS ENUM ('RECORDED', 'EFFECTIVE');

-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN     "editWindowAnchor" "EditWindowAnchor" NOT NULL DEFAULT 'RECORDED',
ADD COLUMN     "editWindowHours" INTEGER,
ADD COLUMN     "requireMfaEditWindowOverride" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "id" SET DEFAULT 'system',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "editWindowAnchor" "EditWindowAnchor",
ADD COLUMN     "editWindowHours" INTEGER;

-- Rango defensivo en BD (espejo del contrato Zod): 0..8760 horas (1 anno).
ALTER TABLE "Template" ADD CONSTRAINT "Template_editWindowHours_range"
  CHECK ("editWindowHours" IS NULL OR ("editWindowHours" >= 0 AND "editWindowHours" <= 8760));
ALTER TABLE "SystemSettings" ADD CONSTRAINT "SystemSettings_editWindowHours_range"
  CHECK ("editWindowHours" IS NULL OR ("editWindowHours" >= 0 AND "editWindowHours" <= 8760));
