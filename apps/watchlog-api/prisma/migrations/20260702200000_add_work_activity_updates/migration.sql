-- CreateTable
CREATE TABLE "WorkActivityUpdate" (
    "id" TEXT NOT NULL,
    "workActivityId" TEXT NOT NULL,
    "status" "WorkActivityStatus",
    "progressPct" INTEGER,
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "note" TEXT,
    "deviation" TEXT,
    "delayReason" TEXT,
    "hoursSpent" DECIMAL(10,2),
    "cost" DECIMAL(14,2),
    "evidence" JSONB,
    "authorId" TEXT,
    "authorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkActivityUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkActivityUpdate_workActivityId_createdAt_idx" ON "WorkActivityUpdate"("workActivityId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkActivityUpdate" ADD CONSTRAINT "WorkActivityUpdate_workActivityId_fkey" FOREIGN KEY ("workActivityId") REFERENCES "WorkActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

