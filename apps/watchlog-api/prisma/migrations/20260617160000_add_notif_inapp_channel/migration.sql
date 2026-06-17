-- Notificaciones avanzadas — Fase B: canal IN-APP (la "campanita") + tiempo real.
-- Migración ADITIVA. No toca datos existentes.

-- (a) Nuevo valor del enum de canal. IN-APP = notificación in-app por destinatario.
ALTER TYPE "NotificationChannel" ADD VALUE IF NOT EXISTS 'INAPP';

-- (b) Estado leído/no leído de una fila in-app (null = NO leída). Sin uso en EMAIL.
ALTER TABLE "NotificationOutbox" ADD COLUMN "readAt" TIMESTAMP(3);

-- (c) Índice para la bandeja/campanita de un usuario ("mis no leídas" + listado por canal).
CREATE INDEX "NotificationOutbox_recipientUserId_channel_readAt_idx"
  ON "NotificationOutbox"("recipientUserId", "channel", "readAt");
