-- Fase 2.8.1a — Bitácoras: grilla orientada a contenido (MVP).
-- (1) Pool de campos candidatos de resumen como GOBERNANZA VIVA en el contenedor
--     mutable `Template` (keyed por el `key` estable del campo = el mismo que usa
--     LogEntryValue.fieldKey). Aditiva: array vacío por defecto = comportamiento
--     actual (grilla sin valores). Se guarda vía PATCH /templates/:id ("Guardar
--     configuración"), sin republicar la versión inmutable.
ALTER TABLE "Template" ADD COLUMN "gridFieldKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- (2) Búsqueda por contenido sobre los valores (value::text ILIKE %q%). Índice GIN
--     trigram para que el ILIKE no degrade a seq-scan al crecer el volumen on-prem.
--     pg_trgm es estándar en PostgreSQL; IF NOT EXISTS = idempotente.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "LogEntryValue_value_trgm_idx" ON "LogEntryValue" USING gin ((value::text) gin_trgm_ops);
