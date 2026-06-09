-- CreateEnum
CREATE TYPE "ReferenceSource" AS ENUM ('MANUAL', 'EXTERNAL');

-- CreateTable
CREATE TABLE "ReferenceList" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "ReferenceSource" NOT NULL DEFAULT 'MANUAL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ReferenceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceItem" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferenceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceList_key_key" ON "ReferenceList"("key");

-- CreateIndex
CREATE INDEX "ReferenceList_deletedAt_idx" ON "ReferenceList"("deletedAt");

-- CreateIndex
CREATE INDEX "ReferenceItem_listId_idx" ON "ReferenceItem"("listId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceItem_listId_code_key" ON "ReferenceItem"("listId", "code");

-- AddForeignKey
ALTER TABLE "ReferenceItem" ADD CONSTRAINT "ReferenceItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ReferenceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
