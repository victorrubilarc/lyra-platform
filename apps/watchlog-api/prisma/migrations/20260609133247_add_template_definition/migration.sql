-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TemplateVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('NUMBER', 'TEXT', 'TEXTAREA', 'SELECT', 'MULTISELECT', 'BOOLEAN', 'DATE', 'DATETIME', 'SEVERITY', 'SIGNATURE');

-- CreateEnum
CREATE TYPE "RecurrenceKind" AS ENUM ('NONE', 'SHIFT', 'INTERVAL', 'CALENDAR');

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "orgNodeId" TEXT,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "TemplateVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "workflowDefinitionId" TEXT,
    "workflowDefinitionVersionId" TEXT,
    "requireSignature" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceKind" "RecurrenceKind" NOT NULL DEFAULT 'NONE',
    "recurrenceConfig" JSONB,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateSection" (
    "id" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "requireSignature" BOOLEAN NOT NULL DEFAULT false,
    "editableInStateKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateField" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" "FieldType" NOT NULL,
    "label" TEXT NOT NULL,
    "help" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL DEFAULT '{}',
    "visibleWhen" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateSectionRole" (
    "sectionId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "TemplateSectionRole_pkey" PRIMARY KEY ("sectionId","roleId")
);

-- CreateTable
CREATE TABLE "TemplateFieldRole" (
    "fieldId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "TemplateFieldRole_pkey" PRIMARY KEY ("fieldId","roleId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Template_currentVersionId_key" ON "Template"("currentVersionId");

-- CreateIndex
CREATE INDEX "Template_orgNodeId_idx" ON "Template"("orgNodeId");

-- CreateIndex
CREATE INDEX "Template_status_idx" ON "Template"("status");

-- CreateIndex
CREATE INDEX "Template_deletedAt_idx" ON "Template"("deletedAt");

-- CreateIndex
CREATE INDEX "TemplateVersion_templateId_idx" ON "TemplateVersion"("templateId");

-- CreateIndex
CREATE INDEX "TemplateVersion_status_idx" ON "TemplateVersion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateVersion_templateId_versionNumber_key" ON "TemplateVersion"("templateId", "versionNumber");

-- CreateIndex
CREATE INDEX "TemplateSection_templateVersionId_idx" ON "TemplateSection"("templateVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateSection_templateVersionId_key_key" ON "TemplateSection"("templateVersionId", "key");

-- CreateIndex
CREATE INDEX "TemplateField_sectionId_idx" ON "TemplateField"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateField_sectionId_key_key" ON "TemplateField"("sectionId", "key");

-- CreateIndex
CREATE INDEX "TemplateSectionRole_roleId_idx" ON "TemplateSectionRole"("roleId");

-- CreateIndex
CREATE INDEX "TemplateFieldRole_roleId_idx" ON "TemplateFieldRole"("roleId");

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "TemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateSection" ADD CONSTRAINT "TemplateSection_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "TemplateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateField" ADD CONSTRAINT "TemplateField_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "TemplateSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateSectionRole" ADD CONSTRAINT "TemplateSectionRole_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "TemplateSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateSectionRole" ADD CONSTRAINT "TemplateSectionRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateFieldRole" ADD CONSTRAINT "TemplateFieldRole_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "TemplateField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateFieldRole" ADD CONSTRAINT "TemplateFieldRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
