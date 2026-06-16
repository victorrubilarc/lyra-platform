-- Fase 2.3.1 — Worklist de rondas: rol responsable del horario (aditiva, idempotente).
-- El horario es del PUESTO (work center/responsible role de SAP PM/Maximo); el worklist
-- "Mis rondas" filtra por rol responsable ∈ roles del usuario. Null = fallback nodo+turno.
-- Se lee EN VIVO (no se denormaliza al RoundOccurrence): reasignar re-enruta pendientes.

-- AddColumn (idempotente)
ALTER TABLE "LogSchedule" ADD COLUMN IF NOT EXISTS "responsibleRoleId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LogSchedule_responsibleRoleId_idx" ON "LogSchedule"("responsibleRoleId");

-- AddForeignKey (SetNull: borrar el rol deja el horario sin responsable, no lo elimina)
DO $$ BEGIN
  ALTER TABLE "LogSchedule" ADD CONSTRAINT "LogSchedule_responsibleRoleId_fkey" FOREIGN KEY ("responsibleRoleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
