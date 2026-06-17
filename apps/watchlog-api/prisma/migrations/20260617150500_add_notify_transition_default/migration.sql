-- Notificaciones avanzadas — Fase A: default de sistema para transiciones sin config.
-- ADITIVA. true = conducta clásica (avisar a roles del estado destino) ⇒ no rompe nada.
ALTER TABLE "SystemSettings"
  ADD COLUMN "notifyTransitionDefaultDestinationRoles" BOOLEAN NOT NULL DEFAULT true;
