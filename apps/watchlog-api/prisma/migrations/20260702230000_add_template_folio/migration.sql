-- Folio de documento CONFIGURABLE por plantilla (folio-por-plantilla, 2026-07-02).
-- Aditiva y nullable: cero regresión (plantillas sin esquema siguen usando el
-- correlativo global entryNumber). `Template.folioScheme` = esquema (gobernanza viva);
-- `LogEntry.folio` = folio humano emitido al sellar; `LogEntry.folioSeqKey` = clave de
-- secuencia usada (auditoría del contador gapless).

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "folioScheme" JSONB;

-- AlterTable
ALTER TABLE "LogEntry" ADD COLUMN     "folio" TEXT,
ADD COLUMN     "folioSeqKey" TEXT;
