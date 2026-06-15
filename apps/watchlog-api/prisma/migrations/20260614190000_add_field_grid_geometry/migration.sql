-- Fase 2.1.7 — Geometría EXPLÍCITA del campo en el lienzo de posicionamiento libre.
-- Aditiva y NULLABLE: null = plantilla legacy (el editor deriva la geometría del
-- orden + colSpan y la persiste al guardar). El ancho sigue siendo colSpan (= w).
ALTER TABLE "TemplateField" ADD COLUMN "gridX" INTEGER;
ALTER TABLE "TemplateField" ADD COLUMN "gridY" INTEGER;
ALTER TABLE "TemplateField" ADD COLUMN "gridH" INTEGER;

-- Cotas coherentes con los esquemas Zod (gridXSchema 0..11, gridY >=0, gridH >=1).
ALTER TABLE "TemplateField"
  ADD CONSTRAINT "TemplateField_gridX_range" CHECK ("gridX" IS NULL OR ("gridX" >= 0 AND "gridX" <= 11));
ALTER TABLE "TemplateField"
  ADD CONSTRAINT "TemplateField_gridY_range" CHECK ("gridY" IS NULL OR "gridY" >= 0);
ALTER TABLE "TemplateField"
  ADD CONSTRAINT "TemplateField_gridH_range" CHECK ("gridH" IS NULL OR "gridH" >= 1);
