-- Escalabilidad del listado de Bitácoras: índices COMPUESTOS para la paginación
-- keyset (orden + desempate por id). El orden por defecto es recordedAt desc y NO
-- tenía índice (la tabla solo tenía effectiveAt simple) ⇒ a millones de filas el
-- ordenamiento era un full sort. Con estos índices cada página es un seek por índice,
-- independiente del total. Aditivo (solo crea índices; sin cambios de tipo).
CREATE INDEX "LogEntry_recordedAt_id_idx" ON "LogEntry"("recordedAt", "id");
CREATE INDEX "LogEntry_effectiveAt_id_idx" ON "LogEntry"("effectiveAt", "id");
