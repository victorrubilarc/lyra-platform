-- Plantillas MULTI-NODO (Fase 2.8.0). Tabla N:M plantilla×nodo = fuente de verdad
-- de la visibilidad por nodo (eje de NODO del ABAC de plantilla). Aditiva.
-- `Template.orgNodeId` se conserva como nodo PRIMARIO derivado (deprecado).

-- CreateTable
CREATE TABLE "TemplateNodeAssignment" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "orgNodeId" TEXT NOT NULL,
    "includeDescendants" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TemplateNodeAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TemplateNodeAssignment_templateId_orgNodeId_key" ON "TemplateNodeAssignment"("templateId", "orgNodeId");

-- CreateIndex
CREATE INDEX "TemplateNodeAssignment_orgNodeId_idx" ON "TemplateNodeAssignment"("orgNodeId");

-- AddForeignKey
ALTER TABLE "TemplateNodeAssignment" ADD CONSTRAINT "TemplateNodeAssignment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateNodeAssignment" ADD CONSTRAINT "TemplateNodeAssignment_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: cada plantilla anclada hoy a UN nodo (orgNodeId no nulo) obtiene 1
-- asignación equivalente con includeDescendants=false (preserva EXACTO el alcance
-- actual: la plantilla era visible solo en ese nodo puntual). Las plantillas
-- globales (orgNodeId null) quedan SIN filas = GLOBAL (semántica permisiva).
-- Idempotente vía ON CONFLICT (por si se reaplica con migrate deploy).
INSERT INTO "TemplateNodeAssignment" ("id", "templateId", "orgNodeId", "includeDescendants")
SELECT md5(random()::text || clock_timestamp()::text), "id", "orgNodeId", false
FROM "Template"
WHERE "orgNodeId" IS NOT NULL
ON CONFLICT ("templateId", "orgNodeId") DO NOTHING;
