-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN     "logoContentType" TEXT,
ADD COLUMN     "logoData" BYTEA,
ADD COLUMN     "logoUpdatedAt" TIMESTAMP(3);
