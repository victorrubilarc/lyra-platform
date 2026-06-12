-- Ventana de edición 2.7.2: la duración pasa de HORAS a MINUTOS (unidad canónica;
-- la UI permite ingresar minutos u horas). Renombra columnas, CONVIERTE los valores
-- existentes (horas * 60) y ajusta los check constraints (0..525600 = 365 días).

-- Template ----------------------------------------------------------------------
ALTER TABLE "Template" DROP CONSTRAINT IF EXISTS "Template_editWindowHours_range";
ALTER TABLE "Template" RENAME COLUMN "editWindowHours" TO "editWindowMinutes";
UPDATE "Template" SET "editWindowMinutes" = "editWindowMinutes" * 60 WHERE "editWindowMinutes" IS NOT NULL;
ALTER TABLE "Template" ADD CONSTRAINT "Template_editWindowMinutes_range"
  CHECK ("editWindowMinutes" IS NULL OR ("editWindowMinutes" >= 0 AND "editWindowMinutes" <= 525600));

-- SystemSettings ----------------------------------------------------------------
ALTER TABLE "SystemSettings" DROP CONSTRAINT IF EXISTS "SystemSettings_editWindowHours_range";
ALTER TABLE "SystemSettings" RENAME COLUMN "editWindowHours" TO "editWindowMinutes";
UPDATE "SystemSettings" SET "editWindowMinutes" = "editWindowMinutes" * 60 WHERE "editWindowMinutes" IS NOT NULL;
ALTER TABLE "SystemSettings" ADD CONSTRAINT "SystemSettings_editWindowMinutes_range"
  CHECK ("editWindowMinutes" IS NULL OR ("editWindowMinutes" >= 0 AND "editWindowMinutes" <= 525600));
