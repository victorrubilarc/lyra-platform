-- Fase 2.6 (Bitácoras): columnas de lectura/review-by-exception. 100% ADITIVA.
--  1) LogEntry.entryNumber  — folio humano correlativo (backfill ORDENADO por recordedAt).
--  2) LogEntrySection.requiresSignature — estampado de la definición congelada
--     (backfill desde TemplateSection) para filtrar "firmas pendientes" en SQL.
--  3) LogEntryValue.thresholdBand — banda ISA-18.2 del valor (el backfill se hace
--     con `db:backfill-threshold-bands`, que reusa la fuente única de @lyra/contracts).
--  4) Índices que faltaban para los filtros del listado (autoría, estado de flujo).

-- CreateEnum
CREATE TYPE "ThresholdBand" AS ENUM ('WARN', 'CRIT');

-- 1) Folio: columna nullable → backfill ordenado → secuencia → default → NOT NULL.
--    (No se usa SERIAL directo: asignaría el folio en orden físico de la tabla.)
ALTER TABLE "LogEntry" ADD COLUMN "entryNumber" INTEGER;

UPDATE "LogEntry" e
SET "entryNumber" = numbered.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "recordedAt" ASC, id ASC) AS rn
  FROM "LogEntry"
) numbered
WHERE e.id = numbered.id;

CREATE SEQUENCE "LogEntry_entryNumber_seq";
SELECT setval('"LogEntry_entryNumber_seq"', COALESCE((SELECT MAX("entryNumber") FROM "LogEntry"), 0) + 1, false);
ALTER TABLE "LogEntry" ALTER COLUMN "entryNumber" SET DEFAULT nextval('"LogEntry_entryNumber_seq"');
ALTER TABLE "LogEntry" ALTER COLUMN "entryNumber" SET NOT NULL;
ALTER SEQUENCE "LogEntry_entryNumber_seq" OWNED BY "LogEntry"."entryNumber";

-- 2) requiresSignature estampado + backfill desde la definición congelada.
ALTER TABLE "LogEntrySection" ADD COLUMN "requiresSignature" BOOLEAN NOT NULL DEFAULT false;

UPDATE "LogEntrySection" s
SET "requiresSignature" = true
FROM "LogEntry" e, "TemplateSection" ts
WHERE s."logEntryId" = e.id
  AND ts."templateVersionId" = e."templateVersionId"
  AND ts."key" = s."sectionKey"
  AND ts."requireSignature" = true;

-- 3) Banda de umbral del valor (null = en rango / no aplica).
ALTER TABLE "LogEntryValue" ADD COLUMN "thresholdBand" "ThresholdBand";

-- CreateIndex
CREATE UNIQUE INDEX "LogEntry_entryNumber_key" ON "LogEntry"("entryNumber");

-- CreateIndex
CREATE INDEX "LogEntry_currentStateKey_idx" ON "LogEntry"("currentStateKey");

-- CreateIndex
CREATE INDEX "LogEntry_createdById_idx" ON "LogEntry"("createdById");

-- CreateIndex
CREATE INDEX "LogEntryValue_thresholdBand_idx" ON "LogEntryValue"("thresholdBand");
