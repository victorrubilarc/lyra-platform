-- Fase 2.1.2 — Layout de formulario en grilla responsiva (ancho por campo).
-- Hint de PRESENTACIÓN puro en la versión INMUTABLE del campo. Aditivo: NOT NULL
-- con DEFAULT 'FULL' rellena las filas existentes en el mismo ALTER (sin backfill),
-- preservando el render de una columna actual (cero ruptura).

-- CreateEnum
CREATE TYPE "LayoutWidth" AS ENUM ('FULL', 'HALF', 'THIRD');

-- AlterTable
ALTER TABLE "TemplateField" ADD COLUMN "layoutWidth" "LayoutWidth" NOT NULL DEFAULT 'FULL';
