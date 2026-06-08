-- CreateTable
CREATE TABLE "EquipmentCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isoRef" TEXT,
    "description" TEXT,
    "reportOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "tag" TEXT,
    "description" TEXT,
    "categoryId" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "criticality" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reportOrder" INTEGER NOT NULL DEFAULT 0,
    "orgNodeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalReference" (
    "id" TEXT NOT NULL,
    "orgNodeId" TEXT,
    "equipmentId" TEXT,
    "systemType" TEXT NOT NULL,
    "externalId" TEXT,
    "externalPath" TEXT,
    "endpoint" TEXT,
    "metadata" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_tag_key" ON "Equipment"("tag");

-- CreateIndex
CREATE INDEX "Equipment_orgNodeId_idx" ON "Equipment"("orgNodeId");

-- CreateIndex
CREATE INDEX "Equipment_categoryId_idx" ON "Equipment"("categoryId");

-- CreateIndex
CREATE INDEX "Equipment_deletedAt_idx" ON "Equipment"("deletedAt");

-- CreateIndex
CREATE INDEX "ExternalReference_orgNodeId_idx" ON "ExternalReference"("orgNodeId");

-- CreateIndex
CREATE INDEX "ExternalReference_equipmentId_idx" ON "ExternalReference"("equipmentId");

-- CreateIndex
CREATE INDEX "ExternalReference_systemType_idx" ON "ExternalReference"("systemType");

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EquipmentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalReference" ADD CONSTRAINT "ExternalReference_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalReference" ADD CONSTRAINT "ExternalReference_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
--  Endurecimiento que Prisma no expresa en el schema (añadido manualmente)
-- ===========================================================================

-- ExternalReference tiene dueño polimórfico: debe pertenecer a un nodo O a un
-- equipo, nunca a ambos ni a ninguno. Lo garantiza la base, no solo la app
-- (mismo patrón que Scope).
ALTER TABLE "ExternalReference" ADD CONSTRAINT "ExternalReference_owner_exclusive_chk"
  CHECK (("orgNodeId" IS NOT NULL)::int + ("equipmentId" IS NOT NULL)::int = 1);

-- Criticidad acotada a 1–5 cuando está presente (RCM / ISO 14224).
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_criticality_range_chk"
  CHECK ("criticality" IS NULL OR ("criticality" >= 1 AND "criticality" <= 5));
