-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkflowVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "WorkflowDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowDefinitionVersion" (
    "id" TEXT NOT NULL,
    "workflowDefinitionId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "WorkflowVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowDefinitionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowState" (
    "id" TEXT NOT NULL,
    "workflowDefinitionVersionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isInitial" BOOLEAN NOT NULL DEFAULT false,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,

    CONSTRAINT "WorkflowState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTransition" (
    "id" TEXT NOT NULL,
    "workflowDefinitionVersionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fromStateId" TEXT NOT NULL,
    "toStateId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "requireSignature" BOOLEAN NOT NULL DEFAULT false,
    "signatureMeaning" TEXT,
    "requireMfa" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WorkflowTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTransitionRole" (
    "transitionId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "WorkflowTransitionRole_pkey" PRIMARY KEY ("transitionId","roleId")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDefinition_key_key" ON "WorkflowDefinition"("key");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDefinition_currentVersionId_key" ON "WorkflowDefinition"("currentVersionId");

-- CreateIndex
CREATE INDEX "WorkflowDefinition_status_idx" ON "WorkflowDefinition"("status");

-- CreateIndex
CREATE INDEX "WorkflowDefinition_deletedAt_idx" ON "WorkflowDefinition"("deletedAt");

-- CreateIndex
CREATE INDEX "WorkflowDefinitionVersion_workflowDefinitionId_idx" ON "WorkflowDefinitionVersion"("workflowDefinitionId");

-- CreateIndex
CREATE INDEX "WorkflowDefinitionVersion_status_idx" ON "WorkflowDefinitionVersion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDefinitionVersion_workflowDefinitionId_versionNumbe_key" ON "WorkflowDefinitionVersion"("workflowDefinitionId", "versionNumber");

-- CreateIndex
CREATE INDEX "WorkflowState_workflowDefinitionVersionId_idx" ON "WorkflowState"("workflowDefinitionVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowState_workflowDefinitionVersionId_key_key" ON "WorkflowState"("workflowDefinitionVersionId", "key");

-- CreateIndex
CREATE INDEX "WorkflowTransition_workflowDefinitionVersionId_idx" ON "WorkflowTransition"("workflowDefinitionVersionId");

-- CreateIndex
CREATE INDEX "WorkflowTransition_fromStateId_idx" ON "WorkflowTransition"("fromStateId");

-- CreateIndex
CREATE INDEX "WorkflowTransition_toStateId_idx" ON "WorkflowTransition"("toStateId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTransition_workflowDefinitionVersionId_key_key" ON "WorkflowTransition"("workflowDefinitionVersionId", "key");

-- CreateIndex
CREATE INDEX "WorkflowTransitionRole_roleId_idx" ON "WorkflowTransitionRole"("roleId");

-- CreateIndex
CREATE INDEX "TemplateVersion_workflowDefinitionId_idx" ON "TemplateVersion"("workflowDefinitionId");

-- CreateIndex
CREATE INDEX "TemplateVersion_workflowDefinitionVersionId_idx" ON "TemplateVersion"("workflowDefinitionVersionId");

-- AddForeignKey
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_workflowDefinitionId_fkey" FOREIGN KEY ("workflowDefinitionId") REFERENCES "WorkflowDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_workflowDefinitionVersionId_fkey" FOREIGN KEY ("workflowDefinitionVersionId") REFERENCES "WorkflowDefinitionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowDefinition" ADD CONSTRAINT "WorkflowDefinition_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "WorkflowDefinitionVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowDefinitionVersion" ADD CONSTRAINT "WorkflowDefinitionVersion_workflowDefinitionId_fkey" FOREIGN KEY ("workflowDefinitionId") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowState" ADD CONSTRAINT "WorkflowState_workflowDefinitionVersionId_fkey" FOREIGN KEY ("workflowDefinitionVersionId") REFERENCES "WorkflowDefinitionVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_workflowDefinitionVersionId_fkey" FOREIGN KEY ("workflowDefinitionVersionId") REFERENCES "WorkflowDefinitionVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_fromStateId_fkey" FOREIGN KEY ("fromStateId") REFERENCES "WorkflowState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_toStateId_fkey" FOREIGN KEY ("toStateId") REFERENCES "WorkflowState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTransitionRole" ADD CONSTRAINT "WorkflowTransitionRole_transitionId_fkey" FOREIGN KEY ("transitionId") REFERENCES "WorkflowTransition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTransitionRole" ADD CONSTRAINT "WorkflowTransitionRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
