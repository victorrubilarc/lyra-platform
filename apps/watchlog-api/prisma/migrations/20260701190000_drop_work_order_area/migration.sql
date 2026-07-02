-- Elimina el catálogo `Area` de OT y su enlace N:N. Decisión 2026-07-01: la
-- ubicación la da la estructura organizacional (OrgNode, que incluye un nivel
-- "Área"); un catálogo plano "Área" aparte duplicaba la jerarquía y confundía.
-- Los EAM líderes (SAP PM Functional Location, Maximo Location) usan la jerarquía
-- de ubicación para eso. La disciplina sigue en `Specialty`.

-- DropForeignKey
ALTER TABLE "WorkOrderArea" DROP CONSTRAINT "WorkOrderArea_areaId_fkey";

-- DropForeignKey
ALTER TABLE "WorkOrderArea" DROP CONSTRAINT "WorkOrderArea_workOrderId_fkey";

-- DropTable
DROP TABLE "WorkOrderArea";

-- DropTable
DROP TABLE "Area";
