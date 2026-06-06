-- CreateEnum
CREATE TYPE "MfaMode" AS ENUM ('OPTIONAL', 'REQUIRED_BY_ROLE', 'REQUIRED_FOR_ALL');

-- AlterTable
ALTER TABLE "PasswordPolicy" ADD COLUMN     "mfaMode" "MfaMode" NOT NULL DEFAULT 'OPTIONAL';

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "requireMfa" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mfaFailedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mfaLockedUntil" TIMESTAMP(3);
