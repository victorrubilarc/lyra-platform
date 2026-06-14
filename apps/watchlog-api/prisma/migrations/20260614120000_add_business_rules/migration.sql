-- Motor de reglas de negocio (Req-7, primer corte) — ADITIVO, sin backfill.
--
-- Ambas columnas viven en la versión INMUTABLE de la plantilla (GxP): cambiar
-- una fórmula/regla = nueva versión auditada.
--
--  - TemplateField.computed  : { expression } del campo FORMULADO (read-only,
--    valor derivado/estampado). NULL = campo tecleado normal.
--  - TemplateVersion.rules   : array de reglas de validación CRUZADA
--    {key, when, severity, message}. Default '[]' = sin reglas (cero ruptura).

ALTER TABLE "TemplateField" ADD COLUMN "computed" JSONB;

ALTER TABLE "TemplateVersion" ADD COLUMN "rules" JSONB NOT NULL DEFAULT '[]';
