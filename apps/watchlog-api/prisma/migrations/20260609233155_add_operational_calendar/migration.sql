-- CreateEnum
CREATE TYPE "PeriodKind" AS ENUM ('MONTH', 'WEEK', 'CUSTOM');

-- AlterTable
ALTER TABLE "OrgNode" ADD COLUMN     "operationalCalendarId" TEXT;

-- CreateTable
CREATE TABLE "OperationalCalendar" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "timezone" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "dayStartShiftCode" TEXT,
    "periodKind" "PeriodKind" NOT NULL DEFAULT 'MONTH',
    "periodAnchorDay" INTEGER DEFAULT 1,
    "periodStartWeekday" INTEGER DEFAULT 1,
    "periodLengthDays" INTEGER,
    "periodAnchorDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "OperationalCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalShift" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OperationalShift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperationalCalendar_key_key" ON "OperationalCalendar"("key");

-- CreateIndex
CREATE INDEX "OperationalCalendar_deletedAt_idx" ON "OperationalCalendar"("deletedAt");

-- CreateIndex
CREATE INDEX "OperationalShift_calendarId_idx" ON "OperationalShift"("calendarId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalShift_calendarId_code_key" ON "OperationalShift"("calendarId", "code");

-- CreateIndex
CREATE INDEX "OrgNode_operationalCalendarId_idx" ON "OrgNode"("operationalCalendarId");

-- AddForeignKey
ALTER TABLE "OrgNode" ADD CONSTRAINT "OrgNode_operationalCalendarId_fkey" FOREIGN KEY ("operationalCalendarId") REFERENCES "OperationalCalendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalShift" ADD CONSTRAINT "OperationalShift_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "OperationalCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
