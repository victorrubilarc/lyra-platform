-- Workflow SLA + atrasos (2026-06-13) — migración ADITIVA.
--
-- 1) SLA de permanencia por ESTADO: minutos canónicos, nullable (null = sin SLA).
--    Viaja en la versión congelada del flujo ⇒ los registros históricos conservan
--    el SLA vigente cuando se crearon. Check 1..525600 (365 días) como la ventana
--    de edición 2.7.2.
ALTER TABLE "WorkflowState" ADD COLUMN "maxStayMinutes" INTEGER;
ALTER TABLE "WorkflowState"
  ADD CONSTRAINT "WorkflowState_maxStayMinutes_range"
  CHECK ("maxStayMinutes" IS NULL OR ("maxStayMinutes" >= 1 AND "maxStayMinutes" <= 525600));

-- 2) Momento de entrada al estado actual: base de cómputo del atraso. Aditivo,
--    evita la subconsulta MAX(transición).
ALTER TABLE "LogEntry" ADD COLUMN "currentStateSince" TIMESTAMP(3);

-- Backfill: la última transición ejecutada marca cuándo se entró al estado actual;
-- si no hubo transiciones, el registro sigue en el estado inicial desde recordedAt.
UPDATE "LogEntry" le
SET "currentStateSince" = COALESCE(
  (SELECT MAX(t."occurredAt") FROM "LogEntryTransition" t WHERE t."logEntryId" = le."id"),
  le."recordedAt"
);

-- Índice para el cómputo de "Retrasadas" (filtra DRAFT con SLA vencido). El join a
-- WorkflowState usa el índice existente de la versión congelada.
CREATE INDEX "LogEntry_currentStateSince_idx" ON "LogEntry" ("currentStateSince");
