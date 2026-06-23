-- Fase multi-estructura organizacional (2026-06-23).
-- Migración ADITIVA y NO-DESTRUCTIVA: introduce `OrgStructure` y ata niveles, nodos y
-- calendarios a una estructura. Crea una "Estructura por defecto" que ABSORBE todos los
-- datos legados (cero pérdida): niveles, nodos, scopes (vía nodo), asignaciones de
-- plantilla (vía nodo) y calendarios actuales quedan intactos bajo esa estructura.
-- El `order` de OrgLevel pasa a ser único POR ESTRUCTURA; el default de calendarios
-- pasa a ser POR ESTRUCTURA (índices únicos parciales, que Prisma no expresa).

-- 1) Tabla de estructuras.
CREATE TABLE "OrgStructure" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reportOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "OrgStructure_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrgStructure_key_key" ON "OrgStructure"("key");
CREATE INDEX "OrgStructure_deletedAt_idx" ON "OrgStructure"("deletedAt");
-- Exactamente UNA estructura por defecto (índice único parcial).
CREATE UNIQUE INDEX "OrgStructure_isDefault_unique" ON "OrgStructure"("isDefault") WHERE "isDefault" AND "deletedAt" IS NULL;

-- 2) Insertar la estructura por defecto que absorbe lo legado.
INSERT INTO "OrgStructure" ("id", "key", "name", "description", "isDefault", "active", "reportOrder", "updatedAt")
VALUES ('org_structure_default', 'default', 'Estructura por defecto', 'Estructura organizacional inicial (migrada). Contiene todos los niveles, nodos y calendarios previos a la habilitación multi-estructura.', true, true, 0, CURRENT_TIMESTAMP);

-- 3) Columnas structureId NULLABLE (para backfill sin violar NOT NULL).
ALTER TABLE "OrgLevel" ADD COLUMN "structureId" TEXT;
ALTER TABLE "OrgNode" ADD COLUMN "structureId" TEXT;
ALTER TABLE "OperationalCalendar" ADD COLUMN "structureId" TEXT;
ALTER TABLE "FiscalCalendar" ADD COLUMN "structureId" TEXT;

-- 4) Backfill: TODO lo existente apunta a la estructura por defecto.
UPDATE "OrgLevel" SET "structureId" = 'org_structure_default' WHERE "structureId" IS NULL;
UPDATE "OrgNode" SET "structureId" = 'org_structure_default' WHERE "structureId" IS NULL;
UPDATE "OperationalCalendar" SET "structureId" = 'org_structure_default' WHERE "structureId" IS NULL;
UPDATE "FiscalCalendar" SET "structureId" = 'org_structure_default' WHERE "structureId" IS NULL;

-- 5) Ahora sí, NOT NULL.
ALTER TABLE "OrgLevel" ALTER COLUMN "structureId" SET NOT NULL;
ALTER TABLE "OrgNode" ALTER COLUMN "structureId" SET NOT NULL;
ALTER TABLE "OperationalCalendar" ALTER COLUMN "structureId" SET NOT NULL;
ALTER TABLE "FiscalCalendar" ALTER COLUMN "structureId" SET NOT NULL;

-- 6) Reescopar la unicidad del `order` de OrgLevel: global -> por estructura.
DROP INDEX "OrgLevel_order_key";
CREATE UNIQUE INDEX "OrgLevel_structureId_order_key" ON "OrgLevel"("structureId", "order");

-- 7) Índices de structureId.
CREATE INDEX "OrgLevel_structureId_idx" ON "OrgLevel"("structureId");
CREATE INDEX "OrgNode_structureId_idx" ON "OrgNode"("structureId");
CREATE INDEX "OperationalCalendar_structureId_idx" ON "OperationalCalendar"("structureId");
CREATE INDEX "FiscalCalendar_structureId_idx" ON "FiscalCalendar"("structureId");

-- 8) Default de calendarios: de "uno global" (antes solo por código) a uno POR ESTRUCTURA
--    (índice único parcial). Los datos legados ya tienen <=1 default global, así que tras
--    el backfill hay <=1 por estructura: el índice no falla.
CREATE UNIQUE INDEX "OperationalCalendar_structureId_default_unique" ON "OperationalCalendar"("structureId") WHERE "isDefault" AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "FiscalCalendar_structureId_default_unique" ON "FiscalCalendar"("structureId") WHERE "isDefault" AND "deletedAt" IS NULL;

-- 9) Claves foráneas (onDelete: Cascade, como el schema).
ALTER TABLE "OrgLevel" ADD CONSTRAINT "OrgLevel_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "OrgStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrgNode" ADD CONSTRAINT "OrgNode_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "OrgStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalCalendar" ADD CONSTRAINT "OperationalCalendar_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "OrgStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FiscalCalendar" ADD CONSTRAINT "FiscalCalendar_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "OrgStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;
