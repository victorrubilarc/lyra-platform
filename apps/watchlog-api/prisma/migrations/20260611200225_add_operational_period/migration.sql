-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSING', 'CLOSED');

-- CreateTable
CREATE TABLE "OperationalPeriod" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT,
    "reopenedById" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperationalPeriod_calendarId_status_idx" ON "OperationalPeriod"("calendarId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalPeriod_calendarId_periodKey_key" ON "OperationalPeriod"("calendarId", "periodKey");

-- AddForeignKey
ALTER TABLE "OperationalPeriod" ADD CONSTRAINT "OperationalPeriod_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "OperationalCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
