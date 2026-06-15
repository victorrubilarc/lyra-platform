-- Catálogo de objetos premium — Ola 1 (2026-06-15). Migración ADITIVA: solo
-- agrega valores a los enums FieldType y FieldDataType. Cero ruptura (no toca
-- filas existentes; las plantillas viejas siguen igual). En PostgreSQL 12+ se
-- pueden agregar valores de enum dentro de una transacción mientras no se usen
-- en la misma transacción (aquí solo se declaran). `IF NOT EXISTS` = idempotente.

-- FieldType (capa 1, presentación/widget): 11 objetos nuevos de la Ola 1.
ALTER TYPE "FieldType" ADD VALUE IF NOT EXISTS 'CONFORMITY';
ALTER TYPE "FieldType" ADD VALUE IF NOT EXISTS 'RATING';
ALTER TYPE "FieldType" ADD VALUE IF NOT EXISTS 'TIME';
ALTER TYPE "FieldType" ADD VALUE IF NOT EXISTS 'DURATION';
ALTER TYPE "FieldType" ADD VALUE IF NOT EXISTS 'RANGE';
ALTER TYPE "FieldType" ADD VALUE IF NOT EXISTS 'HEADING';
ALTER TYPE "FieldType" ADD VALUE IF NOT EXISTS 'STATIC_TEXT';
ALTER TYPE "FieldType" ADD VALUE IF NOT EXISTS 'DIVIDER';
ALTER TYPE "FieldType" ADD VALUE IF NOT EXISTS 'NOTICE';
ALTER TYPE "FieldType" ADD VALUE IF NOT EXISTS 'PROCEDURE_LINK';
ALTER TYPE "FieldType" ADD VALUE IF NOT EXISTS 'REFERENCE_IMAGE';

-- FieldDataType (capa 2, almacenamiento/reporte): RANGE (estructurado {from,to})
-- y LAYOUT (objeto de presentación que el llenado ignora). TIME ya existía.
ALTER TYPE "FieldDataType" ADD VALUE IF NOT EXISTS 'RANGE';
ALTER TYPE "FieldDataType" ADD VALUE IF NOT EXISTS 'LAYOUT';
