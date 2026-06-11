-- CreateEnum
CREATE TYPE "LogEntryOrigin" AS ENUM ('ONLINE', 'DEFERRED');

-- AlterTable
ALTER TABLE "LogEntry" ADD COLUMN     "declaredEffectiveAt" TIMESTAMP(3),
ADD COLUMN     "deferredDeclaredAt" TIMESTAMP(3),
ADD COLUMN     "deferredDeclaredById" TEXT,
ADD COLUMN     "deferredReason" TEXT,
ADD COLUMN     "entryOrigin" "LogEntryOrigin" NOT NULL DEFAULT 'ONLINE';

-- CreateIndex
CREATE INDEX "LogEntry_entryOrigin_idx" ON "LogEntry"("entryOrigin");
