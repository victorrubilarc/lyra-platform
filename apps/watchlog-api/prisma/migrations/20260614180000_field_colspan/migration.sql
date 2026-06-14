-- Fase 2.1.3 — Layout WYSIWYG: granularidad de grilla de 12 columnas.
-- Reemplaza el enum `LayoutWidth {FULL,HALF,THIRD}` (2.1.2) por un entero
-- `colSpan` 1..12 (estilo SAP Fiori / Bootstrap) para permitir el redimensionado
-- fino por arrastre. Migración hacia adelante (la de 2.1.2 es inmutable):
-- agrega colSpan, convierte el valor existente, y elimina la columna y el tipo viejos.

-- AlterTable: nueva columna con default ancho completo.
ALTER TABLE "TemplateField" ADD COLUMN "colSpan" INTEGER NOT NULL DEFAULT 12;

-- Conversión del enum a span: FULL→12, HALF→6, THIRD→4.
UPDATE "TemplateField" SET "colSpan" = CASE "layoutWidth"
  WHEN 'HALF' THEN 6
  WHEN 'THIRD' THEN 4
  ELSE 12
END;

-- DropColumn + DropEnum (el hint viejo).
ALTER TABLE "TemplateField" DROP COLUMN "layoutWidth";
DROP TYPE "LayoutWidth";

-- Cota dura del span (defensa en profundidad; el contrato Zod también valida 1..12).
ALTER TABLE "TemplateField" ADD CONSTRAINT "TemplateField_colSpan_check" CHECK ("colSpan" BETWEEN 1 AND 12);
