-- Catálogo de objetos premium — Ola 4 (2026-06-15). Migración ADITIVA: solo
-- agrega valores a los enums FieldType y FieldDataType. Cero ruptura (no toca
-- filas existentes; las plantillas viejas siguen igual). En PostgreSQL 12+ se
-- pueden agregar valores de enum dentro de una transacción mientras no se usen
-- en la misma transacción (aquí solo se declaran). `IF NOT EXISTS` = idempotente.

-- FieldType (capa 1, presentación/widget): objetos ESTRUCTURADOS / repetibles.
-- TABLE = tabla/grilla repetible (filas dinámicas) o grupo repetible (layout
-- cards); MATRIX = matriz parámetro×turno (filas y columnas fijas, celda uniforme).
-- Las columnas/ejes son sub-campos escalares definidos en config.
ALTER TYPE "FieldType" ADD VALUE IF NOT EXISTS 'TABLE';
ALTER TYPE "FieldType" ADD VALUE IF NOT EXISTS 'MATRIX';

-- FieldDataType (capa 2, almacenamiento/reporte): TABLE (valor = array de filas
-- Record<colKey, escalar>) y MATRIX (valor = Record<rowKey, Record<colKey, escalar>>).
ALTER TYPE "FieldDataType" ADD VALUE IF NOT EXISTS 'TABLE';
ALTER TYPE "FieldDataType" ADD VALUE IF NOT EXISTS 'MATRIX';
