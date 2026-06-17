-- Épico Notificaciones avanzadas — Fase A (disparo por transición + plantillas por bitácora)
-- Migración ADITIVA. No toca datos existentes.

-- (a) Config de NOTIFICACIÓN por transición (regla de destinatarios + plantilla opcional),
--     validada por transitionNotifyConfigSchema, CONGELADA con la versión del flujo.
ALTER TABLE "WorkflowTransition" ADD COLUMN "notifyConfig" JSONB;

-- (b) ÁMBITO por bitácora en las plantillas de notificación (null = genérica/por defecto).
ALTER TABLE "NotificationTemplate" ADD COLUMN "templateId" TEXT;

-- Reemplaza el unique (eventKey, locale, channel) por el de 4 columnas (incluye el ámbito):
-- permite una genérica + N específicas por bitácora para el mismo evento/locale/canal.
DROP INDEX "NotificationTemplate_eventKey_locale_channel_key";
CREATE UNIQUE INDEX "NotificationTemplate_eventKey_locale_channel_templateId_key"
  ON "NotificationTemplate"("eventKey", "locale", "channel", "templateId");

-- La GENÉRICA (templateId NULL) debe ser ÚNICA por (evento, locale, canal). Postgres trata
-- los NULL como distintos en un unique normal, así que se fuerza con un índice PARCIAL.
CREATE UNIQUE INDEX "NotificationTemplate_generic_key"
  ON "NotificationTemplate"("eventKey", "locale", "channel")
  WHERE "templateId" IS NULL;

CREATE INDEX "NotificationTemplate_templateId_idx" ON "NotificationTemplate"("templateId");
