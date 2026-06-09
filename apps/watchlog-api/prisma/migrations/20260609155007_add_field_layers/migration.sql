-- Fase 2.1.1 — Endurecimiento de modelo (ADITIVO, no destructivo).
-- Modelo de campo en 3 capas: se añaden la capa 2 (`dataType`, derivada del `type`)
-- y la capa 3 (`semanticRole`, opcional). El backfill de `dataType` deriva del
-- `type` existente; ningún dato se altera ni se pierde.

-- CreateEnum
CREATE TYPE "FieldDataType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'DATE', 'DATETIME', 'TIME', 'CODE', 'CODE_ARRAY', 'REFERENCE', 'FILE', 'GEO', 'COMPUTED');

-- CreateEnum
CREATE TYPE "FieldSemanticRole" AS ENUM ('EFFECTIVE_DATE', 'TITLE', 'PRIMARY_EQUIPMENT', 'SEVERITY_DRIVER');

-- AlterTable: se agregan nullable primero para poder backfillear filas existentes.
ALTER TABLE "TemplateField" ADD COLUMN "dataType" "FieldDataType";
ALTER TABLE "TemplateField" ADD COLUMN "semanticRole" "FieldSemanticRole";

-- Backfill de `dataType` desde el `type` de presentación (fuente: deriveDataType).
UPDATE "TemplateField" SET "dataType" = CASE "type"
  WHEN 'NUMBER'      THEN 'NUMBER'::"FieldDataType"
  WHEN 'TEXT'        THEN 'STRING'::"FieldDataType"
  WHEN 'TEXTAREA'    THEN 'STRING'::"FieldDataType"
  WHEN 'SELECT'      THEN 'CODE'::"FieldDataType"
  WHEN 'MULTISELECT' THEN 'CODE_ARRAY'::"FieldDataType"
  WHEN 'BOOLEAN'     THEN 'BOOLEAN'::"FieldDataType"
  WHEN 'DATE'        THEN 'DATE'::"FieldDataType"
  WHEN 'DATETIME'    THEN 'DATETIME'::"FieldDataType"
  WHEN 'SEVERITY'    THEN 'CODE'::"FieldDataType"
  WHEN 'SIGNATURE'   THEN 'REFERENCE'::"FieldDataType"
END
WHERE "dataType" IS NULL;

-- `dataType` pasa a requerido (en adelante lo provee siempre la aplicación).
ALTER TABLE "TemplateField" ALTER COLUMN "dataType" SET NOT NULL;
