-- Template.purpose (fork W5): marcador de UX (CHECKLIST) para filtrar el picker de
-- reglas de checklist de OT. null = general. Se descarta el drift preexistente ajeno
-- del diff (LogEntry_currentStateSince_idx, OrgStructure.updatedAt) — ver DECISIONS 2026-07-01 S1.

-- CreateEnum
CREATE TYPE "TemplatePurpose" AS ENUM ('CHECKLIST');

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "purpose" "TemplatePurpose";
