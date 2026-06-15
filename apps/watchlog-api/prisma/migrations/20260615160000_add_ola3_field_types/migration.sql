-- Catálogo de objetos premium — Ola 3 (2026-06-15). Migración ADITIVA: solo
-- agrega valores a los enums FieldType y FieldDataType. Cero ruptura (no toca
-- filas existentes; las plantillas viejas siguen igual). En PostgreSQL 12+ se
-- pueden agregar valores de enum dentro de una transacción mientras no se usen
-- en la misma transacción (aquí solo se declaran). `IF NOT EXISTS` = idempotente.

-- FieldType (capa 1, presentación/widget): ADJUNTO/terreno. Un solo tipo
-- ATTACHMENT discriminado por config.kind (file/photo/audio/sketch) → dataType
-- FILE_ARRAY (descriptor[] de objetos en MinIO). El escaneo QR/código NO agrega
-- tipo: es config.scan sobre TEXT (decode client-side que rellena el valor).
ALTER TYPE "FieldType" ADD VALUE IF NOT EXISTS 'ATTACHMENT';

-- FieldDataType (capa 2, almacenamiento/reporte): FILE_ARRAY (varios objetos
-- almacenados → arreglo de descriptores). FILE (escalar) ya existía como reservado.
ALTER TYPE "FieldDataType" ADD VALUE IF NOT EXISTS 'FILE_ARRAY';
