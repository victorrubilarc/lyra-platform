-- DropIndex
DROP INDEX "LogEntry_currentStateSince_idx";

-- AlterTable
ALTER TABLE "OrgStructure" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "LicenseInstallation" (
    "id" TEXT NOT NULL DEFAULT 'system',
    "installationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "renewalCounter" INTEGER NOT NULL DEFAULT 0,
    "nonce" TEXT,
    "lastRenewalAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LicenseInstallation_pkey" PRIMARY KEY ("id")
);
