-- CreateEnum
CREATE TYPE "CompetencyCategory" AS ENUM ('CERTIFICATION', 'TRAINING', 'MEDICAL_EXAM', 'INDUCTION', 'LICENSE');

-- CreateEnum
CREATE TYPE "RestrictionType" AS ENUM ('MEDICAL', 'DISCIPLINARY', 'SITE_BAN', 'OTHER');

-- CreateTable
CREATE TABLE "CompetencyType" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "CompetencyCategory" NOT NULL,
    "defaultValidityDays" INTEGER,
    "requiresExpiry" BOOLEAN NOT NULL DEFAULT true,
    "warningLeadDays" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CompetencyType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonCompetency" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "competencyTypeId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "certificateNumber" TEXT,
    "issuedBy" TEXT,
    "evidence" JSONB,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PersonCompetency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonRestriction" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" "RestrictionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PersonRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderCompetencyRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "competencyTypeId" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "appliesToTypeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minCriticality" INTEGER,
    "specialtyId" TEXT,
    "requiresPtw" BOOLEAN,
    "appliesToRosterRoleId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WorkOrderCompetencyRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetencyType_key_key" ON "CompetencyType"("key");

-- CreateIndex
CREATE INDEX "CompetencyType_category_idx" ON "CompetencyType"("category");

-- CreateIndex
CREATE INDEX "CompetencyType_active_idx" ON "CompetencyType"("active");

-- CreateIndex
CREATE INDEX "CompetencyType_deletedAt_idx" ON "CompetencyType"("deletedAt");

-- CreateIndex
CREATE INDEX "PersonCompetency_personId_idx" ON "PersonCompetency"("personId");

-- CreateIndex
CREATE INDEX "PersonCompetency_competencyTypeId_idx" ON "PersonCompetency"("competencyTypeId");

-- CreateIndex
CREATE INDEX "PersonCompetency_expiresAt_idx" ON "PersonCompetency"("expiresAt");

-- CreateIndex
CREATE INDEX "PersonCompetency_deletedAt_idx" ON "PersonCompetency"("deletedAt");

-- CreateIndex
CREATE INDEX "PersonRestriction_personId_idx" ON "PersonRestriction"("personId");

-- CreateIndex
CREATE INDEX "PersonRestriction_active_idx" ON "PersonRestriction"("active");

-- CreateIndex
CREATE INDEX "PersonRestriction_endsAt_idx" ON "PersonRestriction"("endsAt");

-- CreateIndex
CREATE INDEX "PersonRestriction_deletedAt_idx" ON "PersonRestriction"("deletedAt");

-- CreateIndex
CREATE INDEX "WorkOrderCompetencyRule_competencyTypeId_idx" ON "WorkOrderCompetencyRule"("competencyTypeId");

-- CreateIndex
CREATE INDEX "WorkOrderCompetencyRule_specialtyId_idx" ON "WorkOrderCompetencyRule"("specialtyId");

-- CreateIndex
CREATE INDEX "WorkOrderCompetencyRule_appliesToRosterRoleId_idx" ON "WorkOrderCompetencyRule"("appliesToRosterRoleId");

-- CreateIndex
CREATE INDEX "WorkOrderCompetencyRule_active_idx" ON "WorkOrderCompetencyRule"("active");

-- CreateIndex
CREATE INDEX "WorkOrderCompetencyRule_deletedAt_idx" ON "WorkOrderCompetencyRule"("deletedAt");

-- AddForeignKey
ALTER TABLE "PersonCompetency" ADD CONSTRAINT "PersonCompetency_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonCompetency" ADD CONSTRAINT "PersonCompetency_competencyTypeId_fkey" FOREIGN KEY ("competencyTypeId") REFERENCES "CompetencyType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonRestriction" ADD CONSTRAINT "PersonRestriction_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderCompetencyRule" ADD CONSTRAINT "WorkOrderCompetencyRule_competencyTypeId_fkey" FOREIGN KEY ("competencyTypeId") REFERENCES "CompetencyType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderCompetencyRule" ADD CONSTRAINT "WorkOrderCompetencyRule_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderCompetencyRule" ADD CONSTRAINT "WorkOrderCompetencyRule_appliesToRosterRoleId_fkey" FOREIGN KEY ("appliesToRosterRoleId") REFERENCES "RosterRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

